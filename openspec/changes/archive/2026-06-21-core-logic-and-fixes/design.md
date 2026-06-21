## Context

`k8s-ready` is a Node.js CLI tool compiled to a standalone binary via `@yao-pkg/pkg`. The current codebase has a working `install.sh`, cross-compilation pipeline, and a stub `src/index.js` that handles `--version` and `--help` but has no `prepare` subcommand logic. The `pkg` cross-compilation for ARM64 emits a `Failed to make bytecode node20-arm64` warning that is cosmetic but noisy.

**Current source layout:**
- `src/index.js` — CLI entry point (27 lines, stub only)
- `package.json` — `pkg` build scripts without `--no-bytecode`
- `.gitignore` — exists with 4 entries, needs verification

**Constraints:**
- No native Node.js addons (must compile cleanly with `pkg`).
- Hardware detection must use `os` stdlib + `/proc/` virtual filesystem (no `systeminformation` or similar native packages).
- Interactive prompts must work in a `pkg`-compiled binary (no `eval`-based prompt libraries).

## Goals / Non-Goals

**Goals:**
- Eliminate the ARM64 bytecode cross-compilation warning via `--no-bytecode` flag.
- Ensure `.gitignore` covers all required patterns.
- Implement the full `prepare` subcommand: root check → role wizard → hardware scan → compatibility validation → visual report → gate/force.

**Non-Goals:**
- Implementing the actual provisioning steps (swap disable, kernel modules, containerd, kubeadm install) — those come in a later change.
- Multi-OS support — Linux-only, `/proc/swaps` is Linux-specific.
- Unit tests (deferred to a testing change).

## Decisions

### 1. Module-per-concern file layout under `src/`

**Choice:** Split the `prepare` logic into focused modules: `src/hardware.js` (detection), `src/validate.js` (threshold comparison), `src/ui.js` (terminal formatting), with `src/index.js` as the orchestrator.

**Rationale:** The monolith `index.js` is already at its limit for a stub. Adding root check, prompts, hardware detection, validation, and reporting in one file would make it unreadable. Separate modules are individually testable and map cleanly to the spec capabilities.

**Alternatives considered:**
- **Single-file `index.js`:** Simpler initially but becomes unmanageable as provisioning phases are added in later changes.

### 2. Node.js `os` module + `/proc/swaps` for hardware detection (zero native addons)

**Choice:** Use `os.cpus().length` for CPU cores, `os.totalmem()` for RAM, and `fs.readFileSync('/proc/swaps', 'utf8')` for swap status.

**Rationale:** `pkg` cannot bundle native addons like `systeminformation`. The `os` module is stdlib and bundles cleanly. `/proc/swaps` is a Linux virtual file that lists active swap devices — if the file contains only the header line or is empty, swap is disabled.

**Alternatives considered:**
- **`systeminformation` package:** Rich API but uses native bindings. Fails in `pkg` builds.
- **`child_process.execSync('free -m')`:** Works but requires parsing free-form text output. Less reliable than `os.totalmem()`.
- **`swapon --show`:** Works but requires the `util-linux` package to be installed.

### 3. `@clack/prompts` for interactive role selection

**Choice:** Use `@clack/prompts` for the interactive role selection wizard (select prompt with Master/Worker options).

**Rationale:** `@clack/prompts` is a pure-JS library with no native addons, renders beautifully in the terminal, and is `pkg`-compatible. It provides a polished UX (spinner, select, confirm) with minimal API surface. `inquirer` is heavier and has known issues with `pkg` bundling.

**Alternatives considered:**
- **Native `readline`:** Works with `pkg` but requires building the prompt UI manually. Poor UX for a select prompt.
- **`inquirer`:** Large dependency tree, ESM-only in recent versions, known `pkg` bundling issues.
- **`prompts`:** Viable but less polished UI than `@clack/prompts`.

### 4. ANSI color codes for the compatibility report

**Choice:** Use raw ANSI escape sequences for green checkmarks (`✔`) and red cross-marks (`✘`) in the compatibility report. No dependency on `chalk` or `picocolors`.

**Rationale:** The report is a simple table with 3 rows (CPU, RAM, Swap). ANSI codes are two lines of code. Adding a color library for 6 usages is unnecessary overhead.

### 5. `--force` flag parsed from `process.argv`

**Choice:** Check `process.argv.includes('--force')` in the argument parsing section of `index.js`. No argparse library — the CLI has exactly one subcommand and three flags.

**Rationale:** The CLI surface is trivial: `k8s-ready prepare [--force] [--version] [--help]`. An argument parsing library would be over-engineering. Simple `includes()` checks suffice. If the CLI grows, `commander` or `yargs` can be introduced later.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **`/proc/swaps` not available** | Only occurs on non-Linux. The tool already targets Linux-only. Add a clear error if the file doesn't exist. |
| **`@clack/prompts` not bundled correctly by `pkg`** | Test the compiled binary interactively before release. `@clack/prompts` is pure JS with no native deps, so bundling should work. |
| **`--no-bytecode` increases binary size** | Marginal increase (~5-10%). Acceptable trade-off vs. the noisy warning that confuses users. |
| **Terminal without color/unicode support** | The ANSI report degrades gracefully — checkmarks and crosses still render as text, and colors simply don't apply if the terminal doesn't support them. |
