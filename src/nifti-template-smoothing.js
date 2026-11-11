(function(scope){
  'use strict';
  const FWHM=2*Math.sqrt(2*Math.log(2));
  function recipe(volume,sigmaVox=0,cutoff=0){
    sigmaVox=Number(sigmaVox);cutoff=Number(cutoff);
    if(!Number.isFinite(sigmaVox)||sigmaVox<0||sigmaVox>3)throw new Error('模板平滑 σ 需在0–3体素之间');
    if(!Number.isFinite(cutoff))throw new Error('模板掩膜阈值需为有限数值');
    const spacing=[0,1,2].map(i=>Math.hypot(volume.affine[0][i],volume.affine[1][i],volume.affine[2][i]));
    return{method:'masked-normalized-3d-gaussian',sigmaVox,fwhmVox:sigmaVox*FWHM,fwhmAxisMm:spacing.map(s=>s*sigmaVox*FWHM),cutoff,truncateSigma:3,displayOnly:true,maskSource:'original template finite values > cutoff'};
  }
  async function smooth(volume,sigmaVox=0,cutoff=0,hooks={}){
    return gaussian(volume,recipe(volume,sigmaVox,cutoff),null,hooks);
  }
  async function gaussian(volume,plan,mask,hooks={}){
    if(plan.sigmaVox===0)return volume;
    const dims=volume.dims,n=volume.values.length,strides=[1,dims[0],dims[0]*dims[1]],radius=Math.ceil(plan.truncateSigma*plan.sigmaVox),kernel=Float64Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/plan.sigmaVox)**2));
    const sum=kernel.reduce((s,w)=>s+w,0);for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
    let numbers=new Float32Array(n),weights=new Float32Array(n),scratchN=new Float32Array(n),scratchW=new Float32Array(n);const support=new Uint8Array(n);
    for(let i=0;i<n;i++)if(Number.isFinite(volume.values[i])&&(mask?mask[i]:volume.values[i]>plan.cutoff)){numbers[i]=volume.values[i];weights[i]=1;support[i]=1;}
    async function checkpoint(p){if(hooks.cancelled?.())throw new Error('已取消模板平滑');hooks.progress?.(p);await new Promise(resolve=>setTimeout(resolve,0));}
    await checkpoint(0);
    for(let axis=0;axis<3;axis++){
      const stride=strides[axis],size=dims[axis];
      for(let i=0;i<n;i++){
        const at=Math.floor(i/stride)%size,low=Math.max(-radius,-at),high=Math.min(radius,size-1-at);let a=0,b=0;
        for(let d=low;d<=high;d++){const j=i+d*stride,w=kernel[d+radius];a+=numbers[j]*w;b+=weights[j]*w;}
        scratchN[i]=a;scratchW[i]=b;
        if(i&&i%131072===0)await checkpoint((axis+i/n)/3);
      }
      [numbers,scratchN]=[scratchN,numbers];[weights,scratchW]=[scratchW,weights];await checkpoint((axis+1)/3);
    }
    let minimum=Infinity,maximum=-Infinity;
    for(let i=0;i<n;i++){numbers[i]=support[i]&&weights[i]>1e-20?numbers[i]/weights[i]:0;if(support[i]){minimum=Math.min(minimum,numbers[i]);maximum=Math.max(maximum,numbers[i]);}}
    if(hooks.cancelled?.())throw new Error('已取消模板平滑');
    return{...volume,values:numbers,min:Number.isFinite(minimum)?minimum:0,max:Number.isFinite(maximum)?maximum:0,displaySmoothing:plan};
  }
  function statisticRecipe(volume,sigmaVox=0){return{...recipe(volume,sigmaVox,0),method:'masked-normalized-3d-gaussian-separate-signs',maskSource:'raw threshold and cluster-extent retained voxels; positive/negative separate',interpolation:'normalized same-sign trilinear inside original retained support',statisticsSource:'raw unmodified values; smoothing does not recalculate significance'};}
  async function smoothStatistic(volume,kept,sigmaVox=0,hooks={}){
    const plan=statisticRecipe(volume,sigmaVox),n=volume.values.length;if(kept.length!==n)throw new Error('统计平滑掩膜维度不匹配');if(!plan.sigmaVox)return volume;
    const values=new Float32Array(n),groups=[];for(const sign of [1,-1]){const mask=new Uint8Array(n);let count=0;for(let i=0;i<n;i++)if(kept[i]&&Number.isFinite(volume.values[i])&&(volume.values[i]<0?-1:1)===sign){mask[i]=1;count++;}if(count)groups.push(mask);}
    for(let g=0;g<groups.length;g++){const mask=groups[g],filtered=await gaussian(volume,plan,mask,{cancelled:hooks.cancelled,progress:p=>hooks.progress?.((g+p)/groups.length)});for(let i=0;i<n;i++)if(mask[i])values[i]=filtered.values[i];}
    if(hooks.cancelled?.())throw new Error('已取消统计显示平滑');hooks.progress?.(1);
    let min=Infinity,max=-Infinity;for(let i=0;i<n;i++)if(kept[i]&&Number.isFinite(volume.values[i])){min=Math.min(min,values[i]);max=Math.max(max,values[i]);}
    return{...volume,values,min:Number.isFinite(min)?min:0,max:Number.isFinite(max)?max:0,displaySmoothing:plan};
  }
  function sampleStatistic(volume,kept,world){
    const p=volume.inverse.slice(0,3).map(r=>r[0]*world[0]+r[1]*world[1]+r[2]*world[2]+r[3]),dims=volume.dims,near=p.map(Math.round);
    if(near.some((n,i)=>n<0||n>=dims[i]))return null;const ni=near[0]+dims[0]*(near[1]+dims[1]*near[2]);if(!kept[ni])return null;const sign=volume.values[ni]<0?-1:1;
    for(let i=0;i<3;i++)p[i]=Math.max(0,Math.min(dims[i]-1,p[i]));const a=p.map(Math.floor),f=p.map((n,i)=>n-a[i]);let sum=0,weight=0;
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const q=[x,y,z].map((d,i)=>Math.min(a[i]+d,dims[i]-1)),i=q[0]+dims[0]*(q[1]+dims[1]*q[2]),w=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]),value=volume.values[i];if(w&&kept[i]&&Number.isFinite(value)&&(value<0?-1:1)===sign){sum+=w*value;weight+=w;}}
    return weight?sum/weight:volume.values[ni];
  }
  scope.AtlasNiftiTemplateSmoothing=Object.freeze({recipe,smooth,statisticRecipe,smoothStatistic,sampleStatistic,FWHM});
})(window);
