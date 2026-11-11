import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={window:{},structuredClone};for(const file of ['data/publication-palettes.js','src/utils.js','src/custom-values.js','src/colorbar.js','src/merfish-core.js','src/aav-core.js','src/comparison-core.js'])vm.runInNewContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
const V=ctx.window.AtlasValues,B=ctx.window.AtlasColorbar,M=ctx.window.AtlasMerfishCore,A=ctx.window.AtlasAavCore,C=ctx.window.AtlasComparisonCore;
assert.equal(Object.keys(V.maps).length,24);for(const name of ['deep_contrast','soft_contrast','moderate_contrast'])assert.equal(V.maps[name].length,9);assert.equal(Object.keys(V.categorical).length,4);assert.equal(V.maps.plasma.length,33);assert.equal(V.maps.cividis[0],'#00224e');assert.equal(V.maps.npg_blue.at(-1),'#3c5488');assert.equal(V.categorical.npg.colours[0],'#e64b35');assert.equal(V.categorical.aaas.colours[0],'#3b4992');
let checks=0;for(const[name,colors]of Object.entries(V.maps)){
  assert(colors.length>=2&&colors.every(c=>/^#[a-f0-9]{6}$/.test(c)));assert(V.mapInfo[name]?.kind);assert(!Object.hasOwn(V.categorical,name));
  const spec={range:[-2,2],stops:colors.map((colour,i)=>({colour,at:i/(colors.length-1)})),missingColour:'#e0e3e4'};
  for(const reverse of [false,true])for(const bins of [0,2,7,12])for(const value of [-2,-1,0,.13,.8,2]){const options={reverse,bins};assert.equal(V.valueColour(value,-2,2,name,'#e0e3e4',options),B.colour(value,spec,options));checks++;}
  assert.equal(V.valueColour(null,0,1,name),'#e0e3e4');assert.equal(V.valueColour(0,0,1,name),colors[0]);assert.equal(V.valueColour(1,0,1,name),colors.at(-1));
  assert.equal(M.settings({map:name}).map,name);assert.equal(A.settings({map:name}).map,name);assert.equal(C.clean({maps:{q:{map:name}}}).maps.q.map,name);
  assert.equal(M.clean(JSON.parse(JSON.stringify(M.clean({settings:{map:name}})))).settings.map,name);assert.equal(A.clean(JSON.parse(JSON.stringify(A.clean({settings:{map:name}})))).settings.map,name);
}
for(const name of ['npg','aaas','okabe_ito']){assert(!Object.hasOwn(V.maps,name));assert.equal(M.settings({map:name}).map,'inferno');assert.equal(A.settings({map:name}).map,'inferno');}
const legacy={viridis:['#440154','#3b528b','#21918c','#5ec962','#fde725'],teal:['#e4e7e8','#c3d9d6','#72aaa8','#0e5964'],diverging:['#2166ac','#92c5de','#f7f7f7','#f4a582','#b2182b'],inferno:['#000004','#57106e','#bc3754','#f98e09','#fcffa4']};for(const[name,colors]of Object.entries(legacy))assert.equal(JSON.stringify(V.maps[name]),JSON.stringify(colors));
const spec=name=>({version:2,range:[0,1],stops:V.maps[name].map((colour,i,all)=>({colour,at:i/(all.length-1)}))});assert(!B.compatible([{spec:spec('plasma')},{spec:spec('magma')}]).ok);assert(B.compatible([{spec:spec('plasma')},{spec:spec('plasma')}]).ok);
console.log(JSON.stringify({status:'ok',continuousMaps:Object.keys(V.maps).length,categoricalPalettes:4,mappingComparisons:checks,legacyUnchanged:true,consumerRoundtrips:true,categoryNotContinuous:true}));
