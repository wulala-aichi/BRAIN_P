import {readFile,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const root=new URL('./',import.meta.url),meta=JSON.parse(await readFile(new URL('data/mesh-volume-100um.json',root),'utf8'));
const raw=await readFile(new URL('data/mesh-volume-100um.u16',root));
const native=JSON.parse(await readFile(new URL('data/native-region-volumes.json',root),'utf8'));
if(native.fingerprint!==meta.fingerprint)throw new Error('Reference fingerprint mismatch');
const sums=new Map();
for(let k=0;k<meta.dim[2];k++)for(let j=0;j<meta.dim[1];j++)for(let i=0;i<meta.dim[0];i++){
  const code=raw.readUInt16LE(2*(i+meta.dim[0]*(j+meta.dim[1]*k)));if(!code)continue;
  const ap=.05+i*.1,dv=.05+j*.1,ml=meta.mlOffset+k*.1,id=meta.regions[code-1];
  for(const side of ['B',ml<0?'L':'R']){const key=id+'|'+side,item=sums.get(key)||[0,0,0,0];item[0]+=ap;item[1]+=ml;item[2]+=dv;item[3]++;sums.set(key,item);}
}
const centroids=Object.fromEntries([...sums].map(([key,[ap,ml,dv,n]])=>[key,{ap:ap/n,ml:ml/n,dv:dv/n}]));
const result={...meta,lookupResolutionMm:.1,packed:deflateSync(raw).toString('base64'),native,centroids};
await writeFile(new URL('data/research-reference.js',root),'window.MOUSE_RESEARCH_REFERENCE='+JSON.stringify(result)+';\n');
console.log(JSON.stringify({referenceBytes:raw.length,nativeRegions:native.regions.length,centroids:Object.keys(centroids).length}));
