'use strict';

const fs = require('fs');
const path = require('path');
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

function runBestEffort(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    // Best-effort cleanup: log but don't fail
    process.stdout.write('Warning: ' + cmd + ' returned non-zero (continuing cleanup)\n');
  }
}

function cleanupExistingCluster() {
  process.stdout.write('Cleaning up existing Kubernetes installation...\n');

  // 1. Tear down the cluster via kubeadm reset
  runBestEffort('kubeadm reset -f');

  // 2. Remove /etc/kubernetes/ manifests and configs
  const k8sDir = '/etc/kubernetes';
  if (fs.existsSync(k8sDir)) {
    const entries = fs.readdirSync(k8sDir);
    for (const entry of entries) {
      const fullPath = path.join(k8sDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        process.stdout.write('Warning: failed to remove ' + fullPath + ': ' + err.message + '\n');
      }
    }
  }

  // 3. Clean up CNI configs
  const cniDir = '/etc/cni/net.d';
  if (fs.existsSync(cniDir)) {
    fs.rmSync(cniDir, { recursive: true, force: true });
    process.stdout.write('Removed CNI config directory: ' + cniDir + '\n');
  }

  // 4. Remove old apt keys and repo files for kubernetes
  const kubernetesKeyring = '/etc/apt/keyrings/kubernetes-apt-keyring.gpg';
  if (fs.existsSync(kubernetesKeyring)) {
    fs.unlinkSync(kubernetesKeyring);
    process.stdout.write('Removed old Kubernetes apt keyring\n');
  }
  const kubernetesSources = '/etc/apt/sources.list.d/kubernetes.list';
  if (fs.existsSync(kubernetesSources)) {
    fs.unlinkSync(kubernetesSources);
    process.stdout.write('Removed old Kubernetes apt sources\n');
  }

  // 5. Clean /var/lib/etcd
  const etcdDir = '/var/lib/etcd';
  if (fs.existsSync(etcdDir)) {
    fs.rmSync(etcdDir, { recursive: true, force: true });
    process.stdout.write('Removed etcd data directory\n');
  }

  // 6. Clean up any leftover iptables rules (best-effort)
  runBestEffort('iptables -F');
  runBestEffort('ip link delete cni0');
  runBestEffort('ip link delete flannel.1');

  // 7. Stop kubelet if running
  runBestEffort('systemctl stop kubelet');

  process.stdout.write('Cleanup complete.\n');
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

module.exports = { execute, cleanupExistingCluster };
