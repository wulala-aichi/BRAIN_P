import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';import {inflateSync} from 'node:zlib';
const ctx={CompressionStream,Blob,Response,TextEncoder};for(const file of ['utils.js','publication-export.js'])vm.runInNewContext(await fs.readFile(new URL('../src/'+file,import.meta.url),'utf8'),ctx);const E=ctx.AtlasFigureExport;
let cases=0;for(const dpi of [150,300,600])for(const alpha of [true,false])for(const[width,height]of [[1,1],[3,2],[17,11]]){
  const rgba=Uint8Array.from({length:width*height*4},(_,i)=>(i*31)%256),out=E.tiff(rgba,width,height,dpi,alpha),v=new DataView(out.buffer),tags=new Map();assert.equal(v.getUint16(0,true),0x4949);assert.equal(v.getUint16(2,true),42);assert.equal(v.getUint32(4,true),8);
  for(let i=0;i<v.getUint16(8,true);i++){const p=10+i*12;tags.set(v.getUint16(p,true),{type:v.getUint16(p+2,true),count:v.getUint32(p+4,true),value:v.getUint32(p+8,true)});}
  assert.equal(tags.get(256).value,width);assert.equal(tags.get(257).value,height);assert.equal(tags.get(277).value,alpha?4:3);assert.equal(tags.get(259).value,1);assert.equal(tags.get(296).value,2);assert.equal(tags.get(338)?.value,alpha?2:undefined);
  for(const id of [282,283]){assert.equal(v.getUint32(tags.get(id).value,true),dpi);assert.equal(v.getUint32(tags.get(id).value+4,true),1);}
  const offset=tags.get(273).value;assert.equal(out.length-offset,width*height*(alpha?4:3));if(alpha)assert.equal([...out.slice(offset)].join(','),[...rgba].join(','));else assert.equal([...out.slice(offset)].join(','),[...rgba].filter((_,i)=>i%4!==3).join(','));cases++;
}
for(const dpi of [150,300,600]){const s=E.size(183,140,dpi);assert.equal(s.width,Math.round(183/25.4*dpi));assert.equal(s.height,Math.round(140/25.4*dpi));}
assert.throws(()=>E.size(500,500,600),/1 亿/);assert.throws(()=>E.size(0,140,300),/无效/);assert.throws(()=>E.size(183,140,72),/无效/);assert.throws(()=>E.tiff(new Uint8Array(2),1,1,300),/不完整/);
assert.equal(E.size(400,500,600,false).width,9449);
assert(Math.abs(E.rasterScale({a:1,b:0,c:0,d:1},300)-300/72)<1e-10);assert.equal(E.rasterScale({a:0,b:2,c:-3,d:0},72),3);assert(Math.abs(E.rasterScale({a:1,b:0,c:2,d:1},72)-(1+Math.sqrt(2)))<1e-10);
const png=Buffer.from(await E.pngRGBA(Uint8Array.from([0,0,0,0,20,40,60,128,10,30,50,255]),3,1));assert.equal(png.subarray(1,4).toString(),'PNG');const idat=[];for(let p=8;p<png.length;){const n=png.readUInt32BE(p),type=png.subarray(p+4,p+8).toString();assert.equal(png.readUInt32BE(p+8+n),ctx.AtlasUtils.crc32(png.subarray(p+4,p+8+n)));if(type==='IDAT')idat.push(png.subarray(p+8,p+8+n));p+=n+12;}assert.deepEqual([...inflateSync(Buffer.concat(idat))],[0,255,255,255,0,20,40,60,128,10,30,50,255]);
console.log(JSON.stringify({status:'ok',tiffCases:cases,checks:['little-endian TIFF signature','RGB/RGBA samples','unassociated alpha','exact pixels','resolution rationals','inch units','physical rounding','size limits']}));
console.log(JSON.stringify({status:'ok',pngForPDF:'CRC/deflate/pixels checked',transparentRGB:'white bleed, alpha unchanged',vectorPDF:'no whole-page pixel limit'}));
