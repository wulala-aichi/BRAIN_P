import fs from 'node:fs/promises';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const ctx={window:{},structuredClone};
for(const file of ['src/aav-core.js','data/research-reference.js','data/atlas-meshes.js'])vm.runInNewContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
const C=ctx.window.AtlasAavCore,R=ctx.window.MOUSE_RESEARCH_REFERENCE,buffer=zlib.inflateSync(Buffer.from(R.packed,'base64')),labels=new Uint16Array(buffer.buffer,buffer.byteOffset,buffer.length/2);
assert.equal(labels.filter(v=>v>0).length,ctx.window.MOUSE_ATLAS_3D.meshes.find(m=>m.regionIndex<0).sampledVoxelCount);
const tiny={dim:[2,2,2],spacing:.1,voxelCentreAPDV:.05,mlOffset:-.05,fingerprint:'test'},mask=new Uint16Array(8);mask[0]=1;mask[7]=2;
const synthetic={matched:99,voxels:[[.05,-.05,.05,.4],[.1,.05,.1,.7],[.05,.05,.05,.2],[-.1,-.05,.05,.8],[.25,.05,.1,.9],[NaN,0,0,.1]]},subset=C.clipVolume(synthetic,tiny,mask);
assert.equal(subset.voxels.length,2);assert.strictEqual(subset.voxels[0],synthetic.voxels[0]);assert.strictEqual(subset.voxels[1],synthetic.voxels[1]);assert.equal(subset.summary.outsideHidden,4);assert.equal(synthetic.matched,99);assert.equal(synthetic.voxels.length,6);assert.throws(()=>C.clipVolume(synthetic,tiny,new Uint16Array(1)),/掩膜/);
// Public fixture: sample real reference-mask coordinates, but assign synthetic intensities.
const voxels=[];for(let i=0;i<labels.length&&voxels.length<100;i+=1000){const x=i%132,y=Math.floor(i/132)%80,z=Math.floor(i/(132*80));voxels.push([.05+x*.1,R.mlOffset+z*.1,.05+y*.1,.4,0,x,y,z]);}
const source={matched:voxels.length,voxels},before=JSON.stringify(source),result=C.clipVolume(source,R,labels);
const expected=source.voxels.filter(v=>labels[v[5]+132*(v[6]+80*v[7])]>0);
assert.equal(JSON.stringify(result.voxels),JSON.stringify(expected));assert(result.summary.outsideHidden>0);assert.equal(result.summary.rawMatched,source.matched);assert.equal(JSON.stringify(source),before);
const viewer=await fs.readFile(new URL('../src/mesh-viewer.js',import.meta.url),'utf8');assert(viewer.includes('voxels=plan.visibleVoxels||[]'));assert(viewer.includes('volumeMask:plan.volumeMask'));
console.log(JSON.stringify({status:'ok',sameMaskAsShell:true,coordinateBounds:true,midpointTiesStable:true,rawUnchanged:true,realSourcePoints:source.voxels.length,visible:result.voxels.length,outsideHidden:result.summary.outsideHidden,rawMatched:source.matched}));
