## 1. Workflow Skeleton & Trigger Configuration

- [x] 1.1 Create (or overwrite) `.github/workflows/release.yml` with workflow `name: Release` and the `on.push.tags` trigger restricted to `v*.*.*` pattern
- [x] 1.2 Set workflow-level `permissions: contents: write` to authorize release creation and asset attachment
- [x] 1.3 Verify: push a non-matching tag (e.g., `test-tag`) and confirm the workflow does NOT trigger

## 2. Build Job — Cross-Architecture Matrix

- [x] 2.1 Define the `build` job on `ubuntu-latest` with a `strategy.matrix` containing two entries: `{ target: node20-linux-x64, asset_name: k8s-ready-linux-amd64 }` and `{ target: node20-linux-arm64, asset_name: k8s-ready-linux-arm64 }`, with `fail-fast: false`
- [x] 2.2 Add step: `actions/checkout@v4` to clone the repository
- [x] 2.3 Add step: `actions/setup-node@v4` with `node-version: '20'` to install the Node.js runtime
- [x] 2.4 Add step: `npm ci` (or `npm install --no-fund --no-audit`) for deterministic dependency installation from `package-lock.json`
- [x] 2.5 Add step: extract version from `GITHUB_REF_NAME` (strip `v` prefix), inject into `package.json` via `npm version "${VERSION}" --no-git-tag-version --allow-same-version`
- [x] 2.6 Add step: compile the binary via `npx pkg . --target ${{ matrix.target }} --output dist/${{ matrix.asset_name }}`
- [x] 2.7 Add step: `chmod +x dist/${{ matrix.asset_name }}` to set executable permissions
- [x] 2.8 Add step: run `file` and `ls -la` on the compiled binary for build inspection logging
- [x] 2.9 Add step: execute `./dist/${{ matrix.asset_name }} --version` and assert output starts with `k8s-ready v`
- [x] 2.10 Add step: `actions/upload-artifact@v4` to upload the binary as a named artifact with 7-day retention

## 3. Verification Job — Standalone Execution on Minimal Ubuntu

- [x] 3.1 Define the `verify-minimal-ubuntu` job with `needs: build`, running on `ubuntu-latest` and executing an inline `docker run ubuntu:22.04` from the host (no job-level `container:` field, to prevent GitHub from injecting Node into the job)
- [x] 3.2 Add step: `actions/download-artifact@v4` to download the `k8s-ready-linux-amd64` artifact to `dist` (mounted into the container as `/tmp/binaries`)
- [x] 3.3 Add step: assert that neither `node` nor `python3` commands exist in the container (fail if either is found)
- [x] 3.4 Add step: `chmod +x` the binary, execute `--version`, and assert output matches `k8s-ready v*`

## 4. Release Job — GitHub Release & Asset Attachment

- [x] 4.1 Define the `release` job with `needs: [build, verify-minimal-ubuntu]`, running on `ubuntu-latest`
- [x] 4.2 Add step: `actions/checkout@v4` to clone the repository (needed for release context)
- [x] 4.3 Add step: `actions/download-artifact@v4` to download all artifacts to `/tmp/artifacts`
- [x] 4.4 Add step: stage release assets by copying both binaries from artifact directories into `release-assets/`, set `chmod +x`
- [x] 4.5 Add step: `softprops/action-gh-release@v2` with `files: release-assets/k8s-ready-linux-*`, `generate_release_notes: true`, and `fail_on_unmatched_files: true`

## 5. End-to-End Validation

- [x] 5.1 Push a semver tag (e.g., `v0.1.0-rc.1`) to the remote and confirm the full pipeline executes: build → verify → release
- [x] 5.2 Confirm both `k8s-ready-linux-amd64` and `k8s-ready-linux-arm64` appear as downloadable assets on the GitHub Release page
- [x] 5.3 Download the release binary on a clean machine, run `./k8s-ready-linux-amd64 --version`, and confirm output matches the tag version
