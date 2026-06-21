#!/usr/bin/env node

'use strict';

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

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`kubeforge v${version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`kubeforge v${version}\n\n`);
  process.stdout.write('Usage: kubeforge <command> [options]\n\n');
  process.stdout.write('Commands:\n');
  process.stdout.write('  prepare    Provision this node for a kubeadm cluster\n\n');
  process.stdout.write('Options:\n');
  process.stdout.write('  --version  Print version and exit\n');
  process.stdout.write('  --help     Print this help message and exit\n');
  process.stdout.write('  --force    Bypass hardware compatibility checks\n');
  process.exit(0);
}

if (args[0] === 'prepare') {
  runPrepare();
} else {
  process.stderr.write(`kubeforge v${version}: no subcommand provided. Run 'kubeforge --help' for usage.\n`);
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

async function runPrepare() {
  if (process.getuid() !== 0) {
    process.stderr.write('Error: kubeforge must be run as root. Use: sudo kubeforge prepare\n');
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  process.stdout.write('KubeForge — node provisioning\n');

  const role = await selectRole();

  if (role === null) {
    process.stdout.write('\nOperation cancelled.\n');
    process.exit(0);
  }

  const versions = await versionModule.fetchVersionChoices();
  const selectedVersion = await versionModule.selectVersion(versions);

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

  if (role === 'master') {
    process.stdout.write('\u2714 Cluster bootstrapped successfully. Node is officially READY.\n');
  } else {
    process.stdout.write('\u2714 Node provisioning complete. Ready for kubeadm join.\n');
  }
  process.exit(0);
}
