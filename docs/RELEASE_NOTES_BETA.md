# BRAIN_P 3.20.0-beta.1 — research prerelease

## Downloads

For the ready-to-open application, download the **offline ZIP** and check it against `SHA256SUMS.txt`. Extract it and open `index.html` in a recent Chrome or Edge browser. No Node/Python installation is needed for the core offline viewer.

GitHub's automatically generated **Source code** archives contain developer sources; follow the repository README to build them with Node22/24. Do not confuse the source archive with the offline application ZIP.

## Included

Mouse atlas slice/region visualization, regional CSV data, NIfTI template/statistic display, figure composition/export and complete-project workflows. The interface is primarily Chinese with English scientific labels. Bundled examples are explicitly synthetic phantoms/values, not real animal data.

Original code is MIT; Allen-derived atlas assets, fonts and third-party libraries retain separate terms. See the included notices before redistributing or considering commercial use.

## Validation and scope

- 33 core regression files; this release workflow requires all four Windows/Linux x Node22/24 jobs to pass before publishing the asset.
- Local Chromium smoke test: clean public-edition startup; synthetic NIfTI overlay with raw-value threshold2.3 retains296 voxels in2 clusters. Complete-project source bytes exactly match inputs; source-fileSHA-256 unchanged.
- Prior author-browser caches are isolated from the public edition. Private study outputs and five project-derived built-in network presets are not distributed.
- Core atlas/NIfTI viewing does not upload input images. Complete-project files may embed input data/provenance; review before sharing.

This is **not** a stable or comprehensive cross-browser scientific validation. Optional MERFISH/AAV bridges and advanced research workflows remain experimental and require separately acquired local data. No registration, full MRI statistical pipeline, multiple-comparison correction from cluster extent alone, complete MRIcroGL compatibility, diagnostic or surgical use is claimed.

Swanson result pages from private studies are not bundled as a general module. See repository docs/KNOWN_LIMITATIONS.md and docs/RELEASE_CRITERIA.md for remaining work.
