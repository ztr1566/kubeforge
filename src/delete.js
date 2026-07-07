'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const stateModule = require('./state');

const HOME = process.env.HOME || '/root';

function runBestEffort(cmd) {
  // ponytail: every step is best-effort — even if a file/iface/service is
  // missing, the delete must keep going so the node is fully scrubbed.
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    process.stdout.write('Warning: ' + cmd + ' returned non-zero (continuing)\n');
  }
}

function getNodeName() {
  try {
    const output = execSync('kubectl get nodes -o jsonpath="{.items[0].metadata.name}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.replace(/"/g, '').trim();
  } catch (err) {
    return null;
  }
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function removeKubernetes() {
  // 1. Drain and delete the node from the cluster
  const nodeName = getNodeName();
  if (nodeName) {
    process.stdout.write(`Draining node ${nodeName}...\n`);
    runBestEffort('kubectl drain ' + nodeName + ' --delete-emptydir-data --force --ignore-daemonsets');
    process.stdout.write(`Deleting node ${nodeName} from cluster...\n`);
    runBestEffort('kubectl delete node ' + nodeName);
  } else {
    process.stdout.write('No node to drain/delete (kubectl unavailable or cluster unreachable)\n');
  }

  // 2. Reset kubeadm
  runBestEffort('kubeadm reset -f');

  // 3. Stop kubelet service
  runBestEffort('systemctl stop kubelet');

  // 4. Purge Kubernetes packages
  runBestEffort('apt-get purge -y kubeadm kubectl kubelet kubernetes-cni cri-tools');
  runBestEffort('apt-get autoremove -y');

  // 5. Fallback: remove binaries if purge missed them
  runBestEffort('rm -f /usr/bin/kubeadm /usr/bin/kubectl /usr/bin/kubelet');

  // 6. Wipe residual directories
  runBestEffort('rm -rf ' + HOME + '/.kube');
  runBestEffort('rm -rf /etc/kubernetes');
  runBestEffort('rm -rf /var/lib/etcd');
  runBestEffort('rm -rf /var/lib/kubelet');
  runBestEffort('rm -rf /etc/cni');
  runBestEffort('rm -rf /var/lib/cni');

  // 7. Remove GPG key and apt repo
  runBestEffort('rm -f /etc/apt/keyrings/kubernetes-apt-keyring.gpg');
  runBestEffort('rm -f /etc/apt/sources.list.d/kubernetes.list');
  runBestEffort('apt-get update');

  // 8. Clean up networking and restart runtime
  runBestEffort('iptables -F && iptables -t nat -F && iptables -t mangle -F && iptables -X');
  runBestEffort('ip link delete cni0 2>/dev/null || true');
  runBestEffort('ip link delete flannel.1 2>/dev/null || true');
  runBestEffort('systemctl restart containerd');

  // 9. Clear the kubeforge state file
  try {
    stateModule.clear();
    process.stdout.write('Cleared kubeforge state file\n');
  } catch (err) {
    process.stdout.write('Warning: failed to clear state file: ' + err.message + '\n');
  }
}

async function run() {
  if (process.getuid() !== 0) {
    process.stderr.write('Error: kubeforge must be run as root. Use: sudo kubeforge delete\n');
    process.exit(1);
  }

  const ok = await confirm('This will completely remove Kubernetes from this node. Are you sure? (y/N) ');
  if (!ok) {
    process.stdout.write('Cancelled.\n');
    process.exit(0);
  }

  process.stdout.write('Removing Kubernetes from this node...\n');
  removeKubernetes();
  process.stdout.write('\u2714 Kubernetes has been removed from this node.\n');
  process.exit(0);
}

module.exports = { run, removeKubernetes };
