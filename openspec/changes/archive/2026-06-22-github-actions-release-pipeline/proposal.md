## Why

The k8s-ready CLI has reached full local stability — pre-flight checks, OS tuning, Containerd setup, package installation, and cluster bootstrapping all work flawlessly. However, delivering compiled binaries to end users still depends on manually pushing artifacts or relying on an undocumented workflow. We need a formally specified, automated cloud compilation and delivery pipeline via GitHub Actions that triggers on semantic version tags, cross-compiles for both amd64 and arm64, verifies standalone execution, and publishes binaries as GitHub Release assets. This eliminates manual release overhead and guarantees every tagged version produces verified, downloadable artifacts.

## What Changes

- Formalize the GitHub Actions release workflow at `.github/workflows/release.yml` as a spec-tracked capability with explicit requirements for trigger events, permissions, build matrix, verification, and artifact publishing.
- Enforce semver-gated triggering (`v*.*.*` tag push) as the sole activation mechanism.
- Require `contents: write` permission for automated GitHub Release creation.
- Mandate a multi-architecture build matrix producing `dist/k8s-ready-linux-amd64` and `dist/k8s-ready-linux-arm64`.
- Require a standalone verification job on a minimal Ubuntu container (no Node.js/Python runtime) to prove binaries are self-contained.
- Attach both compiled binaries to the GitHub Release with auto-generated release notes.

## Capabilities

### New Capabilities
- `release-pipeline`: Automated GitHub Actions workflow for cross-compilation, standalone verification, and GitHub Release publishing triggered by semver tags.

### Modified Capabilities
_(none — this is a new CI/CD capability, no existing specs are affected)_

## Impact

- **New file**: `.github/workflows/release.yml` (already exists in draft form — will be reconciled against the spec)
- **Dependencies**: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `softprops/action-gh-release@v2`
- **Build tooling**: `@yao-pkg/pkg` via `npm run build` (already configured in `package.json`)
- **No application code changes**: This change is purely CI/CD infrastructure
