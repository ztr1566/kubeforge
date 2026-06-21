'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const CONFIG_DIR = '/etc/containerd';
const CONFIG_PATH = '/etc/containerd/config.toml';
const SYSTEMD_CGROUP_FALSE = 'SystemdCgroup = false';
const SYSTEMD_CGROUP_TRUE = 'SystemdCgroup = true';

const APT_ENV = Object.assign({}, process.env, { DEBIAN_FRONTEND: 'noninteractive' });

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runOrThrow(cmd, opts) {
  try {
    return execSync(cmd, Object.assign({ stdio: 'pipe' }, opts || {}));
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`${cmd} failed: ${stderr}`);
  }
}

function installContainerd() {
  runOrThrow('apt-get update', { env: APT_ENV });
  runOrThrow('apt-get install -y containerd', { env: APT_ENV });
}

function generatePatchedConfig() {
  const stdout = runOrThrow('containerd config default').toString();
  if (!stdout.includes(SYSTEMD_CGROUP_FALSE)) {
    throw new Error(
      `containerd config default output does not contain "${SYSTEMD_CGROUP_FALSE}"; ` +
      'the installed containerd version may be incompatible with this provisioner'
    );
  }
  const patched = stdout.replace(SYSTEMD_CGROUP_FALSE, SYSTEMD_CGROUP_TRUE);
  if (!patched.includes(SYSTEMD_CGROUP_TRUE)) {
    throw new Error(
      'patched config does not contain "SystemdCgroup = true" after replacement; aborting'
    );
  }
  return patched;
}

function writeConfig(content) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (fs.existsSync(CONFIG_PATH)) {
    const backupPath = `${CONFIG_PATH}.bak.${isoTimestamp()}`;
    fs.copyFileSync(CONFIG_PATH, backupPath);
  }
  fs.writeFileSync(CONFIG_PATH, content, 'utf8');
}

function manageService() {
  runOrThrow('systemctl restart containerd');
  runOrThrow('systemctl enable containerd');
}

function execute() {
  installContainerd();
  const patched = generatePatchedConfig();
  writeConfig(patched);
  manageService();
}

module.exports = { execute };
