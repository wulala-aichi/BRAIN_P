import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {Script} from 'node:vm';
import './enhance-data.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const sources = await Promise.all(['src/index.html','src/styles.css','vendor/lucide.min.js','vendor/papaparse.min.js','vendor/three.min.js','data/atlas-data.js','data/atlas-meshes.js','data/research-reference.js','src/utils.js','src/custom-values.js','src/professional.js','src/colorbar.js','src/mesh-viewer.js','src/slice-depth.js','src/research-core.js','src/research-volume.js','src/research-ui.js','src/publication-annotations.js','src/publication-core.js','src/publication-ui.js','src/comparison-core.js','src/comparison-renderer.js','src/comparison-ui.js','src/app.js'].map(path => readFile(join(root,path),'utf8')));
const merfishAtlasContext={window:{}};new Script(sources[5]).runInNewContext(merfishAtlasContext);
const merfishAtlas=merfishAtlasContext.window.MOUSE_ATLAS_DATA;
await writeFile(join(root,'data/merfish-region-map.json'),JSON.stringify({format:'mouse-atlas-merfish-region-map',version:1,atlasId:merfishAtlas.atlasId,fingerprint:merfishAtlas.fingerprint,regions:merfishAtlas.regions.map(({id,name,structureId})=>({id,name,structureId})),ontology:merfishAtlas.ontology.map(({id,acronym,ancestors})=>({id,acronym,ancestors}))}));
const readDockStyles=await readFile(join(root,'src/research-dock.css'),'utf8');
const niftiStyles=await readFile(join(root,'src/nifti-stats.css'),'utf8');
const advancedStyles=await readFile(join(root,'src/mri-advanced.css'),'utf8');
const workbenchStyles=await readFile(join(root,'src/workbench.css'),'utf8');
let html = sources[0];
html=html.replace('/* RESEARCH_DOCK_STYLES */',()=>readDockStyles);
html=html.replace('/* NIFTI_STATS_STYLES */',()=>niftiStyles);
html=html.replace('/* MRI_ADVANCED_STYLES */',()=>advancedStyles);
html=html.replace('/* WORKBENCH_STYLES */',()=>workbenchStyles);
for(let index=2;index<sources.length;index++)new Script(sources[index],{filename:'embedded-script-'+index});
for (const [index, marker] of ['APP_STYLES','LUCIDE_VENDOR','CSV_VENDOR','THREE_VENDOR','ATLAS_DATA','MESH_DATA','RESEARCH_REFERENCE','APP_UTILS','CUSTOM_VALUES','PROFESSIONAL','COLORBAR','MESH_VIEWER','SLICE_DEPTH','RESEARCH_CORE','RESEARCH_VOLUME','RESEARCH_UI','PUBLICATION_ANNOTATIONS','PUBLICATION_CORE','PUBLICATION_UI','COMPARISON_CORE','COMPARISON_RENDERER','COMPARISON_UI','APP_SCRIPT'].entries()) html = html.replace(`/* ${marker} */`, () => sources[index + 1]);
await mkdir(join(root,'dist'), {recursive:true});
for(const [marker,path] of [['PUBLICATION_PALETTES','data/publication-palettes.js'],['JSPDF_VENDOR','vendor/jspdf.umd.min.js'],['SVG2PDF_VENDOR','vendor/svg2pdf.umd.min.js'],['FIGURE_EXPORT','src/publication-export.js'],['CONNECTOME_CORE','src/connectome-core.js'],['CONNECTOME_UI','src/connectome-ui.js'],['IMPLANTS','src/implants.js'],['IMPLANT_PUBLICATION','src/implant-publication.js'],['MERFISH_REGIONS','src/merfish-regions.js'],['MERFISH_CORE','src/merfish-core.js'],['MERFISH_UI','src/merfish-ui.js']]){const source=await readFile(join(root,path),'utf8');new Script(source,{filename:path});html=html.replace(`/* ${marker} */`,()=>source);}
for(const [marker,path]of [['NIFTI_STATS_CORE','src/nifti-stats-core.js'],['NIFTI_TEMPLATE_SMOOTHING','src/nifti-template-smoothing.js'],['NIFTI_STATS_UI','src/nifti-stats-ui.js']]){const source=await readFile(join(root,path),'utf8');new Script(source,{filename:path});html=html.replace(`/* ${marker} */`,()=>source);}
const fonts={normal:(await readFile(join(root,'vendor/fonts/NotoSansSC-Regular.ttf'))).toString('base64'),bold:(await readFile(join(root,'vendor/fonts/NotoSansSC-Bold.ttf'))).toString('base64'),coverage:JSON.parse(await readFile(join(root,'vendor/fonts/coverage.json'),'utf8'))};
for(const [marker,path]of [['NIIVUE_VENDOR','vendor/niivue.umd.js'],['MRI_FIGURE','src/mri-figure.js'],['MRI_ADVANCED_CORE','src/mri-advanced-core.js'],['MRI_ADVANCED_UI','src/mri-advanced-ui.js']]){let source=await readFile(join(root,path),'utf8');if(marker==='NIIVUE_VENDOR')source='/* '+(await readFile(join(root,'vendor/NIIVUE-LICENSE.txt'),'utf8'))+' */\n'+source;if(marker==='MRI_ADVANCED_UI')source='window.AtlasMRIAdvancedMatcap='+JSON.stringify('data:image/jpeg;base64,'+(await readFile(join(root,'vendor/niivue-Shiny.jpg'))).toString('base64'))+';\n'+source;new Script(source,{filename:path});html=html.replace(`/* ${marker} */`,()=>source);}
for(const [marker,path] of [['AAV_CORE','src/aav-core.js'],['AAV_RASTER','src/aav-raster.js'],['AAV_UI','src/aav-ui.js']]){const source=await readFile(join(root,path),'utf8');new Script(source,{filename:path});html=html.replace(`/* ${marker} */`,()=>source);}
fonts.licenses={font:await readFile(join(root,'vendor/fonts/OFL.txt'),'utf8'),jsPDF:await readFile(join(root,'vendor/JSPDF-LICENSE.txt'),'utf8'),svg2pdf:await readFile(join(root,'vendor/SVG2PDF-LICENSE.txt'),'utf8')};
const workbenchUI=await readFile(join(root,'src/workbench-ui.js'),'utf8');
new Script(workbenchUI,{filename:'src/workbench-ui.js'});
html=html.replace('/* WORKBENCH_UI */',()=>workbenchUI);
html=html.replace('/* EXPORT_FONTS */',()=>`window.AtlasExportFonts=${JSON.stringify(fonts)};`);
await writeFile(join(root,'dist','index.html'), html);
process.stdout.write(JSON.stringify({status:'ok',bytes:Buffer.byteLength(html),path:join(root,'dist','index.html')})+'\n');
