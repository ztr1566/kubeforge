'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const K8S_CONF_PATH = '/etc/sysctl.d/k8s.conf';
const SYSCTL_CONF =
  'net.bridge.bridge-nf-call-iptables  = 1\n' +
  'net.bridge.bridge-nf-call-ip6tables = 1\n' +
  'net.ipv4.ip_forward                 = 1\n';

function writeSysctlConf() {
  fs.writeFileSync(K8S_CONF_PATH, SYSCTL_CONF, 'utf8');
}

function applySysctl() {
  try {
    execSync('sysctl --system', { stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`sysctl --system failed: ${stderr}`);
  }
}

function execute() {
  writeSysctlConf();
  applySysctl();
}

module.exports = { execute };
