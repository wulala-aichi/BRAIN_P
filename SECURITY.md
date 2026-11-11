# Security and privacy

Research software,not a network service for public deployment. Keep the optional Python bridge on127.0.0.1 and use trusted local source data. Do not bind it externally, port-forward it, or rely on it for access control in a shared environment.

Report security issues through the repository's private vulnerability reporting option if enabled. Otherwise contact the maintainer through theGitHub profile before posting exploit details. Public Issues may be used for nonsensitive reproducible bugs.

The atlas/NIfTI frontend does not intentionally upload source images. Exported completeprojects may embed data, filenames or provenance; browser storage is local but accessible to software under the same origin/profile. Inspect before sharing. Vendored dependencies are pinned but still require vulnerability review when updated. No claim of comprehensive security certification is made.
