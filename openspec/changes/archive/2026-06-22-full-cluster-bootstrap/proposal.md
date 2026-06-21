## Why

The tool currently provisions the node and prints manual guidance ("run `kubeadm init` next…"). For the master role, the operator must still execute 4+ separate commands to get a functional cluster: kubeadm init, kubeconfig copy, Flannel CNI apply, and readiness verification. This defeats the purpose of a single-command provisioner. By automating the full control-plane bootstrap, `k8s-ready prepare` on a master becomes a true zero-to-cluster command — the user selects "Master Node", picks a version, and walks away to a fully initialized, CNI-deployed, Ready-status cluster.

## What Changes

- Add a bootstrap orchestration module (`src/bootstrap.js`) with an `execute({ version, role })` function that:
  1. Runs `kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` to initialize the control plane.
  2. Identifies the real (non-root) user via `process.env.SUDO_USER`, provisions their `~/.kube/` directory, copies `admin.conf` into it, and fixes ownership with `fs.chownSync`.
  3. Deploys the Flannel CNI manifest via `kubectl apply -f` with the proper `KUBECONFIG` environment variable.
  4. Polls `kubectl get nodes -o json` every 10 seconds (up to 3-minute timeout) until the node reports `Ready` status.
- Wire the bootstrap module as the final pipeline stage in `src/index.js`, executing only when `role === 'master'`.
- Replace the post-provisioning guidance message with: `✔ Cluster bootstrapped successfully. Node is officially READY.`
- For worker nodes, the pipeline remains unchanged (print join guidance).

## Capabilities

### New Capabilities
- `kubeadm-init`: Execute `kubeadm init` with the pre-written config file and capture/log output.
- `kubeconfig-handover`: Resolve `SUDO_USER`, create `~/.kube/`, copy `admin.conf`, and chown to the real user.
- `cni-deployment`: Deploy Flannel CNI manifest via `kubectl apply` with the correct KUBECONFIG.
- `readiness-polling`: Poll `kubectl get nodes -o json` every 10s up to 3 minutes, parse node Ready condition, fail on timeout.

### Modified Capabilities
- `prepare-command`: Adds the bootstrap module as the final pipeline stage for master role. Replaces guidance output with completion message on success.

## Impact

- **Files added**: `src/bootstrap.js`
- **Files modified**: `src/index.js` (add bootstrap stage, update final output)
- **System commands invoked**: `kubeadm init`, `id -u`, `id -g`, `kubectl apply`, `kubectl get nodes`
- **System files touched**: `/home/<SUDO_USER>/.kube/config` (created), `/etc/kubernetes/admin.conf` (read)
- **Network access**: Downloads Flannel manifest from `raw.githubusercontent.com`
- **Dependencies**: No new npm dependencies. All via `child_process.execSync`/`execFileSync` and `fs`.
