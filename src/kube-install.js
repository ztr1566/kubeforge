'use strict';

const { execSync } = require('child_process');

const APT_ENV = Object.assign({}, process.env, { DEBIAN_FRONTEND: 'noninteractive' });

function stripVPrefix(version) {
  if (typeof version !== 'string') {
    throw new Error('Invalid version: expected string, got ' + typeof version);
  }
  return version.replace(/^v/, '');
}

function runOrThrow(cmd, opts) {
  try {
    return execSync(cmd, Object.assign({ stdio: 'pipe' }, opts || {}));
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(cmd + ' failed: ' + stderr);
  }
}

function installPackages(ver) {
  const installCmd = 'apt-get install -y --allow-downgrades kubelet=' + ver + '-* kubeadm=' + ver + '-* kubectl=' + ver + '-*';
  runOrThrow('apt-get update', { env: APT_ENV });
  runOrThrow(installCmd, { env: APT_ENV });
  runOrThrow('apt-mark hold kubelet kubeadm kubectl');
  runOrThrow('systemctl enable kubelet');
  runOrThrow('systemctl start kubelet');
}

function upgradePackages(ver) {
  const installCmd = 'apt-get install -y --allow-downgrades kubelet=' + ver + '-* kubeadm=' + ver + '-* kubectl=' + ver + '-*';
  runOrThrow('apt-mark unhold kubelet kubeadm kubectl');
  try {
    runOrThrow('apt-get update', { env: APT_ENV });
    runOrThrow(installCmd, { env: APT_ENV });
  } finally {
    try {
      runOrThrow('apt-mark hold kubelet kubeadm kubectl');
    } catch (e) {
      process.stderr.write(`Warning: Failed to re-hold packages: ${e.message}\n`);
    }
  }
  runOrThrow('systemctl restart kubelet');
}

function execute(opts) {
  if (!opts || typeof opts.version !== 'string') {
    throw new Error('execute({ version }) requires a string version');
  }
  const ver = stripVPrefix(opts.version);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(ver)) {
    throw new Error('Invalid version format: "' + ver + '" (expected X.Y.Z)');
  }
  const mode = opts.mode || 'install';
  if (mode !== 'install' && mode !== 'upgrade') {
    throw new Error('Invalid mode: "' + mode + '" (expected "install" or "upgrade")');
  }
  if (mode === 'upgrade') {
    upgradePackages(ver);
  } else {
    installPackages(ver);
  }
}

module.exports = { execute };
