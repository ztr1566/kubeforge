## ADDED Requirements

### Requirement: Identify the real invoking user
The system SHALL read `process.env.SUDO_USER` to determine the non-root user who invoked the tool via `sudo`. If `SUDO_USER` is empty, undefined, or equals `root`, the system SHALL fall back to `process.env.USER`. If the resolved user is `root`, the home directory SHALL be `/root`. Otherwise, the home directory SHALL be `/home/<user>`.

#### Scenario: SUDO_USER is set to a non-root user
- **WHEN** `SUDO_USER` is `ztr`
- **THEN** the resolved user is `ztr` and home directory is `/home/ztr`

#### Scenario: SUDO_USER is empty or undefined
- **WHEN** `SUDO_USER` is not set (direct root login)
- **THEN** the system falls back to `process.env.USER` and prints a warning if defaulting to root

#### Scenario: SUDO_USER equals root
- **WHEN** `SUDO_USER` is `root`
- **THEN** the system uses `/root` as the home directory

### Requirement: Create .kube directory
The system SHALL create the directory `<home>/.kube/` using `fs.mkdirSync` with `{ recursive: true }` if it does not exist.

#### Scenario: Directory does not exist
- **WHEN** `<home>/.kube/` does not exist
- **THEN** the directory is created recursively

#### Scenario: Directory already exists
- **WHEN** `<home>/.kube/` already exists
- **THEN** the operation proceeds without error

### Requirement: Copy admin.conf to user kubeconfig
The system SHALL copy `/etc/kubernetes/admin.conf` to `<home>/.kube/config` using `fs.copyFileSync`.

#### Scenario: admin.conf exists
- **WHEN** `/etc/kubernetes/admin.conf` exists after `kubeadm init`
- **THEN** the file is copied to `<home>/.kube/config`

#### Scenario: admin.conf does not exist
- **WHEN** `/etc/kubernetes/admin.conf` does not exist
- **THEN** the system throws an error indicating kubeadm init may not have completed

### Requirement: Fix ownership of .kube directory and config file
The system SHALL resolve the UID and GID of the real user by executing `id -u <user>` and `id -g <user>` via `execSync`, then apply `fs.chownSync` to both `<home>/.kube/` and `<home>/.kube/config` with the resolved UID and GID.

#### Scenario: Ownership set for non-root user
- **WHEN** the resolved user is `ztr` with UID 1000 and GID 1000
- **THEN** `fs.chownSync` is called on `<home>/.kube/` and `<home>/.kube/config` with UID 1000 and GID 1000

#### Scenario: User is root
- **WHEN** the resolved user is `root`
- **THEN** chown is called with UID 0 and GID 0 (effectively a no-op)

#### Scenario: id command fails
- **WHEN** `id -u <user>` or `id -g <user>` returns a non-zero exit code
- **THEN** the system throws an error with the user name and command stderr
