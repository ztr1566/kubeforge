'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

const K8S_CONF_PATH = '/etc/modules-load.d/k8s.conf';
const MODULES_CONF = 'overlay\nbr_netfilter\n';
const MODULES = ['overlay', 'br_netfilter'];

function writeModulesConf() {
  fs.writeFileSync(K8S_CONF_PATH, MODULES_CONF, 'utf8');
}

function loadModule(name) {
  try {
    execSync(`modprobe ${name}`, { stdio: 'pipe' });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`modprobe ${name} failed: ${stderr}`);
  }
}

function execute() {
  writeModulesConf();
  for (const name of MODULES) {
    loadModule(name);
  }
}

module.exports = { execute };
