// Deterministic synthetic data. No animals, inference or real measurements.
import fs from 'node:fs/promises';
const out=new URL('../examples/generated/',import.meta.url);await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('SIMULATED_regional_values.csv',out),'region,value,p,q,hemisphere\nMOp,0.8,,,B\nMOs,-0.5,,,B\nACAd,0,,,B\nCA1,1.1,,,B\nDG,NA,,,B\n');
const dims=[48,40,32],n=dims.reduce((a,b)=>a*b,1);
function nii(stat){const b=new Uint8Array(352+n*4),v=new DataView(b.buffer);v.setInt32(0,348,true);v.setInt16(40,3,true);dims.forEach((d,i)=>v.setInt16(42+2*i,d,true));v.setInt16(70,16,true);v.setInt16(72,32,true);v.setFloat32(108,352,true);v.setFloat32(112,1,true);b[123]=2;v.setInt16(254,1,true);[.2,0,0,-4.8,0,.2,0,-4,0,0,.2,-3.2].forEach((x,i)=>v.setFloat32(280+i*4,x,true));[1,.2,.2,.2].forEach((x,i)=>v.setFloat32(76+i*4,x,true));b.set(new TextEncoder().encode('SIMULATED phantom; not anatomical/experimental data'),148);b.set([110,43,49,0],344);
  for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){const a=(x-24)/21,c=(y-20)/17,d=(z-16)/13,r=a*a+c*c+d*d;let f=0;if(r<1)f=stat?5*Math.exp(-((x-18)**2+(y-20)**2+(z-16)**2)/18)-4*Math.exp(-((x-31)**2+(y-23)**2+(z-17)**2)/16):70+25*Math.cos(r*7);v.setFloat32(352+4*(x+dims[0]*(y+dims[1]*z)),f,true);}return b;}
await fs.writeFile(new URL('SIMULATED_template.nii',out),nii(false));await fs.writeFile(new URL('SIMULATED_statistic.nii',out),nii(true));
await fs.writeFile(new URL('README.txt',out),'SYNTHETIC DEMONSTRATION ONLY. Ellipsoidal phantom, not a mouse anatomical template. Statistic values are arbitrary; select raw-value display, not inferential p-values. Regional CSV includes both a real zero and missing NA.');
console.log('Generated examples/generated/: synthetic regional CSV and NIfTI phantom/template.');
