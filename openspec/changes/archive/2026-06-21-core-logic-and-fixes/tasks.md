## 1. Build System & Repository Cleanliness

- [x] 1.1 Update `package.json`: add `--no-bytecode` flag to `build:amd64` script (`pkg . --no-bytecode --target node20-linux-x64 --output dist/k8s-ready-linux-amd64`)
- [x] 1.2 Update `package.json`: add `--no-bytecode` flag to `build:arm64` script (`pkg . --no-bytecode --target node20-linux-arm64 --output dist/k8s-ready-linux-arm64`)
- [x] 1.3 Verify `.gitignore` contains all required entries: `node_modules/`, `dist/`, `.DS_Store`, `*.log` — add any missing lines
- [x] 1.4 Run `npm run build` to confirm both AMD64 and ARM64 builds complete without the bytecode warning

## 2. Dependency Setup

- [x] 2.1 Install `@clack/prompts` as a production dependency (`npm install @clack/prompts`) for the interactive role selection wizard
- [x] 2.2 Verify `@clack/prompts` is listed under `dependencies` in `package.json` (not `devDependencies`) so `pkg` bundles it

## 3. Hardware Detection Module (`src/hardware.js`)

- [x] 3.1 Create `src/hardware.js` exporting a `detectHardware()` function
- [x] 3.2 Implement CPU core detection using `os.cpus().length`
- [x] 3.3 Implement RAM detection using `os.totalmem()`, converted to GB (rounded to 1 decimal)
- [x] 3.4 Implement swap detection by reading `/proc/swaps` with `fs.readFileSync`: parse lines after the header — if any non-header lines exist, swap is enabled; otherwise disabled
- [x] 3.5 Handle `/proc/swaps` read failure (non-Linux): log a warning and default to `swapEnabled: true`
- [x] 3.6 Return a plain object: `{ cpus: number, ramGB: number, swapEnabled: boolean }`

## 4. Compatibility Validation Module (`src/validate.js`)

- [x] 4.1 Create `src/validate.js` exporting a `validateHardware(role, hardware)` function
- [x] 4.2 Define threshold constants: Master = `{ minCPU: 2, minRAM: 2, swapMustBeOff: true }`, Worker = `{ minCPU: 1, minRAM: 1, swapMustBeOff: true }`
- [x] 4.3 Evaluate each check (CPU ≥ threshold, RAM ≥ threshold, swap === disabled) and return an array of result objects: `{ check: string, current: string, required: string, pass: boolean }`
- [x] 4.4 Return a summary object: `{ results: [...], allPassed: boolean }`

## 5. Terminal Report Module (`src/ui.js`)

- [x] 5.1 Create `src/ui.js` exporting a `printReport(role, validationResult)` function
- [x] 5.2 Implement ANSI color helpers: green for ✔ pass, red for ✘ fail (raw escape sequences, no chalk dependency)
- [x] 5.3 Render a terminal table with columns: Check | Current | Required | Status — padded for alignment
- [x] 5.4 Print a summary footer line: "✔ System is compatible for <role> node" or "✘ System does NOT meet requirements for <role> node"

## 6. Prepare Command Orchestration (`src/index.js`)

- [x] 6.1 Add `prepare` subcommand detection: check if `args[0] === 'prepare'`
- [x] 6.2 Implement root privilege guard: check `process.getuid() === 0`, print error and exit 1 if not root
- [x] 6.3 Parse `--force` flag from `process.argv`
- [x] 6.4 Import and invoke `@clack/prompts` select to ask the user: "Select node role" with options "Master Node" / "Worker Node"; handle Ctrl+C cancellation cleanly
- [x] 6.5 Import and call `detectHardware()` from `src/hardware.js`, display detected values
- [x] 6.6 Import and call `validateHardware(role, hardware)` from `src/validate.js`
- [x] 6.7 Import and call `printReport(role, result)` from `src/ui.js`
- [x] 6.8 Implement gate logic: if `!allPassed && !force`, print "Aborting. Use --force to override." and exit 1; if `!allPassed && force`, print warning and continue; if `allPassed`, continue
- [x] 6.9 Print a placeholder message after successful validation: "Pre-flight passed. Provisioning steps will be implemented next."

## 7. Build Verification

- [x] 7.1 Run `npm run build` and confirm the AMD64 binary compiles cleanly with `@clack/prompts` bundled and `--no-bytecode` suppressing warnings
- [x] 7.2 Test the compiled binary locally: `sudo ./dist/k8s-ready-linux-amd64 prepare` — verify the interactive wizard, hardware report, and gate logic work end-to-end
