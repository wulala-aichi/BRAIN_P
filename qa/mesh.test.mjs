import fs from 'node:fs/promises';import vm from 'node:vm';import {inflateSync} from 'node:zlib';import assert from 'node:assert/strict';
const context={window:{}};
for(const source of ['data/atlas-data.js','data/atlas-meshes.js','src/mesh-viewer.js'])vm.runInNewContext(await fs.readFile(new URL('../'+source,import.meta.url),'utf8'),context);
const data=context.window.MOUSE_ATLAS_DATA,bundle=context.window.MOUSE_ATLAS_3D;
assert.equal(bundle.sourceFingerprint,data.fingerprint);assert.equal(bundle.sampleVoxelMm,.1);
const buffer=inflateSync(Buffer.from(bundle.packed,'base64'));let triangles=0;const represented=new Set();
for(const mesh of bundle.meshes){
  const vertices=new Float32Array(buffer.buffer,buffer.byteOffset+mesh.offset,mesh.vertices*3),indices=new Uint32Array(buffer.buffer,buffer.byteOffset+mesh.offset+mesh.vertices*12,mesh.faces*3);
  assert(mesh.vertices>0&&mesh.faces>0);assert(mesh.offset+mesh.vertices*12+mesh.faces*12<=buffer.length);
  for(let index=0;index<vertices.length;index++)assert(Number.isFinite(vertices[index]));
  for(let index=0;index<vertices.length;index+=3){
    assert(vertices[index]>=-5.8&&vertices[index]<=5.8);assert(Math.abs(vertices[index+1])<=4.1);assert(Math.abs(vertices[index+2])<=6.7);
    if(mesh.hemisphere==='L')assert(vertices[index]<=1e-6);if(mesh.hemisphere==='R')assert(vertices[index]>=-1e-6);
  }
  let volume=0;
  for(let index=0;index<indices.length;index+=3){
    const a=indices[index]*3,b=indices[index+1]*3,c=indices[index+2]*3;assert(a<vertices.length&&b<vertices.length&&c<vertices.length);
    volume+=(vertices[a]*(vertices[b+1]*vertices[c+2]-vertices[b+2]*vertices[c+1])+vertices[a+1]*(vertices[b+2]*vertices[c]-vertices[b]*vertices[c+2])+vertices[a+2]*(vertices[b]*vertices[c+1]-vertices[b+1]*vertices[c]))/6;
  }
  assert(volume>0,'outward mesh '+mesh.regionIndex);triangles+=mesh.faces;if(mesh.regionIndex>=0)represented.add(mesh.regionIndex);
}
assert.equal(triangles,bundle.triangles);assert.equal(represented.size,356);assert.equal(bundle.missing[0].id,'c');
assert(bundle.smoothing.includes('Taubin'));
const largeMeshes=bundle.meshes.filter(mesh=>mesh.sampledVoxelCount>=512);
assert(largeMeshes.every(mesh=>mesh.roughnessAfter<mesh.roughnessBefore));
const roughnessRatio=largeMeshes.reduce((sum,mesh)=>sum+mesh.roughnessAfter/mesh.roughnessBefore,0)/largeMeshes.length;
assert(roughnessRatio<.6);
for(const name of ['CA1','DG','MOp']){const index=data.regions.findIndex(region=>region.id===name);for(const hemisphere of ['L','R'])assert(bundle.meshes.some(mesh=>mesh.regionIndex===index&&mesh.hemisphere===hemisphere));}
const point={ap:6.8,ml:-2.1,dv:4.2},world=context.window.AtlasMeshViewer.toWorld(point),restored=context.window.AtlasMeshViewer.fromWorld({x:world[0],y:world[1],z:world[2]});
for(const key of ['ap','ml','dv'])assert(Math.abs(point[key]-restored[key])<1e-10);
console.log(JSON.stringify({status:'ok',meshes:bundle.meshes.length,regions:represented.size,triangles,hemispheres:'passed',winding:'passed',coordinates:'passed',smoothingMeanRoughnessRatio:Number(roughnessRatio.toFixed(3)),missing:'c'}));
