## ADDED Requirements

### Requirement: Create apt keyrings directory
The system SHALL ensure the directory `/etc/apt/keyrings/` exists before writing the GPG key. If it does not exist, it MUST be created with `fs.mkdirSync` using `{ recursive: true }`.

#### Scenario: Directory does not exist
- **WHEN** `/etc/apt/keyrings/` does not exist
- **THEN** the directory is created recursively

#### Scenario: Directory already exists
- **WHEN** `/etc/apt/keyrings/` already exists
- **THEN** the operation proceeds without error

### Requirement: Download and install GPG signing key
The system SHALL download the Kubernetes GPG signing key from `https://pkgs.k8s.io/core:/stable:/v<major>.<minor>/deb/Release.key` using the Node.js built-in `https` module, where `<major>.<minor>` matches the user-selected Kubernetes version. The downloaded ASCII-armored key SHALL be converted to binary format by piping through `gpg --dearmor` and writing the output to `/etc/apt/keyrings/kubernetes-apt-keyring.gpg`.

#### Scenario: Key download and conversion succeeds
- **WHEN** the user selected version `v1.32.4`
- **THEN** the key is fetched from `https://pkgs.k8s.io/core:/stable:/v1.32/deb/Release.key`, dearmored, and saved to `/etc/apt/keyrings/kubernetes-apt-keyring.gpg`

#### Scenario: Key download fails
- **WHEN** the HTTPS request for the GPG key returns a non-200 status or network error
- **THEN** the system throws an error with the HTTP status or network error message

#### Scenario: gpg --dearmor fails
- **WHEN** the `gpg --dearmor` command returns a non-zero exit code
- **THEN** the system throws an error with the gpg stderr output

### Requirement: Write apt sources list
The system SHALL write an apt repository definition to `/etc/apt/sources.list.d/kubernetes.list` with the content:
```
deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v<major>.<minor>/deb/ /
```
where `<major>.<minor>` matches the user-selected Kubernetes version. If the file already exists, it SHALL be overwritten.

#### Scenario: Sources list written for v1.32
- **WHEN** the user selected version `v1.32.4`
- **THEN** the file `/etc/apt/sources.list.d/kubernetes.list` contains `deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.32/deb/ /`

#### Scenario: Sources list already exists
- **WHEN** `/etc/apt/sources.list.d/kubernetes.list` already exists from a previous run
- **THEN** the file is overwritten with the new content matching the selected version

### Requirement: Use modern pkgs.k8s.io repository exclusively
The system SHALL NOT configure the legacy `apt.kubernetes.io` repository. All repository URLs MUST use the `pkgs.k8s.io` domain.

#### Scenario: Repository configuration is inspected
- **WHEN** the sources list file is written
- **THEN** the file content does not contain `apt.kubernetes.io` anywhere

### Requirement: Idempotent repository setup
The repository setup operation SHALL be safe to run multiple times. Re-running MUST NOT leave duplicate entries or corrupted keyring files.

#### Scenario: Re-run after successful provisioning
- **WHEN** repo setup runs again on a node already provisioned by k8s-ready
- **THEN** the GPG key is re-downloaded and overwritten, the sources list is overwritten, and the operation completes without error
