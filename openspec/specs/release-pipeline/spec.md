# Release Pipeline

## Purpose
TBD

## Requirements

### Requirement: Semver Tag Trigger
The workflow SHALL execute exclusively when a Git tag matching the pattern `v*.*.*` is pushed to the remote repository. No other events (push to branches, pull requests, manual dispatch) SHALL trigger the pipeline.

#### Scenario: Valid semver tag triggers the workflow
- **WHEN** a tag `v1.2.3` is pushed to the remote repository
- **THEN** the release workflow starts executing

#### Scenario: Non-semver tag is ignored
- **WHEN** a tag `latest` or `beta-1` is pushed to the remote repository
- **THEN** the release workflow does NOT execute

#### Scenario: Branch push is ignored
- **WHEN** code is pushed to `main` or any other branch without a tag
- **THEN** the release workflow does NOT execute

### Requirement: Elevated Write Permissions
The workflow SHALL declare `permissions: contents: write` at the workflow level to authorize automated GitHub Release creation and asset attachment.

#### Scenario: Workflow has write access to releases
- **WHEN** the release job attempts to create a GitHub Release and attach binary assets
- **THEN** the operation succeeds because the workflow token has `contents: write` permission

### Requirement: Cross-Architecture Build Matrix
The workflow SHALL compile binaries for both `linux/amd64` (x64) and `linux/arm64` architectures in parallel using a matrix strategy with `fail-fast: false`.

#### Scenario: Parallel matrix compilation
- **WHEN** the build job executes
- **THEN** two parallel matrix legs run: one targeting `node20-linux-x64` producing `k8s-ready-linux-amd64`, and one targeting `node20-linux-arm64` producing `k8s-ready-linux-arm64`

#### Scenario: One architecture fails independently
- **WHEN** the arm64 compilation fails but amd64 succeeds
- **THEN** the amd64 build completes and uploads its artifact (fail-fast is disabled), and the release job is blocked

### Requirement: Deterministic Dependency Installation
The workflow SHALL use `npm ci` or equivalent locked installation to ensure reproducible builds from the committed `package-lock.json`.

#### Scenario: Dependencies installed from lockfile
- **WHEN** the build job installs dependencies
- **THEN** packages are resolved strictly from `package-lock.json` without modifying the lockfile

### Requirement: Node.js 20 Runtime
The workflow SHALL set up Node.js version 20 via `actions/setup-node@v4` for the build environment.

#### Scenario: Node.js version is pinned
- **WHEN** the build environment is configured
- **THEN** Node.js 20 is available and used for dependency installation and compilation

### Requirement: Tag-Derived Version Injection
The workflow SHALL extract the version from the Git tag (stripping the `v` prefix) and inject it into `package.json` before compilation so that the compiled binary's `--version` output matches the release tag.

#### Scenario: Version injected from tag
- **WHEN** the workflow runs for tag `v2.0.1`
- **THEN** `package.json` version is set to `2.0.1` before compilation, and `k8s-ready --version` outputs `k8s-ready v2.0.1`

### Requirement: Binary Artifact Upload
Each matrix leg SHALL upload its compiled binary as a GitHub Actions artifact for consumption by downstream jobs.

#### Scenario: Artifacts uploaded after build
- **WHEN** compilation completes successfully for a matrix leg
- **THEN** the compiled binary is uploaded as a named artifact (e.g., `k8s-ready-linux-amd64`) with a 7-day retention period

### Requirement: Standalone Verification on Minimal Ubuntu
The workflow SHALL include a verification job that runs the compiled amd64 binary inside a minimal `ubuntu:22.04` container with no Node.js or Python runtime installed, confirming the binary is fully self-contained.

#### Scenario: Binary executes without runtime dependencies
- **WHEN** the amd64 binary is executed in a minimal Ubuntu 22.04 container
- **THEN** `k8s-ready --version` produces output matching `k8s-ready v*` and the exit code is 0

#### Scenario: Verification confirms no runtimes present
- **WHEN** the verification job starts
- **THEN** it explicitly asserts that neither `node` nor `python3` commands are available in the container before running the binary

### Requirement: GitHub Release Creation
The workflow SHALL create a GitHub Release using `softprops/action-gh-release@v2` (or equivalent trusted action) with auto-generated release notes, gated behind successful completion of both the build and verification jobs.

#### Scenario: Release created after all checks pass
- **WHEN** both the build matrix and the minimal-Ubuntu verification job succeed
- **THEN** a GitHub Release is created with the tag name as the title and auto-generated release notes

#### Scenario: Release blocked on verification failure
- **WHEN** the standalone verification job fails
- **THEN** no GitHub Release is created

### Requirement: Binary Asset Attachment
The release step SHALL attach both `k8s-ready-linux-amd64` and `k8s-ready-linux-arm64` as downloadable assets to the GitHub Release, with `fail_on_unmatched_files: true` to prevent silent missing-asset releases.

#### Scenario: Both binaries attached to release
- **WHEN** the release is created
- **THEN** both `k8s-ready-linux-amd64` and `k8s-ready-linux-arm64` are listed as downloadable assets on the release page

#### Scenario: Missing binary fails the release
- **WHEN** one of the expected binaries is not found in the staged assets directory
- **THEN** the release step fails with an error (due to `fail_on_unmatched_files: true`)

### Requirement: Executable Permissions
All compiled binaries SHALL have executable permissions (`chmod +x`) set before upload and before release attachment.

#### Scenario: Binaries are executable
- **WHEN** the compiled binaries are staged for release
- **THEN** each binary has the executable permission bit set
