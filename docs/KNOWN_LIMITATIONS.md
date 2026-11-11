# Beta limitations

- No medical/surgical use, no registration, no full MRI statistical pipeline or complete MRIcroGL compatibility.
- Core tests run synthetic fixtures and atlas invariants; browser rendering, WebGL, memory and optional local-data workflows are not all certified on every OS/browser.
- The offline HTML is large (about87 MB). No promise of low-memory/mobile operation.
- NIfTI geometry must already be suitable for overlay. Imported p/q and the statistical meaning of selected4D frames require user confirmation.
- Raw value and cluster extent filters do not provide multiple-comparison correction. Display smoothing, statistic smoothing and surface smoothing have different consequences.
- 357 aggregated atlas structures,356 regional meshes; ontology leaves lacking geometry are unavailable. CCF coordinates are notbregma;100-µm display approximations are not10-µm measurement accuracy.
- Injection spread, light cones and probe contacts are illustrative unless supplied with independently calibrated geometry.
- Optional MERFISH/AAV bridge requires large external files and has not been tested as a turnkey installer. Bind only toloopback. Do not expose it as a public or shared server.
- Five study-derived network preset datasets and all actual study result pages are excluded. Swanson is not yet a general menu module in this beta.
- Historical Chinese guides were retained for scientific workflow details; use root README for current public-beta startup and bundled-data scope.
- Project exports may contain loaded raw/derived data and file provenance. Review before public sharing.
