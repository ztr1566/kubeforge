'use strict';

const fs = require('fs');
const { execSync, execFileSync } = require('child_process');

const KUBEADM_CONFIG_PATH = '/etc/kubernetes/kubeadm-init-config.yaml';
const ADMIN_CONF_PATH = '/etc/kubernetes/admin.conf';
const FLANNEL_MANIFEST_URL = 'https://raw.githubusercontent.com/flannel-io/flannel/v0.25.7/Documentation/kube-flannel.yml';

function initControlPlane() {
  try {
    execSync('kubeadm init --config ' + KUBEADM_CONFIG_PATH, { stdio: 'inherit' });
  } catch (err) {
    const code = err.status !== undefined && err.status !== null ? err.status : 'unknown';
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error('kubeadm init failed with exit code ' + code + ': ' + stderr);
  }
}

const USERNAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function resolveRealUser() {
  const sudoUser = process.env.SUDO_USER;
  const envUser = process.env.USER;
  let user;
  if (typeof sudoUser === 'string' && sudoUser.length > 0 && sudoUser !== 'root') {
    user = sudoUser;
  } else if (typeof envUser === 'string' && envUser.length > 0 && envUser !== 'root') {
    user = envUser;
  } else {
    user = 'root';
  }
  if (!USERNAME_RE.test(user)) {
    throw new Error('Invalid username: "' + user + '" does not match ' + USERNAME_RE);
  }
  if (user === 'root') {
    process.stdout.write('Warning: defaulting to root user for kubeconfig ownership (SUDO_USER not set to a non-root user)\n');
  }
  const homeDir = user === 'root' ? '/root' : '/home/' + user;
  return { user, homeDir };
}

function resolveUidGid(user) {
  try {
    const uidRaw = execFileSync('id', ['-u', user], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    const gidRaw = execFileSync('id', ['-g', user], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    const uid = parseInt(uidRaw, 10);
    const gid = parseInt(gidRaw, 10);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
      throw new Error('id returned non-integer value (uid="' + uidRaw + '", gid="' + gidRaw + '")');
    }
    return { uid, gid };
  } catch (err) {
    if (err.stderr) {
      throw new Error('Failed to resolve UID/GID for user "' + user + '": ' + err.stderr.toString().trim());
    }
    throw new Error('Failed to resolve UID/GID for user "' + user + '": ' + err.message);
  }
}

function setupKubeconfig(homeDir, uid, gid) {
  const kubeDir = homeDir + '/.kube';
  const kubeConfigPath = kubeDir + '/config';
  fs.mkdirSync(kubeDir, { recursive: true });
  fs.copyFileSync(ADMIN_CONF_PATH, kubeConfigPath);
  fs.chownSync(kubeDir, uid, gid);
  fs.chownSync(kubeConfigPath, uid, gid);
}

function deployFlannel(kubeconfigPath) {
  try {
    execSync('kubectl apply -f ' + FLANNEL_MANIFEST_URL, {
      env: Object.assign({}, process.env, { KUBECONFIG: kubeconfigPath }),
      stdio: 'inherit',
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error('Failed to deploy Flannel manifest from ' + FLANNEL_MANIFEST_URL + ': ' + stderr);
  }
}

function readReadyStatus(kubeconfigPath) {
  const stdout = execSync('kubectl get nodes -o json', {
    env: Object.assign({}, process.env, { KUBECONFIG: kubeconfigPath }),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
  const parsed = JSON.parse(stdout);
  const node = parsed && parsed.items && parsed.items[0];
  const conditions = node && node.status && node.status.conditions;
  if (!Array.isArray(conditions)) {
    return 'Unknown';
  }
  const readyCondition = conditions.find((c) => c && c.type === 'Ready');
  if (!readyCondition || typeof readyCondition.status !== 'string') {
    return 'NoReadyCondition';
  }
  return readyCondition.status;
}

function pollNodeReady(kubeconfigPath, maxAttempts, intervalSec) {
  const attempts = typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : 18;
  const interval = typeof intervalSec === 'number' && intervalSec >= 0 ? intervalSec : 10;
  let lastStatus = 'Unknown';
  let firstErrorLogged = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let currentStatus = 'Unknown';
    try {
      currentStatus = readReadyStatus(kubeconfigPath);
    } catch (err) {
      if (!firstErrorLogged) {
        console.error('Warning: error while polling node readiness:', err.message);
        firstErrorLogged = true;
      }
      currentStatus = 'Unknown';
    }
    lastStatus = currentStatus;
    const displayStatus = currentStatus === 'True' ? 'Ready' : (currentStatus === 'False' ? 'NotReady' : currentStatus);
    process.stdout.write('Waiting for node to become Ready... (' + attempt + '/' + attempts + ') Status: ' + displayStatus + '\n');
    if (currentStatus === 'True') {
      return true;
    }
    if (attempt < attempts) {
      try {
        execFileSync('sleep', [String(interval)], { stdio: 'ignore' });
      } catch (err) {
        throw new Error('Failed to sleep for ' + interval + 's between readiness polls: ' + err.message);
      }
    }
  }
  throw new Error('Node did not reach Ready status within ' + attempts + ' attempts (last observed status: ' + lastStatus + '). Run "kubectl get nodes" manually to inspect the cluster state.');
}

async function execute(opts) {
  if (!opts || typeof opts !== 'object' || opts.role !== 'master') {
    return;
  }
  initControlPlane();
  const { user, homeDir } = resolveRealUser();
  const { uid, gid } = resolveUidGid(user);
  setupKubeconfig(homeDir, uid, gid);
  const kubeconfigPath = homeDir + '/.kube/config';
  deployFlannel(kubeconfigPath);
  pollNodeReady(kubeconfigPath);
}

module.exports = { execute };
