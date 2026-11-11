# Research-beta release acceptance

Do not tag a prerelease until the relevant evidence is linked in release notes.

- [ ] No personal study outputs, original MRI/H5AD/Excel, cache, author-machine paths or secrets in the final tracked tree.
- [ ] Original-code license confirmed by the rights holder; third-party and atlas data terms separated and retained.
- [ ] Fresh checkout on a second environment runs core tests and builds without R, private outputs, or author runtime caches.
- [ ] Node22/24 and Windows/Linux CI jobs pass. Report browser/OS smoke-test coverage honestly; untestedoptional modules stay experimental.
- [ ] Anatomy, regional CSV zero/NA, numeric mapping, hemispheres, saved project and export smoke tests complete.
- [ ] Synthetic NIfTI template/statistic loads, correct value threshold and volume geometry are visible, and input bytes remain unmodified.
- [ ] Default app is usable without optional Python bridge or data. Missingdata errors are actionable.
- [ ] Release artifact includes README,licenses, data terms,version and SHA-256; no misleading claims of stable/inference/registration capability.

Stable-release work includes reproducible optional-backend environments, larger-format/memory tests, cross-browser end-to-end matrix, data onboarding, migration coverage, and maintained issue response. These are not prerequisites for calling an honestly scoped candidate beta, but unresolvedcore correctness or licensing issues are blocking.
