# Research-beta release acceptance

Do not tag a prerelease until the relevant evidence is linked in release notes.

- [x] Final allowlisted-tree privacy preflight passed (docs/release/preflight.json); this is not a comprehensive security certification.
- [x] Original-code license confirmed by the rights holder; third-party and atlas data terms separated and retained.
- [x] Fresh GitHub-hosted checkouts run core tests/build without R, private outputs or author caches (docs/release/ci-validation.json).
- [x] Node22/24 and Windows/Linux core CI jobs pass. Browser/backend coverage remains separately limited.
- [ ] Anatomy, regional CSV zero/NA, numeric mapping, hemispheres, saved project and export smoke tests complete.
- [x] Synthetic NIfTI template/statistic smoke test passed; original project/input bytes verified (docs/release/browser-smoke.json).
- [x] Default atlas core starts without Python bridge or local study data; optional data service remains experimental.
- [x] Locally tested offline packaging includes notices,version and SHA-256; public asset appears only if tag CI and release job succeed.

The unchecked comprehensive browser workflow item is a documented beta limitation, not a claim of completed validation. Existing core unit tests cover many of its numerical/project/export contracts; a full end-to-end matrix is still required for a stable release.

Stable-release work includes reproducible optional-backend environments, larger-format/memory tests, cross-browser end-to-end matrix, data onboarding, migration coverage, and maintained issue response. These are not prerequisites for calling an honestly scoped candidate beta, but unresolvedcore correctness or licensing issues are blocking.
