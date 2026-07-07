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
  process.stdout.write(`Draining node ${nodeName}...\n`);
  runKubectlOrThrow('kubectl drain ' + nodeName + ' --ignore-daemonsets --delete-emptydir-data --force');
}

function uncordonNode() {
  const nodeName = getNodeName();
  process.stdout.write(`Uncordoning node ${nodeName}...\n`);
  runKubectlOrThrow('kubectl uncordon ' + nodeName);
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
