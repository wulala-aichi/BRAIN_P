import fs from 'node:fs/promises';
import vm from 'node:vm';
import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
const context={window:{}};
for(const file of ['data/atlas-meshes.js','src/mesh-viewer.js'])vm.runInNewContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const bundle=context.window.MOUSE_ATLAS_3D,blend=context.window.AtlasMeshViewer.interpolatePositions;
assert.equal(bundle.version,2);
const bytes=inflateSync(Buffer.from(bundle.packed,'base64'));
const points=(mesh,offset)=>new Float32Array(bytes.buffer,bytes.byteOffset+offset,mesh.vertices*3);
let vertices=0,changed=0,capVertices=0,strongRatio=0;
for(const mesh of bundle.meshes){
  const standard=points(mesh,mesh.offset),raw=points(mesh,mesh.rawOffset),strong=points(mesh,mesh.strongOffset),target=new Float32Array(raw.length);
  const sourceCopy=raw.slice();vertices+=mesh.vertices;
  assert.equal(mesh.strongSmoothingCycles,mesh.smoothingCycles*2);
  assert(mesh.roughnessStrong<mesh.roughnessBefore);
  assert(mesh.roughnessStrong<=mesh.roughnessAfter+1e-6);
  strongRatio+=mesh.roughnessStrong/mesh.roughnessBefore;
  for(const strength of [0,25,50,100,150,175,200]){
    blend(target,raw,standard,strong,strength);
    if(strength===0)assert.deepEqual(target,raw);
    if(strength===100)assert.deepEqual(target,standard);
    if(strength===200)assert.deepEqual(target,strong);
    for(let i=0;i<target.length;i+=3){
      assert(Number.isFinite(target[i])&&Number.isFinite(target[i+1])&&Number.isFinite(target[i+2]));
      assert(target[i]>=-5.8&&target[i]<=5.8&&Math.abs(target[i+1])<=4.2&&Math.abs(target[i+2])<=6.8);
      if(mesh.hemisphere==='L')assert(target[i]<=1e-6);
      if(mesh.hemisphere==='R')assert(target[i]>=-1e-6);
      if(raw[i]===0&&mesh.hemisphere!=='B'){assert.equal(target[i],0);capVertices++;}
    }
  }
  if(raw.some((value,i)=>value!==strong[i]))changed++;
  for(let i=0;i<5;i++){blend(target,raw,standard,strong,200);blend(target,raw,standard,strong,0);blend(target,raw,standard,strong,100);}
  assert.deepEqual(target,standard);assert.deepEqual(raw,sourceCopy);
}
assert.equal(changed,bundle.meshes.length);assert(capVertices>0);
const raw=Float32Array.of(0,2),standard=Float32Array.of(2,4),strong=Float32Array.of(4,6),out=new Float32Array(2);
assert.deepEqual([...blend(out,raw,standard,strong,50)],[1,3]);
assert.deepEqual([...blend(out,raw,standard,strong,150)],[3,5]);
assert.deepEqual([...blend(out,raw,standard,strong,-20)],[0,2]);
assert.deepEqual([...blend(out,raw,standard,strong,220)],[4,6]);
assert.deepEqual([...blend(out,raw,standard,strong,NaN)],[2,4]);
console.log(JSON.stringify({status:'ok',meshes:bundle.meshes.length,vertices,levels:[0,25,50,100,150,175,200],geometryChanges:changed,capVertices,noCumulativeDrift:true,strongMeanRoughnessRatio:strongRatio/bundle.meshes.length}));
