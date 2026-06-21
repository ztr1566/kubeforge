## ADDED Requirements

### Requirement: Multi-architecture binary naming convention
Release assets MUST follow the naming pattern `k8s-ready-linux-{amd64,arm64}` to enable deterministic asset matching by the installer script.

#### Scenario: AMD64 release asset
- **WHEN** a new release is published
- **THEN** it MUST include an asset named `k8s-ready-linux-amd64` containing the compiled x86_64 binary

#### Scenario: ARM64 release asset
- **WHEN** a new release is published
- **THEN** it MUST include an asset named `k8s-ready-linux-arm64` containing the compiled aarch64 binary

### Requirement: Release asset as standalone executable
Each release asset MUST be a single statically-linked or self-contained executable binary that runs without any external runtime dependencies (no Node.js, Python, or shared libraries beyond glibc).

#### Scenario: Binary runs on minimal Ubuntu server
- **WHEN** the `k8s-ready-linux-amd64` binary is copied to a minimal Ubuntu 22.04 server with no Node.js or Python installed
- **THEN** the binary executes successfully and prints version information via `./k8s-ready-linux-amd64 --version`

### Requirement: Version flag support
The compiled binary MUST support a `--version` flag that prints the release version string to stdout and exits with code 0.

#### Scenario: Version flag output
- **WHEN** the user runs `k8s-ready --version`
- **THEN** the binary prints `k8s-ready v<semver>` (e.g., `k8s-ready v1.0.0`) to stdout and exits with code 0

### Requirement: GitHub Release publishing
Each tagged release MUST be published as a GitHub Release with both architecture-specific binary assets attached. The release tag MUST follow semantic versioning (e.g., `v1.0.0`).

#### Scenario: Tagged release triggers asset upload
- **WHEN** a git tag matching `v*.*.*` is pushed
- **THEN** a GitHub Release is created with `k8s-ready-linux-amd64` and `k8s-ready-linux-arm64` assets attached
