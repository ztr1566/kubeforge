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

function execute(opts) {
  if (!opts || typeof opts.version !== 'string') {
    throw new Error('execute({ version }) requires a string version');
  }
  const ver = stripVPrefix(opts.version);
  const installCmd = 'apt-get install -y kubelet=' + ver + '-* kubeadm=' + ver + '-* kubectl=' + ver + '-*';

  runOrThrow('apt-get update', { env: APT_ENV });
  runOrThrow(installCmd, { env: APT_ENV });
  runOrThrow('apt-mark hold kubelet kubeadm kubectl');
  runOrThrow('systemctl enable kubelet');
  runOrThrow('systemctl start kubelet');
}

module.exports = { execute };
