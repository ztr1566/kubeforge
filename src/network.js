'use strict';

const fs = require('fs');

const K8S_DIR = '/etc/kubernetes';
const KUBEADM_CONFIG_PATH = '/etc/kubernetes/kubeadm-init-config.yaml';
const POD_SUBNET = '10.244.0.0/16';

const KUBEADM_CONFIG_YAML =
  'apiVersion: kubeadm.k8s.io/v1beta4\n' +
  'kind: InitConfiguration\n' +
  'localAPIEndpoint:\n' +
  '  advertiseAddress: 0.0.0.0\n' +
  '  bindPort: 6443\n' +
  'nodeRegistration:\n' +
  '  criSocket: unix:///run/containerd/containerd.sock\n' +
  '---\n' +
  'apiVersion: kubeadm.k8s.io/v1beta4\n' +
  'kind: ClusterConfiguration\n' +
  'networking:\n' +
  '  podSubnet: "' + POD_SUBNET + '"\n';

function writeMasterConfig() {
  fs.mkdirSync(K8S_DIR, { recursive: true });
  fs.writeFileSync(KUBEADM_CONFIG_PATH, KUBEADM_CONFIG_YAML, 'utf8');
}

function printWorkerGuidance() {
  process.stdout.write('\nNext steps for worker node:\n');
  process.stdout.write('  1. On the master node, generate the join command:\n');
  process.stdout.write('     kubeadm token create --print-join-command\n');
  process.stdout.write('  2. On this worker, run the printed kubeadm join command:\n');
  process.stdout.write('     sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>\n');
}

function execute(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('execute({ version, role }) requires an options object');
  }
  if (typeof opts.role !== 'string') {
    throw new Error('execute({ version, role }) requires a string role');
  }
  if (opts.role === 'master') {
    writeMasterConfig();
  } else if (opts.role === 'worker') {
    printWorkerGuidance();
  } else {
    throw new Error('Unknown role: ' + opts.role);
  }
}

module.exports = { execute };
