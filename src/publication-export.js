(function(scope){
  'use strict';
  const NS='http://www.w3.org/2000/svg',pt=72/25.4;
  function rasterScale(m,dpi){const sum=m.a*m.a+m.b*m.b+m.c*m.c+m.d*m.d,det=m.a*m.d-m.b*m.c;return Math.sqrt((sum+Math.sqrt(Math.max(0,sum*sum-4*det*det)))/2)*dpi/72;}
  function size(widthMm,heightMm,dpi,limitRaster=true){
    if(![widthMm,heightMm,dpi].every(Number.isFinite)||widthMm<=0||heightMm<=0||![150,300,600].includes(dpi))throw new Error('导出尺寸 / DPI 无效');
    const width=Math.round(widthMm/25.4*dpi),height=Math.round(heightMm/25.4*dpi);
    if(limitRaster&&width*height>100000000)throw new Error('位图超过 1 亿像素，请降低 DPI 或画布尺寸');
    return{width,height,widthMm,heightMm,dpi};
  }
  function tiff(bytes,width,height,dpi,alpha=true){
    size(width/dpi*25.4,height/dpi*25.4,dpi);
    if(!Number.isInteger(width)||!Number.isInteger(height)||bytes.length!==width*height*4)throw new Error('TIFF 像素数据不完整');
    const channels=alpha?4:3,count=alpha?14:13,ifdEnd=8+2+count*12+4,bitsOffset=ifdEnd,resolutionOffset=bitsOffset+channels*2,dataOffset=resolutionOffset+16,pixelBytes=width*height*channels;
    const out=new Uint8Array(dataOffset+pixelBytes),v=new DataView(out.buffer);out.set([73,73,42,0]);v.setUint32(4,8,true);v.setUint16(8,count,true);
    let cursor=10;
    function entry(tag,type,n,value){v.setUint16(cursor,tag,true);v.setUint16(cursor+2,type,true);v.setUint32(cursor+4,n,true);if(type===3&&n===1)v.setUint16(cursor+8,value,true);else v.setUint32(cursor+8,value,true);cursor+=12;}
    entry(256,4,1,width);entry(257,4,1,height);entry(258,3,channels,bitsOffset);entry(259,3,1,1);entry(262,3,1,2);entry(273,4,1,dataOffset);entry(277,3,1,channels);entry(278,4,1,height);entry(279,4,1,pixelBytes);entry(282,5,1,resolutionOffset);entry(283,5,1,resolutionOffset+8);entry(284,3,1,1);entry(296,3,1,2);if(alpha)entry(338,3,1,2);
    for(let i=0;i<channels;i++)v.setUint16(bitsOffset+i*2,8,true);
    for(const offset of [resolutionOffset,resolutionOffset+8]){v.setUint32(offset,dpi,true);v.setUint32(offset+4,1,true);}
    if(alpha)out.set(bytes,dataOffset);else for(let i=0,j=dataOffset;i<bytes.length;i+=4){out[j++]=bytes[i];out[j++]=bytes[i+1];out[j++]=bytes[i+2];}
    return out;
  }
  async function raster(root,width,height,background=null){
    const clone=root.cloneNode(true);clone.setAttribute('xmlns',NS);clone.setAttribute('width',width);clone.setAttribute('height',height);
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
    try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;scope.AtlasUtils.paintCanvas(canvas,image,background);return canvas;}finally{URL.revokeObjectURL(url);}
  }
  async function pngRGBA(input,width,height){
    // PDF soft-mask interpolation otherwise mixes black RGB from transparent
    // canvas pixels into the white label halo, producing dark fringes.
    const raw=new Uint8Array(height*(1+width*4));for(let y=0;y<height;y++){const row=y*(1+width*4);raw.set(input.subarray(y*width*4,(y+1)*width*4),row+1);for(let x=0;x<width;x++){const p=row+1+x*4;if(raw[p+3]===0)raw[p]=raw[p+1]=raw[p+2]=255;}}
    const packed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()),header=new Uint8Array(13),hv=new DataView(header.buffer);hv.setUint32(0,width);hv.setUint32(4,height);header[8]=8;header[9]=6;
    function chunk(type,data){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(out.length-4,scope.AtlasUtils.crc32(out.subarray(4,-4)));return out;}
    const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',packed),chunk('IEND',new Uint8Array())],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
  }
  async function labelURL(canvas){const bytes=await pngRGBA(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return'data:image/png;base64,'+btoa(binary);}
  async function bitmap(markup,options){
    const s=size(options.widthMm,options.heightMm,options.dpi),root=scope.AtlasPublication.safeSVG(markup),canvas=await raster(root,s.width,s.height,options.background);
    if(options.format==='tiff')return new Blob([tiff(canvas.getContext('2d').getImageData(0,0,s.width,s.height).data,s.width,s.height,s.dpi,!options.background)],{type:'image/tiff'});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG 编码失败');return new Blob([scope.AtlasUtils.withPngDpi(await blob.arrayBuffer(),s.dpi)],{type:'image/png'});
  }
  let fontFaces=null;
  async function fonts(){
    if(!fontFaces)fontFaces=(async()=>{for(const [style,weight]of [['normal','400'],['bold','700']]){const b=atob(scope.AtlasExportFonts[style]),bytes=Uint8Array.from(b,c=>c.charCodeAt(0)),face=new FontFace('AtlasNotoSC',bytes,{weight});await face.load();document.fonts.add(face);}})();
    return fontFaces;
  }
  function supported(text){return [...text].every(c=>scope.AtlasExportFonts.coverage.some(([a,b])=>c.codePointAt(0)>=a&&c.codePointAt(0)<=b)||'\r\n\t'.includes(c));}
  function inherited(node,name,fallback){for(let n=node;n&&n.nodeType===1;n=n.parentElement)if(n.hasAttribute(name))return n.getAttribute(name);return fallback;}
  async function preparePDF(root,doc,options){
    const box=document.createElement('div');box.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none';root.setAttribute('width',options.widthMm*pt);root.setAttribute('height',options.heightMm*pt);box.append(root);document.body.append(box);
    const report={vectorPaths:root.querySelectorAll('path').length,rasterImages:root.querySelectorAll('image').length,effectLayers:0,fontFallbacks:0};
    try{
      // Explicit vector strips avoid a nested-SVG gradient bug in svg2pdf.
      // Sampling is finer than one display pixel at ordinary publication sizes.
      for(const rect of [...root.querySelectorAll('[data-colorbar] rect[fill^="url(#"]')]){
        const id=rect.getAttribute('fill').slice(5,-1),gradient=root.querySelector('[id="'+id+'"]');if(gradient?.localName!=='linearGradient')continue;
        const stops=[...gradient.querySelectorAll('stop')].map(n=>({at:Number.parseFloat(n.getAttribute('offset'))/(n.getAttribute('offset').includes('%')?100:1),colour:n.getAttribute('stop-color')})),vertical=gradient.getAttribute('y1')==='100%',x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y')),w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height')),group=document.createElementNS(NS,'g'),steps=512;
        for(let i=0;i<steps;i++){const f=vertical?1-i/(steps-1):i/(steps-1),b=stops.find(s=>s.at>=f)||stops.at(-1),a=stops[Math.max(0,stops.indexOf(b)-1)],fill=scope.AtlasUtils.mix(a.colour,b.colour,b.at===a.at?0:(f-a.at)/(b.at-a.at)),n=document.createElementNS(NS,'rect');for(const[k,v]of Object.entries({x:x+(vertical?0:i*w/steps),y:y+(vertical?i*h/steps:0),width:vertical?w:w/steps+.00001,height:vertical?h/steps+.00001:h,fill}))n.setAttribute(k,v);group.append(n);}rect.replaceWith(group);
      }
      // Only unsupported SVG effects are rasterized. Anatomy paths and text stay vector.
      for(const node of [...root.querySelectorAll('[mask],[filter]')]){
        if(!root.contains(node)||node.closest('defs')||node.parentElement.closest('[mask],[filter]'))continue;
        const b=node.getBBox(),pad=Math.max(b.width,b.height)*.015+2;if(!b.width||!b.height)continue;
        const layer=document.createElementNS(NS,'svg');layer.setAttribute('viewBox',`${b.x-pad} ${b.y-pad} ${b.width+2*pad} ${b.height+2*pad}`);
        for(const defs of root.querySelectorAll('defs'))layer.append(defs.cloneNode(true));const copy=node.cloneNode(true),transform=copy.getAttribute('transform');copy.removeAttribute('transform');layer.append(copy);
        const matrix=node.getScreenCTM(),scale=rasterScale(matrix,options.dpi),canvas=await raster(layer,Math.max(1,Math.round((b.width+2*pad)*scale)),Math.max(1,Math.round((b.height+2*pad)*scale)));
        const image=document.createElementNS(NS,'image');for(const[k,v]of Object.entries({x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad,href:canvas.toDataURL('image/png')}))image.setAttribute(k,v);if(transform)image.setAttribute('transform',transform);node.replaceWith(image);report.effectLayers++;report.rasterImages++;
      }
      const texts=[...root.querySelectorAll('text')],needsNoto=texts.some(t=>/[^\x00-\xff]/.test(t.textContent));
      if(needsNoto){await fonts();if(!doc.getFontList().AtlasNotoSC)for(const style of ['normal','bold']){doc.addFileToVFS(`NotoSansSC-${style}.ttf`,scope.AtlasExportFonts[style]);doc.addFont(`NotoSansSC-${style}.ttf`,'AtlasNotoSC',style);}}
      for(const text of texts){
        const family=inherited(text,'font-family','Arial'),weight=inherited(text,'font-weight','400'),bold=weight==='bold'||Number(weight)>=600,italic=inherited(text,'font-style','normal')==='italic',useNoto=/[^\x00-\xff]/.test(text.textContent);
        // Keep a stroked label and its halo together: splitting them creates
        // font-baseline/outline mismatches. Ordinary un-stroked text stays vector.
        if((text.getAttribute('paint-order')||'').startsWith('stroke')&&text.hasAttribute('stroke')&&text.getAttribute('stroke')!=='none'){
          const b=text.getBBox(),pad=Number(inherited(text,'stroke-width','1'))*2+1,layer=document.createElementNS(NS,'svg'),halo=text.cloneNode(true),transform=halo.getAttribute('transform');
          layer.setAttribute('viewBox',`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`);halo.removeAttribute('transform');halo.removeAttribute('id');halo.setAttribute('font-family',family);halo.setAttribute('font-weight',weight);halo.setAttribute('font-size',inherited(text,'font-size','16'));layer.append(halo);
          const matrix=text.getScreenCTM(),scale=rasterScale(matrix,options.dpi),canvas=await raster(layer,Math.max(1,Math.ceil((b.width+2*pad)*scale)),Math.max(1,Math.ceil((b.height+2*pad)*scale))),image=document.createElementNS(NS,'image');for(const[k,v]of Object.entries({x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad,href:await labelURL(canvas)}))image.setAttribute(k,v);if(transform)image.setAttribute('transform',transform);text.replaceWith(image);report.effectLayers++;report.rasterImages++;continue;
        }
        if(useNoto&&!supported(text.textContent)){const missing=[...new Set([...text.textContent].filter(c=>!supported(c)))].join('');throw new Error('PDF 字体不包含这些字符：'+missing+'；请更换字符或使用 SVG / TIFF');}
        const mapped=useNoto?'AtlasNotoSC':/times|serif/i.test(family)&&!/sans/i.test(family)?'times':'helvetica';
        for(const n of [text,...text.querySelectorAll('tspan')]){n.setAttribute('font-family',mapped);n.setAttribute('font-weight',bold?'bold':'normal');if(useNoto)n.setAttribute('font-style','normal');}
        if(useNoto)report.fontFallbacks++;
        if(!useNoto&&italic)text.setAttribute('font-style','italic');
      }
      await doc.svg(root,{x:0,y:0,width:options.widthMm*pt,height:options.heightMm*pt});return report;
    }finally{box.remove();}
  }
  async function pdf(pages,{title='Mouse Atlas figure',dpi=300,onProgress=()=>{},cancelled=()=>false}={}){
    if(!pages.length)throw new Error('没有可导出的页面');let doc;const reports=[];
    for(let i=0;i<pages.length;i++){
      if(cancelled())throw new Error('已取消 PDF；未导出部分文件');const page=pages[i];size(page.widthMm,page.heightMm,dpi,false);onProgress(i+1,pages.length);
      const format=[page.widthMm*pt,page.heightMm*pt],orientation=page.widthMm>page.heightMm?'landscape':'portrait';
      if(!doc){doc=new scope.jspdf.jsPDF({unit:'pt',format,orientation,compress:true,putOnlyUsedFonts:true,floatPrecision:8});doc.__private__.setPdfVersion('1.7');}else doc.addPage(format,orientation);
      const root=scope.AtlasPublication.safeSVG(page.svg);reports.push(await preparePDF(root,doc,{...page,dpi}));await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(cancelled())throw new Error('已取消 PDF；未导出部分文件');doc.setProperties({title,subject:'2D paths and ordinary text are vector; 3D, imported images, shadows and stroked labels are raster. Noto Sans SC fallback for Unicode. DPI applies to raster/effect layers.',creator:'Mouse Atlas Studio',keywords:'Allen CCF, figure, offline, vector'});
    return{blob:doc.output('blob'),reports};
  }
  scope.AtlasFigureExport=Object.freeze({size,tiff,pngRGBA,rasterScale,bitmap,pdf});
})(typeof window==='undefined'?globalThis:window);
