## ADDED Requirements

### Requirement: Comprehensive .gitignore
The repository root SHALL contain a `.gitignore` file that excludes `node_modules/`, `dist/`, `.DS_Store`, and `*.log` (npm error logs).

#### Scenario: .gitignore covers all required patterns
- **WHEN** the `.gitignore` is inspected
- **THEN** it contains at minimum the lines: `node_modules/`, `dist/`, `.DS_Store`, `*.log`

#### Scenario: git status does not show ignored files
- **WHEN** `git status` is run after a build
- **THEN** the `dist/` and `node_modules/` directories do not appear as untracked files
