import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={window:{},setTimeout,Float32Array,Float64Array,Uint8Array};vm.runInNewContext(await fs.readFile(new URL('../src/nifti-template-smoothing.js',import.meta.url),'utf8'),ctx);const S=ctx.window.AtlasNiftiTemplateSmoothing;
const affine=[[.06,0,0,-4],[0,.12,0,-7],[0,0,.18,-3],[0,0,0,1]];
const v=(dims,values)=>({dims,values:Float32Array.from(values),affine,voxelMm3:.06*.12*.18,min:0,max:100});
const constant=v([5,6,7],Array(210).fill(13));constant.values[0]=0;constant.values[1]=NaN;constant.values[80]=0;const original=Buffer.from(constant.values.buffer).toString('base64');
assert.equal(await S.smooth(constant,0),constant);
for(const sigma of [.5,1,2,3]){const out=await S.smooth(constant,sigma);assert.notEqual(out.values,constant.values);assert.equal(out.affine,constant.affine);assert.equal(out.voxelMm3,constant.voxelMm3);for(let i=0;i<out.values.length;i++)assert(Math.abs(out.values[i]-(constant.values[i]>0?13:0))<1e-4);assert.equal(Buffer.from(constant.values.buffer).toString('base64'),original);}
const impulse=v([9,9,9],Array(729).fill(1));impulse.values[364]=101;const a=await S.smooth(impulse,.5),b=await S.smooth(impulse,1),c=await S.smooth(impulse,2);assert(a.values[364]>b.values[364]);assert(b.values[364]>c.values[364]);assert(a.values[364]<101);assert(b.values[365]>1);assert(b.values[373]>1);assert(b.values[445]>1);assert(Math.abs(b.values[365]-b.values[373])<1e-5);assert(Math.abs(b.values[373]-b.values[445])<1e-5);
const masked=v([5,1,1],[0,10,1,20,0]);const filtered=await S.smooth(masked,1,5);assert.equal(filtered.values[0],0);assert.equal(filtered.values[2],0);assert.equal(filtered.values[4],0);assert(filtered.values[1]>10);assert(filtered.values[3]<20);
const empty=await S.smooth(v([2,1,1],[0,NaN]),1);assert.deepEqual([...empty.values],[0,0]);
const r=S.recipe(constant,1);assert(Math.abs(r.fwhmAxisMm[0]-.1412892027)<1e-9);assert(Math.abs(r.fwhmAxisMm[1]-r.fwhmAxisMm[0]*2)<1e-10);assert.equal(r.displayOnly,true);
await assert.rejects(S.smooth(constant,4),/0–3/);await assert.rejects(S.smooth(constant,NaN),/0–3/);await assert.rejects(S.smooth(constant,1,NaN),/有限/);await assert.rejects(S.smooth(constant,1,0,{cancelled:()=>true}),/取消/);
console.log('NIfTI template smoothing: 3D Gaussian, zero bypass, normalized boundaries, strict support, immutable source, FWHM, cancellation PASS');
