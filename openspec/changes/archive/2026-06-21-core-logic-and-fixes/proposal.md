## Why

The project bootstrapped successfully with a working `install.sh`, `pkg`-based cross-compilation, and a minimal CLI stub. However, three problems block progress: (1) ARM64 builds emit a noisy `Failed to make bytecode node20-arm64` warning because `pkg` attempts bytecode generation by default during cross-compilation, (2) the `.gitignore` exists but needs verification against project conventions, and (3) the `prepare` subcommand — the tool's entire reason to exist — is not yet implemented. This change delivers the core interactive `prepare` flow: root enforcement, role selection wizard, hardware detection using only `pkg`-safe APIs, compatibility validation, and visual reporting.

## What Changes

- **Build fix**: Add `--no-bytecode` flag to `pkg` build scripts in `package.json` to suppress the cross-compilation V8 bytecode warning.
- **`.gitignore` hardening**: Ensure `.gitignore` covers `node_modules/`, `dist/`, `.DS_Store`, and `*.log`.
- **`prepare` command implementation**: Wire the `prepare` subcommand in `src/index.js` with root privilege validation, interactive role selection (Master/Worker), hardware detection (CPU, RAM, swap via Node.js `os` module and `/proc/swaps`), compatibility matrix evaluation, visual terminal report, and `--force` bypass.

## Capabilities

### New Capabilities
- `prepare-command`: Core interactive CLI flow for the `prepare` subcommand — root guard, role wizard, hardware detection, compatibility validation, and visual status reporting.

### Modified Capabilities
- `build-system`: Add `--no-bytecode` flag to suppress cross-compilation bytecode warning in `pkg` build scripts.
- `repo-hygiene`: Harden `.gitignore` to cover all required exclusion patterns.

## Impact

- **Modified files**: `package.json` (build scripts), `.gitignore`, `src/index.js` (prepare command routing + new modules).
- **New files**: `src/hardware.js` (hardware detection), `src/validate.js` (compatibility matrix), `src/ui.js` (terminal report formatting).
- **Dependencies**: May add `@clack/prompts` or use Node.js `readline` for interactive role selection. No native addons (must remain `pkg`-compatible).
- **Runtime requirements**: Linux only (`/proc/swaps` read). Must run as root (`process.getuid() === 0`).
