# Build System

## Purpose
Defines requirements for the npm build scripts in `package.json` that compile the `k8s-ready` CLI into standalone binaries across multiple architectures using pkg/nexe-style cross-compilation. Covers flags and behaviors required to produce clean, warning-free build output.

## Requirements

### Requirement: Suppress bytecode warning in ARM64 builds
The `build:arm64` script in `package.json` SHALL include the `--no-bytecode` flag to prevent the `Failed to make bytecode node20-arm64` warning during cross-compilation.

#### Scenario: ARM64 build with --no-bytecode
- **WHEN** `npm run build:arm64` is executed
- **THEN** the build completes without the "Failed to make bytecode" warning

#### Scenario: AMD64 build consistency
- **WHEN** `npm run build:amd64` is executed
- **THEN** the build also uses `--no-bytecode` for consistency across both architectures
