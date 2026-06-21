## 1. Kubeadm Cluster Initialization

- [x] 1.1 Create `src/bootstrap.js` with an `execute({ version, role })` function that returns immediately if `role !== 'master'`
- [x] 1.2 Implement `initControlPlane()` that runs `kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` via `execSync` with `{ stdio: 'inherit' }` for real-time output; wrap in try/catch and throw a descriptive error on failure

## 2. Dynamic Kubeconfig Permission Handover

- [x] 2.1 Implement `resolveRealUser()` that reads `process.env.SUDO_USER`, falls back to `process.env.USER` if empty/undefined/root, and returns `{ user, homeDir }` where `homeDir` is `/home/<user>` for non-root or `/root` for root; print a warning if defaulting to root
- [x] 2.2 Implement `resolveUidGid(user)` that executes `id -u <user>` and `id -g <user>` via `execSync`, parses the output to integers, and returns `{ uid, gid }`; throw on command failure
- [x] 2.3 Implement `setupKubeconfig(homeDir, uid, gid)` that: creates `<homeDir>/.kube/` via `fs.mkdirSync({ recursive: true })`, copies `/etc/kubernetes/admin.conf` to `<homeDir>/.kube/config` via `fs.copyFileSync`, and applies `fs.chownSync` on both the directory and file with the resolved UID/GID
- [x] 2.4 Wire `resolveRealUser` → `resolveUidGid` → `setupKubeconfig` inside `execute()` after `initControlPlane()`

## 3. Automated CNI Injection

- [x] 3.1 Implement `deployFlannel(kubeconfigPath)` that runs `kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml` via `execSync` with `KUBECONFIG` env set to `kubeconfigPath`; throw on failure with the manifest URL in the error message
- [x] 3.2 Wire `deployFlannel` inside `execute()` after kubeconfig setup, passing the kubeconfig path

## 4. Readiness Polling Loop

- [x] 4.1 Implement `pollNodeReady(kubeconfigPath, maxAttempts, intervalSec)` with defaults `maxAttempts=18` and `intervalSec=10` (3-minute total timeout)
- [x] 4.2 On each iteration: run `kubectl get nodes -o json` via `execSync` with `KUBECONFIG` env and `{ stdio: 'pipe' }`; if the command fails, treat as not ready and continue polling (API server may still be starting)
- [x] 4.3 Parse the JSON output: navigate `items[0].status.conditions`, find the condition with `type === 'Ready'`, check if `status === 'True'`; return `true` if ready
- [x] 4.4 Print progress on each iteration: `Waiting for node to become Ready... (<attempt>/<max>) Status: <current-status>`
- [x] 4.5 Between iterations, block for the interval using `execSync('sleep <intervalSec>')` to maintain synchronous execution
- [x] 4.6 If all iterations exhausted without Ready, throw an error with the last observed status and guidance to run `kubectl get nodes` manually
- [x] 4.7 Wire `pollNodeReady` inside `execute()` after CNI deployment

## 5. Pipeline Integration

- [x] 5.1 In `src/index.js`, require the bootstrap module: `const bootstrapModule = require('./bootstrap')`
- [x] 5.2 Add a new stage at the end of the `stages` array: `{ name: 'Cluster Bootstrap', execute: () => bootstrapModule.execute({ version: selectedVersion, role }) }`
- [x] 5.3 Update the final success message: if `role === 'master'`, print `✔ Cluster bootstrapped successfully. Node is officially READY.`; if `role === 'worker'`, print `✔ Node provisioning complete. Ready for kubeadm join.`
- [x] 5.4 Remove or gate the manual guidance output from `src/network.js` so it does not print when bootstrap will execute automatically (master role)
