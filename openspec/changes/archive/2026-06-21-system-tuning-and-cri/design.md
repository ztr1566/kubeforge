## Context

The `k8s-ready prepare` command currently completes after pre-flight hardware validation. The next pipeline stages — OS tuning and container runtime provisioning — must transform a stock Debian/Ubuntu host into a kubeadm-ready node. All provisioning runs as root (`process.getuid() === 0` is already enforced). The codebase is zero-dependency Node.js (only `child_process`, `fs`, `os`) compiled to static binaries via `@yao-pkg/pkg`.

Current module structure:
- `src/index.js` — CLI entry, pre-flight orchestration
- `src/hardware.js` — CPU/RAM/swap detection
- `src/validate.js` — role-based threshold evaluation
- `src/ui.js` — ANSI terminal report

## Goals / Non-Goals

**Goals:**
- Implement four new modules (`swap.js`, `kernel.js`, `sysctl.js`, `containerd.js`) that execute sequentially after pre-flight passes.
- Every file mutation creates a timestamped backup and rolls back on failure.
- All operations are idempotent — safe to re-run without harm.
- No new npm dependencies; use only Node.js built-ins and shell commands.

**Non-Goals:**
- Supporting CRI-O or other container runtimes (containerd only).
- Supporting non-Debian/Ubuntu distributions (no `yum`/`dnf`).
- Implementing kubeadm init/join — that is a future change.
- Network plugin (CNI) installation.
- Handling remote/SSH provisioning — this tool runs locally on the target node.

## Decisions

### 1. Sequential pipeline over parallel execution

Each provisioning stage depends on the prior one succeeding (e.g., kernel modules must be loaded before sysctl applies bridge-nf rules). Stages run in strict order: swap → kernel → sysctl → containerd. A failure in any stage aborts the pipeline and prints which stage failed.

**Alternative considered**: Fire-and-forget parallel. Rejected because sysctl depends on `br_netfilter` being loaded, and containerd service start can interact with cgroup configuration.

### 2. Backup-then-write pattern for all file mutations

Every function that writes a system config file follows this contract:
1. If the target file exists, copy it to `<path>.bak.<ISO-timestamp>` using `fs.copyFileSync`.
2. Write the new content atomically via `fs.writeFileSync`.
3. If any subsequent command fails (e.g., `sysctl --system`), restore from the backup and re-throw.

This gives operators a recovery path without building a full transaction system.

### 3. `execSync` with explicit stdio and error handling

All shell commands use `child_process.execSync` with `{ stdio: 'pipe' }` so stdout/stderr can be captured and logged. Every call is wrapped in try/catch. The `DEBIAN_FRONTEND=noninteractive` environment variable is set for all `apt-get` invocations to prevent interactive prompts from blocking the binary.

**Alternative considered**: `spawn` with streaming output. Rejected because provisioning commands are short-lived and sequential; `execSync` keeps flow control simple in a non-async pipeline.

### 4. TOML line-level patching for containerd config

The containerd config is generated via `containerd config default`, then patched with string replacement to set `SystemdCgroup = true`. We do not introduce a TOML parser library — the default config output has a stable structure and the target line (`SystemdCgroup = false`) is unique. A simple `.replace()` is sufficient and avoids adding dependencies.

**Alternative considered**: Using a TOML library (`@iarna/toml`). Rejected to maintain the zero-dependency constraint. The risk of the default config format changing is low and detectable (the replace call returns unchanged content, which we can assert against).

### 5. Module interface contract

Each module exports a single function with the signature:

```js
function execute() → void  // throws on failure
```

No return values. Side effects are system mutations. The caller (`index.js`) catches errors, prints the failure message, and exits with code 1.

## Risks / Trade-offs

- **[Risk]** `containerd config default` output format changes between containerd versions → **Mitigation**: After `.replace()`, assert the output contains `SystemdCgroup = true`. If not, throw with a clear message telling the operator to check containerd version.
- **[Risk]** `apt-get install containerd` package name varies (some repos use `containerd.io`) → **Mitigation**: Try `containerd` first. If the package is not found, the error message from apt is passed through. A future enhancement could attempt `containerd.io` as fallback.
- **[Risk]** Backup files accumulate on repeated runs → **Mitigation**: Acceptable. Backup files are small config files. A `--clean-backups` flag could be added later.
- **[Risk]** `/etc/fstab` parsing edge cases (UUID-based swap, zram) → **Mitigation**: Use regex that matches any line containing `swap` in the type field (column 3 of fstab). Comment out by prepending `# [k8s-ready] `. This is detectable and reversible.
