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

function runBestEffort(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    // Best-effort cleanup: log but don't fail
    process.stdout.write('Warning: ' + cmd + ' returned non-zero (continuing cleanup)\n');
  }
}

function cleanupExistingCluster() {
  process.stdout.write('Resetting existing Kubernetes cluster state...\n');

  // ponytail: bare cluster reset — apt keys/repos/binaries stay, only the
  // running cluster is torn down so kubeadm init can succeed on re-install.
  runBestEffort('kubeadm reset -f');
  runBestEffort('rm -rf ~/.kube');
  runBestEffort('iptables -F && iptables -t nat -F && iptables -t mangle -F && iptables -X');
  runBestEffort('ip link delete cni0 2>/dev/null || true');
  runBestEffort('ip link delete flannel.1 2>/dev/null || true');
  runBestEffort('systemctl restart containerd');

  process.stdout.write('Cluster reset complete.\n');
}

function installPackages(ver) {
  const installCmd = 'apt-get install -y --allow-downgrades kubelet=' + ver + '-* kubeadm=' + ver + '-* kubectl=' + ver + '-*';
  runOrThrow('apt-get update', { env: APT_ENV });
  runOrThrow(installCmd, { env: APT_ENV });
  runOrThrow('apt-mark hold kubelet kubeadm kubectl');
  runOrThrow('systemctl enable kubelet');
  runOrThrow('systemctl start kubelet');
}

function upgradeKubeadm(ver) {
  const pinned = ver + '-1.1';
  runOrThrow('apt-mark unhold kubeadm', { env: APT_ENV });
  try {
    runOrThrow('apt-get update', { env: APT_ENV });
    runOrThrow('apt-get install -y kubeadm=' + pinned, { env: APT_ENV });
  } finally {
    try {
      runOrThrow('apt-mark hold kubeadm', { env: APT_ENV });
    } catch (e) {
      process.stderr.write(`Warning: Failed to re-hold kubeadm: ${e.message}\n`);
    }
  }
}

function upgradeKubeletKubectl(ver) {
  const pinned = ver + '-1.1';
  runOrThrow('apt-mark unhold kubelet kubectl', { env: APT_ENV });
  try {
    runOrThrow('apt-get install -y kubelet=' + pinned + ' kubectl=' + pinned, { env: APT_ENV });
  } finally {
    try {
      runOrThrow('apt-mark hold kubelet kubectl', { env: APT_ENV });
    } catch (e) {
      process.stderr.write(`Warning: Failed to re-hold kubelet/kubectl: ${e.message}\n`);
    }
  }
  runOrThrow('systemctl daemon-reload');
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
  installPackages(ver);
}

module.exports = {
  execute,
  cleanupExistingCluster,
  upgradeKubeadm,
  upgradeKubeletKubectl,
};
