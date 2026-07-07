#!/usr/bin/env node

'use strict';

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  console.error('Error: NODE_TLS_REJECT_UNAUTHORIZED is set to 0. Refusing to run with TLS verification disabled.');
  process.exit(1);
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
  process.stdout.write('  upgrade    Upgrade Kubernetes binaries on an already-provisioned node\n\n');
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
    if (previousVersion && !versions.includes(previousVersion)) {
      versions.unshift(previousVersion);
    }
    selectedVersion = await versionModule.selectVersion(versions);
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

function kubeadmUpgrade(version, role) {
  const { execSync } = require('child_process');
  const ver = version.replace(/^v/, '');
  if (role === 'master') {
    process.stdout.write(`Running kubeadm upgrade apply v${ver}...\n`);
    try {
      execSync('kubeadm upgrade apply v' + ver + ' --yes', { stdio: 'inherit' });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
      throw new Error('kubeadm upgrade apply failed: ' + stderr);
    }
  } else {
    process.stdout.write(`Running kubeadm upgrade node...\n`);
    try {
      execSync('kubeadm upgrade node', { stdio: 'inherit' });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
      throw new Error('kubeadm upgrade node failed: ' + stderr);
    }
  }
}

function uncordonNode() {
  const nodeName = getNodeName();
  process.stdout.write(`Uncordoning node ${nodeName}...\n`);
  runKubectlOrThrow('kubectl uncordon ' + nodeName);
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

  const force = process.argv.includes('--force');
  const currentVersion = state.kubernetesVersion;

  process.stdout.write('KubeForge — Kubernetes upgrade\n');
  process.stdout.write(`Current version: ${currentVersion}\n`);

  let versions, newVersion;
  try {
    versions = await versionModule.fetchVersionChoices();
    newVersion = await versionModule.selectVersion(versions);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const stripV = (v) => v.replace(/^v/, '');
  const currentParts = stripV(currentVersion).split('.').map(Number);
  const newParts = stripV(newVersion).split('.').map(Number);

  let isDowngrade = false;
  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const n = newParts[i] || 0;
    if (n < c) { isDowngrade = true; break; }
    if (n > c) { break; }
  }

  if (isDowngrade && !force) {
    process.stderr.write(`Error: Cannot downgrade from ${currentVersion} to ${newVersion}. Upgrade requires a newer version.\n`);
    process.exit(1);
  }

  if (stripV(currentVersion) === stripV(newVersion) && !force) {
    process.stderr.write(`Error: Version ${newVersion} is already installed. Use --force to re-install the same version.\n`);
    process.exit(1);
  }

  const nodeRole = state.nodeRole || 'master';

  const applyStep = async (stepVersion) => {
    const stages = [
      { name: 'Kubernetes Repository', execute: () => repoModule.execute({ version: stepVersion }) },
      { name: 'Drain Node', execute: () => drainNode() },
      { name: 'Kubeadm Upgrade', execute: () => kubeadmUpgrade(stepVersion, nodeRole) },
      { name: 'Kubernetes Binaries', execute: () => kubeInstallModule.execute({ version: stepVersion, mode: 'upgrade' }) },
      { name: 'Uncordon Node', execute: () => uncordonNode() },
    ];
    for (const stage of stages) {
      process.stdout.write(`Applying ${stage.name} configuration...\n`);
      try {
        await stage.execute();
      } catch (err) {
        process.stderr.write(`Error in ${stage.name}: ${err.message}\n`);
        process.stderr.write(`Upgrade failed at ${stage.name}. Node is drained. Run 'kubectl uncordon <node>' manually after fixing the issue.\n`);
        process.exit(1);
      }
    }
    try {
      stateModule.markUpgraded({ version: stepVersion });
    } catch (err) {
      process.stderr.write(`Warning: Failed to save state: ${err.message}\n`);
    }
  };

  const currentMinor = currentParts[1];
  const targetMinor = newParts[1];
  const major = currentParts[0];

  if (targetMinor - currentMinor > 1) {
    const allVersions = await versionModule.fetchAllVersions();
    const steps = [];
    for (let minor = currentMinor + 1; minor <= targetMinor; minor++) {
      const key = `${major}.${minor}`;
      const latestPatch = allVersions.find(v => stripV(v).split('.').slice(0, 2).join('.') === key);
      if (!latestPatch) {
        process.stderr.write(`Error: No version found for Kubernetes v${key}\n`);
        process.exit(1);
      }
      steps.push(latestPatch);
    }
    steps[steps.length - 1] = newVersion;

    for (const stepVersion of steps) {
      process.stdout.write(`\nStepping through ${stepVersion}...\n`);
      await applyStep(stepVersion);
    }
  } else {
    await applyStep(newVersion);
  }

  process.stdout.write(`\u2714 Upgraded Kubernetes from ${currentVersion} to ${newVersion} successfully.\n`);
  process.exit(0);
}
