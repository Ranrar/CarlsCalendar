# Security Policy

## Reporting a Vulnerability

Please do **not** open public issues for sensitive security reports.

Use one of these channels:

1. **Preferred:** GitHub private vulnerability reporting (Security Advisory) for this repository.
2. If private reporting is unavailable, open an issue with minimal details and ask maintainers for a private channel before sharing exploit details.

When reporting, include:
- affected component (`backend`, `frontend`, `nginx`, etc.)
- reproduction steps / proof of concept
- impact and attack preconditions
- suggested mitigation (if known)

## Dependency Security Notes

This repository runs automated dependency audits in `.github/workflows/dependency-audit.yml`.

### Temporary RustSec exception: `RUSTSEC-2023-0071`

`cargo audit` is currently run with:

- `--ignore RUSTSEC-2023-0071`

Reason:
- The advisory is currently transitive via `sqlx-mysql -> rsa`.
- RustSec/GHSA report no patched upstream release path at this time.
- In this project, the transitive path is used by MySQL client authentication flow and does not expose application-owned RSA private-key operations.

This is a **temporary risk acceptance**, not a permanent waiver.

### Review and removal criteria

Remove the ignore once any of the following is available:
- a patched upstream `rsa` dependency path in `sqlx-mysql`/`sqlx`
- a dependency upgrade path that no longer includes the affected vulnerable usage
- an architecture change that fully eliminates this transitive dependency

Maintain this policy by re-checking on dependency updates and at least during scheduled audit runs.
