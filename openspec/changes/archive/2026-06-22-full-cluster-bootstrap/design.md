## Context

The `k8s-ready prepare` pipeline currently runs 7 stages ending at "Flannel Network Prep", which writes `/etc/kubernetes/kubeadm-init-config.yaml` and prints manual guidance. The tool runs as root (enforced by `process.getuid() === 0` check). The codebase is zero-dependency Node.js compiled via `@yao-pkg/pkg`. All system interaction uses `child_process.execSync` and `fs`. The pipeline passes `{ version, role }` context to stages that need it.

Key existing state:
- `src/network.js` already writes the kubeadm init config YAML with `podSubnet: "10.244.0.0/16"` to `/etc/kubernetes/kubeadm-init-config.yaml`.
- The pipeline in `src/index.js` uses `await stage.execute()` inside a for-loop with try/catch.
- `SUDO_USER` is available because the tool is run via `sudo k8s-ready prepare`.

## Goals / Non-Goals

**Goals:**
- Automate full control-plane bootstrap for master nodes: init → kubeconfig → CNI → readiness.
- Resolve the real invoking user's identity via `SUDO_USER` to set up kubeconfig with correct ownership.
- Deploy Flannel CNI non-interactively and confirm the node reaches `Ready` status before exiting.
- Keep the bootstrap stage as a single module (`src/bootstrap.js`) with clear internal function boundaries.

**Non-Goals:**
- Worker node bootstrap (workers still print join guidance — they need the master's token).
- Multi-master / HA control-plane setup.
- Custom CNI selection (Flannel only).
- Automatic worker join (requires token exchange, out of scope).
- Certificate management or API server configuration beyond kubeadm defaults.

## Decisions

### 1. Single `src/bootstrap.js` module with 4 internal phases

Rather than 4 separate modules, the bootstrap logic is a single module because the phases are tightly coupled (kubeconfig path feeds into kubectl env, which feeds into CNI apply, which is verified by polling). Each phase is an internal function, but the public API remains `execute({ version, role })`.

**Alternative considered**: Four separate modules wired as 4 pipeline stages. Rejected because the data coupling (kubeconfig path, KUBECONFIG env) makes independent modules artificially complex and the phases cannot meaningfully run independently.

### 2. `kubeadm init` with `--config` flag, not inline args

The kubeadm init config YAML is already written by `src/network.js` in the prior stage. Using `kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` is cleaner and more extensible than passing `--pod-network-cidr` inline. It also allows future enhancements (custom API server address, etc.) without changing the bootstrap module.

### 3. `SUDO_USER` resolution with fallback chain

The real user is identified by:
1. `process.env.SUDO_USER` (primary — set by `sudo`)
2. `process.env.USER` if SUDO_USER is empty or equals `root`
3. If both resolve to `root`, use `/root` as the home directory

The home directory is resolved via `/home/<user>` for non-root users, `/root` for root. We do NOT use `os.homedir()` because under sudo it returns root's home, not the invoking user's.

**Alternative considered**: Parsing `/etc/passwd` for the home directory. Rejected for simplicity — the `/home/<user>` convention holds on all Debian/Ubuntu targets. If the user has a non-standard home, the kubeconfig can be manually copied.

### 4. UID/GID resolution via `id -u` and `id -g` commands

Using `execSync('id -u <user>')` and `execSync('id -g <user>')` to get the numeric UID and GID for `fs.chownSync`. This is simpler and more portable than parsing `/etc/passwd`.

### 5. Synchronous polling loop with `execSync` and `setTimeout` replacement

The readiness polling uses a synchronous loop with `Atomics.wait` or a simple blocking sleep pattern. Since the pipeline is already synchronous (all stages use `execSync`), introducing async polling would break the execution model. The loop:
1. Runs `kubectl get nodes -o json` via `execSync`.
2. Parses the JSON output.
3. Checks for `status.conditions` where `type === 'Ready'` and `status === 'True'`.
4. If not ready, blocks for 10 seconds using `execSync('sleep 10')`.
5. Repeats up to 18 iterations (3 minutes total).
6. Throws on timeout.

**Alternative considered**: `setTimeout`-based async polling. Rejected because the entire pipeline is synchronous and introducing promises here would require refactoring the stage execution model.

### 6. `KUBECONFIG` environment variable for kubectl commands

All `kubectl` invocations in the bootstrap module set the `KUBECONFIG` environment variable pointing to the copied config file (`/home/<user>/.kube/config` or `/root/.kube/config`). This avoids relying on kubectl's default config discovery and ensures the correct cluster context is used even if other kubeconfigs exist.

## Risks / Trade-offs

- **[Risk]** `kubeadm init` takes 1-3 minutes and produces extensive output → **Mitigation**: Use `{ stdio: 'inherit' }` so the operator sees real-time progress. Wrap in try/catch with clear error message on failure.
- **[Risk]** Flannel manifest URL changes or raw.githubusercontent.com is unreachable → **Mitigation**: The URL `https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml` is the canonical upstream location. If it fails, the error from `kubectl apply` is passed through with the URL for manual retry.
- **[Risk]** Node never reaches Ready within 3 minutes (slow image pull, resource constraints) → **Mitigation**: Timeout exits with code 1 and a descriptive message including current node status. The cluster is initialized and the operator can manually check `kubectl get nodes` after resolving the issue.
- **[Risk]** `SUDO_USER` not set (direct root login, not via sudo) → **Mitigation**: Fallback chain handles this — kubeconfig goes to `/root/.kube/config`. A warning is printed if defaulting to root.
- **[Risk]** `fs.chownSync` fails if UID/GID resolution fails → **Mitigation**: The `id -u`/`id -g` commands throw clear errors. The chown step is wrapped in try/catch with the specific user context in the error message.
