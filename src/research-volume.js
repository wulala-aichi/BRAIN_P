(function(scope){
  'use strict';
  function inverse(matrix){if(matrix.length!==4||matrix.some(row=>row.length!==4||row.some(v=>!Number.isFinite(v))))throw new Error('体积仿射含无效数值');const rows=matrix.map((row,i)=>[...row,...[0,1,2,3].map(j=>Number(i===j))]);for(let i=0;i<4;i++){let pivot=i;for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;if(Math.abs(rows[pivot][i])<1e-12)throw new Error('体积仿射矩阵不可逆');[rows[i],rows[pivot]]=[rows[pivot],rows[i]];const divisor=rows[i][i];rows[i]=rows[i].map(v=>v/divisor);for(let j=0;j<4;j++)if(j!==i){const factor=rows[j][i];rows[j]=rows[j].map((v,k)=>v-factor*rows[i][k]);}}return rows.map(row=>row.slice(4));}
  const transform=(matrix,point)=>matrix.slice(0,3).map(row=>row[0]*point[0]+row[1]*point[1]+row[2]*point[2]+row[3]);
  const ras=point=>[point.ml,5.35-point.ap,5.22-point.dv];
  const ccf=point=>({ml:point[0],ap:5.35-point[1],dv:5.22-point[2]});
  const determinant=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const frameSources=new WeakMap();
  function afniFrames(bytes,view,offset,le,count,intent){
    const attrs=new Map(),decode=s=>s.replace(/&(?:quot|apos|lt|gt|amp);/g,x=>({'&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'})[x]);
    if(bytes[348])for(let p=352;p+8<=offset;){const size=view.getInt32(p,le),code=view.getInt32(p+4,le);if(size<8||size%16||p+size>offset)throw new Error('NIfTI扩展长度无效');if(code===4){const text=new TextDecoder().decode(bytes.subarray(p+8,p+size));for(const match of text.matchAll(/<AFNI_atr\b([^>]*)>([\s\S]*?)<\/AFNI_atr>/g)){const name=/\batr_name\s*=\s*["']([^"']+)["']/.exec(match[1])?.[1];if(name){const quoted=[...match[2].matchAll(/"([^"]*)"/g)];attrs.set(name,decode(quoted.length?quoted.map(x=>x[1]).join(''):match[2].trim()));}}}p+=size;}
    const labels=(attrs.get('BRICK_LABS')||'').replace(/\0.*$/s,'').split('~'),hasAFNI=attrs.has('BRICK_STATAUX'),stats=new Map();
    const nums=(attrs.get('BRICK_STATAUX')||'').trim().split(/\s+/).filter(Boolean).map(Number);
    for(let p=0;p<nums.length;){const[index,code,n]=nums.slice(p,p+3);if(!Number.isInteger(index)||!Number.isInteger(n)||n<0||p+3+n>nums.length)throw new Error('AFNI子体积统计参数无效');const params=nums.slice(p+3,p+3+n);if(!params.every(Number.isFinite))throw new Error('AFNI统计参数含无效数值');stats.set(index,{code,params:[...params,0,0,0].slice(0,3),name:labels[index]||'',source:'AFNI BRICK_STATAUX'});p+=3+n;}
    return Array.from({length:count},(_,index)=>({index,label:labels[index]||'Volume '+(index+1),intent:stats.get(index)||(hasAFNI?{code:0,params:[0,0,0],name:labels[index]||'',source:'AFNI non-statistical sub-brick'}:{...intent,params:[...intent.params],source:'NIfTI intent'})}));
  }
  function selectFrame(volume,index){
    const source=frameSources.get(volume);if(!source)throw new Error('缺少原始多体积数据，请重新载入文件');
    if(!Number.isInteger(index)||index<0||index>=source.frameCount)throw new Error('子体积索引超出范围');
    if(!source.volumes.length)source.volumes=afniFrames(source.bytes,source.view,source.offset,source.le,source.frameCount,source.meta.intent);
    const {view,count,type,offset,le,slope,intercept,meta,volumes}=source,values=[8,64,768].includes(meta.datatype)?new Float64Array(count):new Float32Array(count);let min=Infinity,max=-Infinity;
    const start=offset+index*count*type[1];if(start+count*type[1]>source.bytes.length)throw new Error('所选子体积数据被截断');
    for(let i=0;i<count;i++){const value=view[type[0]](start+i*type[1],le)*slope+intercept;values[i]=value;if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}}
    if(!Number.isFinite(min))throw new Error('所选子体积中没有有限数值');
    const selected={...meta,values,min,max,frames:1,higherDims:[1,1,1],intent:volumes[index].intent,series:{index,count:source.frameCount,dimensions:[...source.dimensions],label:volumes[index].label,volumes}};frameSources.set(selected,source);return selected;
  }
  async function read(input,options={}){
    let bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let le=true;if(view.getInt32(0,true)!==348){if(view.getInt32(0,false)!==348)throw new Error('仅支持单文件 NIfTI-1 (.nii/.nii.gz)');le=false;}
    if(String.fromCharCode(...bytes.slice(344,347))!=='n+1')throw new Error('请提供单文件 NIfTI n+1，不支持 hdr/img 配对');
    const dims=[0,1,2].map(i=>view.getInt16(42+2*i,le));if(dims.some(v=>v<1))throw new Error('体积维度无效');const count=dims.reduce((a,b)=>a*b,1),maxVoxels=options.maxVoxels||128000000;if(count>maxVoxels)throw new Error('体积超过当前查看器 '+maxVoxels.toLocaleString()+' 体素上限，请在本地降采样后导入');
    const datatype=view.getInt16(70,le),types={2:['getUint8',1],4:['getInt16',2],8:['getInt32',4],16:['getFloat32',4],64:['getFloat64',8],256:['getInt8',1],512:['getUint16',2],768:['getUint32',4]},type=types[datatype];if(!type)throw new Error('不支持的数据类型：'+datatype);
    const offset=Math.max(352,Math.round(view.getFloat32(108,le)));if(!Number.isFinite(offset)||offset+count*type[1]>bytes.length)throw new Error('NIfTI数据被截断');
    const rawSlope=view.getFloat32(112,le),slope=rawSlope||1,intercept=rawSlope?(view.getFloat32(116,le)||0):0,values=[8,64,768].includes(datatype)?new Float64Array(count):new Float32Array(count);let minimum=Infinity,maximum=-Infinity;
    for(let i=0;i<count;i++){const value=view[type[0]](offset+i*type[1],le)*slope+intercept;values[i]=value;if(Number.isFinite(value)){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}}
    if(!Number.isFinite(minimum))throw new Error('体积中没有有限数值');
    let affine,space='sform';
    if(view.getInt16(254,le)>0)affine=[0,1,2].map(i=>[0,1,2,3].map(j=>view.getFloat32(280+i*16+j*4,le)));
    else if(view.getInt16(252,le)>0){
      space='qform';let b=view.getFloat32(256,le),c=view.getFloat32(260,le),d=view.getFloat32(264,le),norm=b*b+c*c+d*d,a=0;if(norm>1){norm=Math.sqrt(norm);b/=norm;c/=norm;d/=norm;}else a=Math.sqrt(1-norm);
      const scales=[Math.abs(view.getFloat32(80,le)),Math.abs(view.getFloat32(84,le)),Math.abs(view.getFloat32(88,le))*(view.getFloat32(76,le)<0?-1:1)];
      affine=[[a*a+b*b-c*c-d*d,2*(b*c-a*d),2*(b*d+a*c)],[2*(b*c+a*d),a*a+c*c-b*b-d*d,2*(c*d-a*b)],[2*(b*d-a*c),2*(c*d+a*b),a*a+d*d-c*c-b*b]].map((row,i)=>[...row.map((v,j)=>v*scales[j]),view.getFloat32(268+i*4,le)]);
    }else{space='uncalibrated';affine=[0,1,2].map(i=>[0,1,2].map(j=>i===j?Math.abs(view.getFloat32(80+i*4,le))||1:0).concat(0));}
    affine.push([0,0,0,1]);const units=bytes[123]&7,factor=units===1?1000:units===3?.001:1;
    affine=affine.map((row,i)=>i<3?row.map(v=>v*factor):row);
    const frames=Math.max(1,view.getInt16(48,le)),higherDims=[50,52,54].map(i=>Math.max(1,view.getInt16(i,le))),dimensions=[frames,...higherDims],frameCount=dimensions.reduce((a,b)=>a*b,1),intent={code:view.getInt16(68,le),params:[56,60,64].map(i=>view.getFloat32(i,le)),name:String.fromCharCode(...bytes.slice(328,344)).replace(/\0.*$/s,'')};
    const meta={dims,affine,inverse:inverse(affine),voxelMm3:Math.abs(determinant(affine)),space,units:units===0?'unknown-assumed-mm':'mm',frames,datatype,intent,higherDims,description:String.fromCharCode(...bytes.slice(148,228)).replace(/\0.*$/s,'')},selected=options.selectFrame===true||options.frameIndex!==undefined;
    if(!Number.isSafeInteger(frameCount)||selected&&offset+count*type[1]*frameCount>bytes.length)throw new Error('NIfTI多体积数据被截断或维度无效');
    const volume={...meta,values,min:minimum,max:maximum},volumes=selected?afniFrames(bytes,view,offset,le,frameCount,intent):[];frameSources.set(volume,{bytes,view,count,type,offset,le,slope,intercept,meta,volumes,dimensions,frameCount});
    return selected?selectFrame(volume,options.frameIndex??0):volume;
  }
  function voxel(volume,point){return transform(volume.inverse,ras(point));}
  function sample(volume,point){const indices=voxel(volume,point).map(Math.round);if(indices.some((v,i)=>v<0||v>=volume.dims[i]))return null;return volume.values[indices[0]+volume.dims[0]*(indices[1]+volume.dims[1]*indices[2])];}
  function labelVolumes(volume,labels){const counts=new Map();for(const value of volume.values){if(!Number.isInteger(value)||value<0)throw new Error('标签体积必须是非负整数');if(value)counts.set(value,(counts.get(value)||0)+1);}return[...counts].map(([code,n])=>({id:labels.get(code)?.id||String(code),code,name:labels.get(code)?.name||String(code),B:n*volume.voxelMm3,voxels:n}));}
  function toBase64(bytes){let output='';for(let i=0;i<bytes.length;i+=32768)output+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(output);}
  const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  function writeMask(dims,affine,values){
    if(values.length!==dims.reduce((a,b)=>a*b,1))throw new Error('掩膜维度不匹配');const bytes=new Uint8Array(352+values.length),view=new DataView(bytes.buffer);view.setInt32(0,348,true);view.setInt16(40,3,true);dims.forEach((n,i)=>view.setInt16(42+i*2,n,true));view.setInt16(70,2,true);view.setInt16(72,8,true);view.setFloat32(108,352,true);view.setFloat32(112,1,true);view.setInt16(254,1,true);for(let i=0;i<3;i++){view.setFloat32(80+i*4,Math.hypot(affine[0][i],affine[1][i],affine[2][i]),true);for(let j=0;j<4;j++)view.setFloat32(280+i*16+j*4,affine[i][j],true);}bytes[123]=2;bytes.set([110,43,49,0],344);bytes.set(values,352);return bytes;
  }
  // ZIP store format: no compression or external dependency; CRC protects each file.
  const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function crc(bytes){let c=0xffffffff;for(const value of bytes)c=table[(c^value)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function zip(files){const chunks=[],central=[],encoder=new TextEncoder();let offset=0;for(const file of files){const name=encoder.encode(file.name),bytes=typeof file.data==='string'?encoder.encode(file.data):new Uint8Array(file.data),sum=crc(bytes),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,sum,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);chunks.push(header,bytes);const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint32(16,sum,true);e.setUint32(20,bytes.length,true);e.setUint32(24,bytes.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);central.push(entry);offset+=header.length+bytes.length;}
    const size=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
  }
  scope.AtlasResearchVolume=Object.freeze({inverse,transform,ras,ccf,determinant,read,selectFrame,voxel,sample,labelVolumes,toBase64,fromBase64,writeMask,zip,crc});
})(typeof window==='undefined'?globalThis:window);
