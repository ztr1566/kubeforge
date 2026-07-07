#!/usr/bin/env node

'use strict';

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  console.error('Error: NODE_TLS_REJECT_UNAUTHORIZED is set to 0. Refusing to run with TLS verification disabled.');
  process.exit(1);
}

if (process.env.KUBEFORGE_SELFTEST === '1') {
  // ponytail: minimal coverage of buildUpgradePath. Run with:
  //   KUBEFORGE_SELFTEST=1 node src/index.js
  const assert = require('assert');
  const all = ['v1.37.0', 'v1.36.2', 'v1.35.5', 'v1.34.9', 'v1.33.4'];
  assert.deepStrictEqual(buildUpgradePath('v1.34.9', 'v1.35.6', all), ['v1.35.6']);
  assert.deepStrictEqual(buildUpgradePath('v1.34.9', 'v1.36.2', all), ['v1.35.5', 'v1.36.2']);
  assert.deepStrictEqual(buildUpgradePath('v1.34.9', 'v1.37.0', all), ['v1.35.5', 'v1.36.2', 'v1.37.0']);
  assert.throws(() => buildUpgradePath('v1.34.9', 'v1.34.5', all), /not newer/);
  assert.throws(() => buildUpgradePath('v1.34.9', 'v1.36.2', ['v1.36.2', 'v1.34.9']), /No available patch for v1\.35/);
  process.stdout.write('KUBEFORGE_SELFTEST: buildUpgradePath OK\n');
  process.exit(0);
}

const readline = require('readline');
const { version } = require('../package.json');
const { detectHardware } = require('./hardware');
const { validateHardware } = require('./validate');
const { printReport } = require('./ui');
const swapModule = require('./swap');
const kernelModule = require('./kernel');
const sysctlModule = require('./sysctl');
const containerdModule = require('./containerd');
const versionModule = require('./version');
const repoModule = require('./repo');
const kubeInstallModule = require('./kube-install');
const networkModule = require('./network');
const bootstrapModule = require('./bootstrap');
const stateModule = require('./state');
const deleteModule = require('./delete');

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`kubeforge v${version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`kubeforge v${version}\n\n`);
  process.stdout.write('Usage: kubeforge <command> [options]\n\n');
  process.stdout.write('Commands:\n');
  process.stdout.write('  install    Provision this node for a kubeadm cluster\n');
  process.stdout.write('  upgrade    Upgrade Kubernetes binaries on an already-provisioned node\n');
  process.stdout.write('  status     Show current Kubernetes version and cluster status\n');
  process.stdout.write('  delete     Completely remove Kubernetes from this node\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --version  Print version and exit\n');
  process.stdout.write('  --help     Print this help message and exit\n');
  process.stdout.write('  --force    Bypass hardware checks or re-install over existing state\n');
  process.exit(0);
}

if (args[0] === 'prepare') {
  process.stderr.write('Warning: "prepare" is deprecated. Use "install" instead.\n');
  runInstall();
} else if (args[0] === 'install') {
  runInstall();
} else if (args[0] === 'upgrade') {
  runUpgrade();
} else if (args[0] === 'status') {
  runStatus();
} else if (args[0] === 'delete') {
  runDelete();
} else {
  process.stderr.write(`kubeforge v${version}: unknown or missing command. Run 'kubeforge --help' for usage.\n`);
  process.exit(1);
}

function selectRole() {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write('\n');
    process.stdout.write('Select node role:\n');
    process.stdout.write('  1. Master Node\n');
    process.stdout.write('  2. Worker Node\n');

    rl.question('\nEnter choice [1-2]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '1') {
        resolve('master');
      } else if (trimmed === '2') {
        resolve('worker');
      } else {
        reject(new Error(`Invalid selection: "${trimmed}". Please choose 1 or 2.`));
      }
    });

    rl.on('SIGINT', () => {
      rl.close();
      resolve(null);
    });
  });
}

async function runInstall() {
  if (process.getuid() !== 0) {
    process.stderr.write('Error: kubeforge must be run as root. Use: sudo kubeforge install\n');
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  let previousVersion = null;
  try {
    if (!force && stateModule.isCompleted()) {
      process.stderr.write('Error: KubeForge already installed. Use --force to re-install.\n');
      process.exit(1);
    }
    if (force) {
      try {
        const currentState = stateModule.load();
        if (currentState && currentState.completed) {
          previousVersion = currentState.kubernetesVersion;
        }
      } catch (err) {
        // Ignore
      }
      if (!previousVersion) {
        const detected = stateModule.detectInstalledVersion();
        if (detected) {
          previousVersion = detected;
          process.stdout.write(`Detected installed Kubernetes ${detected} (no state file found)\n`);
        }
      }
      // Tear down existing cluster and clean up before re-install
      kubeInstallModule.cleanupExistingCluster();
      stateModule.clear();
    }
  } catch (err) {
    process.stderr.write(`Error reading state: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write('KubeForge — node provisioning\n');
  if (previousVersion) {
    process.stdout.write(`Previous installation: ${previousVersion}\n`);
  }

  const role = await selectRole();

  if (role === null) {
    process.stdout.write('\nOperation cancelled.\n');
    process.exit(0);
  }

  let versions, selectedVersion;
  try {
    versions = await versionModule.fetchVersionChoices();
    if (force) {
      // ponytail: --force implies "reinstall with the latest, no prompts"
      selectedVersion = versions[0];
      process.stdout.write(`Using latest version: ${selectedVersion}\n`);
    } else {
      if (previousVersion && !versions.includes(previousVersion)) {
        versions.unshift(previousVersion);
      }
      selectedVersion = await versionModule.selectVersion(versions);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const hardware = detectHardware();
  process.stdout.write(`\nDetected hardware: ${hardware.cpus} CPUs, ${hardware.ramGB} GB RAM, swap ${hardware.swapEnabled ? 'enabled' : 'disabled'}\n\n`);

  const result = validateHardware(role, hardware);
  printReport(role, result);
  process.stdout.write('\n');

  if (!result.allPassed) {
    if (!force) {
      process.stdout.write('Aborting. Use --force to override.\n');
      process.exit(1);
    }
    process.stdout.write('\u26A0 Proceeding despite failed checks (--force)\n');
  }

  const stages = [
    { name: 'Swap Management',        execute: swapModule.execute },
    { name: 'Kernel Modules',         execute: kernelModule.execute },
    { name: 'Sysctl Networking',      execute: sysctlModule.execute },
    { name: 'Containerd CRI',         execute: containerdModule.execute },
    { name: 'Kubernetes Repository',  execute: () => repoModule.execute({ version: selectedVersion }) },
    { name: 'Kubernetes Binaries',    execute: () => kubeInstallModule.execute({ version: selectedVersion }) },
    { name: 'Flannel Network Prep',   execute: () => networkModule.execute({ version: selectedVersion, role }) },
    { name: 'Cluster Bootstrap',      execute: () => bootstrapModule.execute({ version: selectedVersion, role }) },
  ];

  for (const stage of stages) {
    process.stdout.write(`Applying ${stage.name} configuration...\n`);
    try {
      await stage.execute();
    } catch (err) {
      process.stderr.write(`Error in ${stage.name}: ${err.message}\n`);
      process.exit(1);
    }
  }

  try {
    stateModule.markInstalled({ version: selectedVersion, role });
  } catch (err) {
    process.stderr.write(`Warning: Failed to save state: ${err.message}\n`);
  }

  if (role === 'master') {
    process.stdout.write('\u2714 Cluster bootstrapped successfully. Node is officially READY.\n');
  } else {
    process.stdout.write('\u2714 Node provisioning complete. Ready for kubeadm join.\n');
  }
  process.exit(0);
}

function runKubectlOrThrow(cmd) {
  const { execSync } = require('child_process');
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(cmd + ' failed: ' + stderr);
  }
}

function runInheritedOrThrow(cmd) {
  const { execSync } = require('child_process');
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(cmd + ' failed: ' + stderr);
  }
}

function getNodeName() {
  const { execSync } = require('child_process');
  try {
    const output = execSync('kubectl get nodes -o jsonpath="{.items[0].metadata.name}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.replace(/"/g, '').trim();
  } catch (err) {
    throw new Error('Failed to determine node name: ' + (err.stderr ? err.stderr.toString().trim() : err.message));
  }
}

function drainNode() {
  const nodeName = getNodeName();
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 10000;
  const { execSync } = require('child_process');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      process.stdout.write(`Draining node ${nodeName}${attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : ''}...\n`);
      runKubectlOrThrow('kubectl drain ' + nodeName + ' --ignore-daemonsets --delete-emptydir-data --force');
      return;
    } catch (err) {
      const isConnRefused = /connection refused|dial tcp|no such host/i.test(err.message);
      if (isConnRefused && attempt < MAX_RETRIES) {
        process.stdout.write(`Drain failed (API unreachable), retrying in ${RETRY_DELAY_MS / 1000}s...\n`);
        const sleepUntil = Date.now() + RETRY_DELAY_MS;
        while (Date.now() < sleepUntil) { /* busy-wait */ }
        continue;
      }
      throw err;
    }
  }
}

function uncordonNode() {
  const nodeName = getNodeName();
  process.stdout.write(`Uncordoning node ${nodeName}...\n`);
  runKubectlOrThrow('kubectl uncordon ' + nodeName);
}

function waitForApiServer(opts) {
  const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 60000;
  const allowRecovery = !opts || opts.allowRecovery !== false;
  const checkControlPlane = opts && opts.checkControlPlane === true;
  const stabilityCount = (opts && typeof opts.stabilityCount === 'number') ? opts.stabilityCount : 3;
  const { execSync } = require('child_process');
  const RETRY_INTERVAL_MS = 2000;
  const RECOVERY_THRESHOLD_MS = 60000;
  const start = Date.now();
  let recoveryAttempted = false;
  let lastWarn = 0;
  let consecutiveSuccesses = 0;

  while (Date.now() - start < timeoutMs) {
    let checkPassed = false;
    try {
      execSync('kubectl get nodes', { stdio: 'pipe', encoding: 'utf8' });
      checkPassed = true;
    } catch (err) {
      // API not reachable — reset stability counter
      consecutiveSuccesses = 0;
    }

    // If basic check passed and control plane check is requested, verify pods
    if (checkPassed && checkControlPlane) {
      try {
        const podOutput = execSync('kubectl get pods -n kube-system -l tier=control-plane -o jsonpath="{.items[*].status.phase}"', {
          stdio: 'pipe',
          encoding: 'utf8',
        });
        const phases = podOutput.replace(/"/g, '').trim().split(/\s+/).filter(Boolean);
        // All control plane pods must be Running
        if (phases.length === 0 || !phases.every((p) => p === 'Running')) {
          checkPassed = false;
        }
      } catch (err) {
        checkPassed = false;
      }
    }

    if (checkPassed) {
      consecutiveSuccesses++;
      if (consecutiveSuccesses >= stabilityCount) {
        return;
      }
    } else {
      consecutiveSuccesses = 0;
    }

    const elapsed = Date.now() - start;

    if (allowRecovery && elapsed >= RECOVERY_THRESHOLD_MS && !recoveryAttempted) {
      recoveryAttempted = true;
      process.stdout.write('API server not yet ready, attempting kubelet recovery...\n');
      let needsStart = true;
      try {
        const status = execSync('systemctl is-active kubelet', { stdio: 'pipe', encoding: 'utf8' });
        if (status.trim() === 'active') {
          needsStart = false;
        }
      } catch (err) {
        // is-active failed — assume kubelet needs starting
      }
      if (needsStart) {
        try {
          process.stdout.write('Starting kubelet...\n');
          execSync('systemctl start kubelet', { stdio: 'inherit' });
        } catch (startErr) {
          process.stdout.write('Warning: failed to start kubelet; check /etc/kubernetes/manifests/ for static pod definitions\n');
        }
      }
    }

    if (elapsed >= 15000 && elapsed - lastWarn >= 15000) {
      lastWarn = elapsed;
      const needed = stabilityCount - consecutiveSuccesses;
      process.stdout.write(`Waiting for API server... (${Math.floor(elapsed / 1000)}s elapsed, ${needed} more stable check${needed === 1 ? '' : 's'} needed)\n`);
    }

    // ponytail: sync sleep — keeps waitForApiServer sync so drainNode's call site stays sync
    const sleepUntil = Date.now() + RETRY_INTERVAL_MS;
    while (Date.now() < sleepUntil) {
      // busy-wait
    }
  }

  throw new Error(`API server did not become ready within ${Math.floor(timeoutMs / 1000)} seconds`);
}

function kubeadmUpgradePlan() {
  process.stdout.write('Running kubeadm upgrade plan...\n');
  runInheritedOrThrow('kubeadm upgrade plan');
}

function kubeadmUpgradeApply(version, role) {
  const ver = version.replace(/^v/, '');
  if (role === 'master') {
    process.stdout.write(`Running kubeadm upgrade apply v${ver}...\n`);
    runInheritedOrThrow('kubeadm upgrade apply v' + ver + ' --yes');
  } else {
    process.stdout.write('Running kubeadm upgrade node...\n');
    runInheritedOrThrow('kubeadm upgrade node');
  }
}

// --- Multi-step upgrade path helpers ---

function stripV(v) {
  return v.replace(/^v/, '');
}

function compareSemver(a, b) {
  const ap = stripV(a).split('.').map(Number);
  const bp = stripV(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = ap[i] || 0;
    const y = bp[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) {
    throw new Error(`Cannot parse version: "${v}"`);
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

// Build the ordered list of versions to step through to get from `current` to
// `target`. Returns ["vX.Y.Z"] when the gap is 0-1 minor versions; otherwise
// inserts the latest available patch of each intermediate minor. Throws when
// the path can't be built (cross-major, non-newer target, missing intermediate).
function buildUpgradePath(current, target, allVersions) {
  const cur = parseVersion(current);
  const tgt = parseVersion(target);
  if (compareSemver(target, current) <= 0) {
    throw new Error(`Target ${target} is not newer than current ${current}`);
  }
  if (tgt.major !== cur.major) {
    throw new Error(`Cross-major upgrade from ${current} to ${target} is not supported`);
  }
  if (tgt.minor - cur.minor <= 1) {
    return [target];
  }
  const path = [];
  for (let m = cur.minor + 1; m < tgt.minor; m++) {
    const candidate = allVersions.find((v) => {
      const p = parseVersion(v);
      return p.major === cur.major && p.minor === m;
    });
    if (!candidate) {
      throw new Error(`No available patch for v${cur.major}.${m} — cannot build upgrade path from ${current} to ${target}`);
    }
    path.push(candidate);
  }
  path.push(target);
  return path;
}

async function runUpgradeStep(targetVersion, role) {
  const ver = stripV(targetVersion);

  // 0. Pre-drain API server check (require 3 consecutive successes for stability)
  waitForApiServer({ timeoutMs: 120000, allowRecovery: false, stabilityCount: 3 });

  // 1. Drain the node (must precede all binary changes — official kubeadm sequence)
  drainNode();

  // 2. Update repository (must precede kubeadm upgrade so new packages are available)
  process.stdout.write('Applying Kubernetes Repository configuration...\n');
  try {
    await repoModule.execute({ version: targetVersion });
  } catch (err) {
    throw new Error('updating repository: ' + err.message);
  }

  // 3. Upgrade kubeadm binary
  process.stdout.write('Upgrading kubeadm binary...\n');
  try {
    kubeInstallModule.upgradeKubeadm(ver);
  } catch (err) {
    throw new Error('upgrading kubeadm: ' + err.message);
  }

  // 4. kubeadm upgrade plan + apply/node
  if (role === 'master') {
    kubeadmUpgradePlan();
  }
  kubeadmUpgradeApply(targetVersion, role);

  // 5. Upgrade kubelet and kubectl (includes daemon-reload + restart)
  process.stdout.write('Upgrading kubelet and kubectl...\n');
  try {
    kubeInstallModule.upgradeKubeletKubectl(ver);
  } catch (err) {
    // ponytail: node is drained at this point — leave it to the operator
    // to uncordon manually once the issue is fixed.
    process.stderr.write("Node is drained. Run 'kubectl uncordon <node>' manually after fixing the issue.\n");
    throw new Error('upgrading kubelet/kubectl: ' + err.message);
  }

  // 6. Uncordon the node
  uncordonNode();
}

async function runUpgrade() {
  if (process.getuid() !== 0) {
    process.stderr.write('Error: kubeforge must be run as root. Use: sudo kubeforge upgrade\n');
    process.exit(1);
  }

  let state;
  try {
    state = stateModule.load();
  } catch (err) {
    // Ignore and try detection
  }

  if (!state || !state.completed) {
    const detected = stateModule.detectInstalledVersion();
    if (detected) {
      process.stdout.write(`Detected installed Kubernetes ${detected} (no state file found)\n`);
      state = { completed: true, kubernetesVersion: detected };
    } else {
      process.stderr.write('Error: No completed installation found. Run kubeforge install first.\n');
      process.exit(1);
    }
  }

  const currentVersion = state.kubernetesVersion;

  process.stdout.write('KubeForge — Kubernetes upgrade\n');
  process.stdout.write(`Current version: ${currentVersion}\n`);

  let allVersions, newVersion;
  try {
    allVersions = await versionModule.fetchAllVersions();
    const newer = allVersions.filter((v) => compareSemver(v, currentVersion) > 0);
    if (newer.length === 0) {
      process.stdout.write('Already running the latest available version\n');
      process.exit(0);
    }
    newVersion = await versionModule.selectVersion(newer);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const nodeRole = state.nodeRole || 'master';

  let path;
  try {
    path = buildUpgradePath(currentVersion, newVersion, allVersions);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const stepWord = path.length === 1 ? 'step' : 'steps';
  process.stdout.write(`\nUpgrade plan: ${currentVersion} → ${newVersion} (${path.length} ${stepWord})\n`);

  for (let i = 0; i < path.length; i++) {
    const stepVersion = path[i];
    const fromVersion = i === 0 ? currentVersion : path[i - 1];
    process.stdout.write(`\nUpgrading ${fromVersion} → ${stepVersion} (step ${i + 1} of ${path.length})...\n`);
    try {
      await runUpgradeStep(stepVersion, nodeRole);
    } catch (err) {
      process.stderr.write(`\nError during step ${i + 1} of ${path.length} (${fromVersion} → ${stepVersion}): ${err.message}\n`);
      // ponytail: state is intentionally NOT updated to stepVersion — the cluster
      // is still at fromVersion. Retry re-builds the path from there.
      process.stderr.write(`Cluster is currently at ${fromVersion}. Fix the issue and re-run kubeforge upgrade.\n`);
      process.exit(1);
    }
    // Post-step health check: control-plane static pods may not be back up yet
    // after the kubelet restart. Wait for the API server to be reachable AND
    // control plane pods to be Running (up to 3 minutes) before proceeding.
    try {
      waitForApiServer({ timeoutMs: 180000, allowRecovery: true, checkControlPlane: true, stabilityCount: 3 });
    } catch (err) {
      process.stderr.write(`\nError during post-step health check (${fromVersion} → ${stepVersion}): ${err.message}\n`);
      // ponytail: same state-preservation rationale as the step-error path above
      process.stderr.write(`Cluster is currently at ${fromVersion}. Fix the issue and re-run kubeforge upgrade.\n`);
      process.exit(1);
    }
    try {
      stateModule.markUpgraded({ version: stepVersion });
    } catch (err) {
      process.stderr.write(`Warning: Failed to save state: ${err.message}\n`);
    }
  }

  process.stdout.write(`\u2714 Upgraded Kubernetes from ${currentVersion} to ${newVersion} successfully.\n`);
  process.exit(0);
}

async function runDelete() {
  await deleteModule.run();
}

function readKubeletBinaryVersion() {
  const { execSync } = require('child_process');
  const candidates = ['/usr/bin/kubelet', '/usr/bin/kubeadm', '/usr/bin/kubectl'];
  for (const bin of candidates) {
    try {
      const out = execSync(bin + ' --version 2>/dev/null', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const m = out.match(/v?(\d+\.\d+\.\d+)/);
      if (m) {
        return 'v' + m[1];
      }
    } catch (err) {
      // try next binary
    }
  }
  return null;
}

function clusterReachable() {
  const { execSync } = require('child_process');
  try {
    execSync('kubectl get nodes', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (err) {
    return false;
  }
}

async function runStatus() {
  process.stdout.write('KubeForge — cluster status\n\n');

  let state = null;
  try {
    state = stateModule.load();
  } catch (err) {
    // state file unreadable (e.g. non-root) — fall through to detection
  }

  if (!state || !state.completed) {
    const detected = stateModule.detectInstalledVersion();
    if (!detected) {
      process.stdout.write('No Kubernetes installation detected\n');
      process.exit(0);
    }
    state = { kubernetesVersion: detected, nodeRole: 'unknown' };
  }

  const stateVersion = state.kubernetesVersion;
  const role = state.nodeRole || 'unknown';
  const binaryVersion = readKubeletBinaryVersion();

  process.stdout.write(`Kubernetes version: ${stateVersion}`);
  if (binaryVersion && binaryVersion !== stateVersion) {
    process.stdout.write(` (binary reports ${binaryVersion})`);
  }
  process.stdout.write('\n');
  process.stdout.write(`Node role: ${role}\n`);
  process.stdout.write(`Cluster status: ${clusterReachable() ? 'reachable' : 'unreachable'}\n`);
  process.exit(0);
}
