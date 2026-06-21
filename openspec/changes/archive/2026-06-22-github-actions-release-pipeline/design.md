## Context

The k8s-ready CLI is a Node.js-based tool compiled into standalone Linux binaries via `@yao-pkg/pkg`. The build system already produces two architecture-specific binaries (`k8s-ready-linux-amd64`, `k8s-ready-linux-arm64`) and a draft GitHub Actions workflow exists at `.github/workflows/release.yml`. This design formalizes that workflow into a three-job pipeline: **build → verify → release**.

The existing `package.json` defines:
- `build:amd64` / `build:arm64` / `build` scripts using `pkg` with `node20-linux-*` targets
- Output path: `dist/k8s-ready-linux-{amd64,arm64}`

The pipeline runs exclusively on GitHub-hosted runners. No self-hosted infrastructure is required.

## Goals / Non-Goals

**Goals:**
- Automate binary compilation for both `linux/amd64` and `linux/arm64` on every semver tag push.
- Inject the Git tag version into `package.json` before compilation so `--version` output reflects the release.
- Verify compiled binaries execute standalone on a minimal Ubuntu 22.04 container with no Node.js or Python runtime.
- Publish both binaries as GitHub Release assets with auto-generated release notes.
- Ensure deterministic builds via `npm ci` for locked dependency resolution.

**Non-Goals:**
- macOS or Windows binary compilation (Linux-only target).
- Docker image publishing or container registry integration.
- Automated changelog curation beyond GitHub's built-in release notes.
- NPM registry publishing.
- Code signing or checksum generation (can be added later).

## Decisions

### 1. Three-Job Pipeline Architecture

**Decision**: Split the workflow into three sequential jobs (`build` → `verify-minimal-ubuntu` → `release`) instead of a single monolithic job.

**Rationale**: Separating build, verification, and release provides clear failure isolation. If compilation succeeds but the binary fails standalone execution, the release is blocked. This prevents shipping broken artifacts.

**Alternative considered**: Single job with all steps inline — rejected because a build failure and a runtime failure would be conflated in logs, and the verification environment (minimal Ubuntu container) requires a distinct `container:` declaration.

### 2. Matrix Strategy for Cross-Compilation

**Decision**: Use a GitHub Actions matrix strategy with `fail-fast: false` to compile amd64 and arm64 in parallel.

**Rationale**: Parallel execution halves build time. `fail-fast: false` ensures one architecture's failure doesn't cancel the other, preserving diagnostic information for both targets.

**Alternative considered**: Sequential `npm run build` (both in one job) — rejected because it doubles wall-clock time unnecessarily.

### 3. Artifact Handoff Between Jobs

**Decision**: Use `actions/upload-artifact@v4` and `actions/download-artifact@v4` to pass compiled binaries between the `build` and `release` jobs.

**Rationale**: GitHub Actions jobs run on isolated VMs. Artifacts are the standard mechanism for inter-job data transfer. 7-day retention is sufficient since release assets become the permanent distribution point.

### 4. Tag-Derived Version Injection

**Decision**: Extract the version from `GITHUB_REF_NAME` (stripping the `v` prefix) and inject it via `npm version` before compilation.

**Rationale**: This ensures `k8s-ready --version` output matches the Git tag exactly. Using `--no-git-tag-version --allow-same-version` prevents npm from creating additional Git tags or failing on version collisions.

### 5. `softprops/action-gh-release@v2` for Release Publishing

**Decision**: Use the community `softprops/action-gh-release@v2` action rather than GitHub CLI (`gh release create`).

**Rationale**: `softprops/action-gh-release@v2` is widely adopted (10k+ stars), maintained, and provides declarative YAML configuration for asset upload, auto-generated release notes, and `fail_on_unmatched_files` safety. It reduces shell scripting in the workflow.

**Alternative considered**: `gh release create` via CLI — viable but requires more shell scripting and lacks the declarative `files` glob pattern.

### 6. Minimal Ubuntu Verification Container

**Decision**: Run standalone verification in an `ubuntu:22.04` container with explicit checks that neither Node.js nor Python are present.

**Rationale**: The compiled binaries must be truly standalone — no runtime dependencies. Testing on a minimal container without any language runtimes proves this property. This catches `pkg` configuration errors where native modules might not be correctly bundled.

## Risks / Trade-offs

- **[Risk] `@yao-pkg/pkg` arm64 cross-compilation on x64 runner** → Mitigation: `pkg` handles cross-compilation natively via pre-built Node.js binaries for each target. No QEMU/Docker buildx required.
- **[Risk] `softprops/action-gh-release@v2` becomes unmaintained** → Mitigation: The action is widely used and has multiple contributors. Fallback is `gh release create` CLI with minimal script changes.
- **[Risk] GitHub artifact upload/download adds latency** → Accepted trade-off for job isolation and verification guarantees.
- **[Risk] `npm ci` requires `package-lock.json` to be committed** → Already committed in the repository. CI will fail fast if lockfile is missing or out of sync.
