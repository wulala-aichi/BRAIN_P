Lucide browser icons, vendored for offline use.

NiiVue 0.69.0, BSD-2-Clause (`NIIVUE-LICENSE.txt`).
Official npm archive: https://registry.npmjs.org/@niivue/niivue/-/niivue-0.69.0.tgz .
Archive SHA-512 (base64): YMjQvJgD1W2b7DuoxkwlC4VxbrgIePRJ5qyQzXKxi2v2MBVg285P/CIQyg46oDDGDIcaNlbd+MhtO/edMbXJkA== .
The official `dist/niivue.umd.js` is embedded locally by `build.mjs`, with its complete license prepended. The advanced MRI viewer does not fetch this dependency or upload image data at runtime.
`niivue-Shiny.jpg` is the same release's `src/matcaps/Shiny.jpg`, embedded as the resettable default MatCap under the NiiVue license.

Source: https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js
License: ISC, distributed by the lucide-icons project.

Papa Parse 5.4.1, MIT license.
Source: https://unpkg.com/papaparse@5.4.1/papaparse.min.js

Three.js 0.160.1, MIT license (`THREE-LICENSE.txt`).
Source: https://unpkg.com/three@0.160.1/build/three.min.js
SHA-256: 170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa

jsPDF 4.2.1 and svg2pdf.js 2.8.1, MIT license (`JSPDF-LICENSE.txt`, `SVG2PDF-LICENSE.txt`).
Pinned npm distribution archives: https://registry.npmjs.org/jspdf/-/jspdf-4.2.1.tgz and https://registry.npmjs.org/svg2pdf.js/-/svg2pdf.js-2.8.1.tgz . UMD browser bundles are embedded by build.mjs; the app never fetches libraries during export.

Noto Sans SC, Sans2.004 release, SIL Open Font License (`fonts/OFL.txt`).
Source: https://github.com/notofonts/noto-cjk/tree/Sans2.004 . The variable TTF at `Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf` is instantiated at weights 400 and 700 by `tools/prepare-export-fonts.py`. Static files and character coverage are embedded in the offline build. Unicode PDF labels use this embedded font; basic Latin uses PDF standard Helvetica/Times equivalents.
