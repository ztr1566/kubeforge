# Kubernetes Version Resolver

## Purpose
Defines the behavior of the Kubernetes version resolver, which queries the GitHub Releases API to discover the latest 3 stable Kubernetes minor versions and presents an interactive selection prompt so the user can pin the exact version used by the downstream Kubernetes repo setup and binary install stages.

## Requirements

### Requirement: Fetch Kubernetes releases from GitHub API
The system SHALL make an HTTPS GET request to `https://api.github.com/repos/kubernetes/kubernetes/releases` using the Node.js built-in `https` module to retrieve release metadata. The request MUST include a `User-Agent` header.

#### Scenario: GitHub API responds successfully
- **WHEN** the API returns a 200 status with a JSON array of release objects
- **THEN** the system parses the response and extracts release entries

#### Scenario: GitHub API returns an error status
- **WHEN** the API returns a non-200 status code (e.g., 403 rate limit)
- **THEN** the system throws an error with the HTTP status code and response body

#### Scenario: Network request fails
- **WHEN** the HTTPS request fails due to network issues (DNS resolution, timeout, etc.)
- **THEN** the system throws an error with the underlying network error message

### Requirement: Filter to stable releases only
The system SHALL exclude any release where `prerelease` is `true` or `draft` is `true`. Only releases with `tag_name` matching the pattern `v<major>.<minor>.<patch>` (no suffixes like `-alpha`, `-beta`, `-rc`) SHALL be considered stable.

#### Scenario: Mix of stable and pre-release entries
- **WHEN** the API response contains releases tagged `v1.32.4`, `v1.33.0-alpha.1`, `v1.32.3`
- **THEN** only `v1.32.4` and `v1.32.3` are included in the stable set

#### Scenario: Release is marked as draft
- **WHEN** a release has `draft: true`
- **THEN** it is excluded regardless of its tag format

### Requirement: Resolve latest 3 minor versions
The system SHALL group stable releases by major.minor version, select the latest patch release for each minor version, and return the top 3 most recent minor versions sorted in descending order.

#### Scenario: Multiple minor versions available
- **WHEN** stable releases exist for v1.32.4, v1.32.3, v1.31.8, v1.30.12, v1.29.16
- **THEN** the resolver returns `['v1.32.4', 'v1.31.8', 'v1.30.12']`

#### Scenario: Fewer than 3 minor versions available
- **WHEN** only 2 minor versions have stable releases
- **THEN** the resolver returns those 2 versions without error

### Requirement: Present version selection prompt
The system SHALL display an interactive CLI prompt listing the resolved versions with numbered options (1, 2, 3) and ask the user to select one. The selected version string SHALL be returned for use by downstream pipeline stages.

#### Scenario: User selects a version
- **WHEN** the prompt displays 3 versions and the user enters `1`
- **THEN** the first (latest) version string is returned

#### Scenario: User enters an invalid selection
- **WHEN** the user enters a value outside the valid range
- **THEN** the system throws an error with the invalid input value

#### Scenario: User cancels with Ctrl+C
- **WHEN** the user presses Ctrl+C during the version prompt
- **THEN** the process exits cleanly with code 0
