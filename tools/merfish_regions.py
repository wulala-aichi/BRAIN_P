"""Exact full-population MERFISH summaries on the app's display parcellation.

Source parcellation labels are mapped through official acronym/ancestor metadata,
never through sampled display meshes or sampled point clouds. Files are read only.
"""
import json, math
from pathlib import Path
import numpy as np
import pandas as pd


class RegionAggregator:
    def __init__(self, store, app_root):
        self.store=store
        mapping_path=Path(app_root)/'data/merfish-region-map.json'
        self.atlas=json.loads(mapping_path.read_text(encoding='utf8'))
        if self.atlas.get('format')!='mouse-atlas-merfish-region-map':
            raise ValueError('显示分区映射文件无效，请重新构建应用')
        self.regions=self.atlas['regions']; by_structure={}
        for i,r in enumerate(self.regions):
            if r['structureId'] is not None:
                if r['structureId'] in by_structure: raise ValueError('显示分区结构 ID 重复')
                by_structure[r['structureId']]=i
        nodes={n['acronym']:n for n in self.atlas['ontology']}
        paths=sorted((store.root/'metadata/Allen-CCF-2020').glob('*/views/parcellation_to_parcellation_term_membership_acronym.csv'))
        if not paths: raise FileNotFoundError('缺少官方 parcellation_index → acronym 映射')
        source=paths[-1]; table=pd.read_csv(source,keep_default_na=False)
        if not table.parcellation_index.is_unique: raise ValueError('源 parcellation_index 重复')
        self.lookup=np.full(int(table.parcellation_index.max())+1,-1,dtype=np.int32)
        unmatched=[]; self.links=[]
        for row in table.to_dict('records'):
            parcel=int(row['parcellation_index']); target=None; origin=None
            if parcel!=0:
                for field in ['substructure','structure','division','category','organ']:
                    node=nodes.get(row.get(field,''))
                    if not node: continue
                    for sid in [node['id'],*reversed(node['ancestors'])]:
                        if sid in by_structure:
                            target=by_structure[sid]; origin=node['acronym']; break
                    if target is not None: break
            if target is None: unmatched.append(parcel)
            else: self.lookup[parcel]=target
            self.links.append({'parcellation_index':parcel,'source_acronym':row.get('substructure'),'region':self.regions[target]['id'] if target is not None else None,'ancestor_source':origin})
        self.provenance={'atlasId':self.atlas['atlasId'],'fingerprint':self.atlas['fingerprint'],'method':'official parcellation acronym to nearest displayed Allen ancestor','source':{'path':str(source),'bytes':source.stat().st_size,'mtime_ns':str(source.stat().st_mtime_ns)},'parcels':len(table),'mapped_parcels':len(table)-len(unmatched),'unmapped_parcels':unmatched,'display_regions':len(self.regions)}

    def groups(self, arrays, rows):
        parcels=np.asarray(arrays['parcel'][rows],dtype=np.int64)
        region=np.full(len(rows),-1,dtype=np.int32)
        valid=(parcels>=0)&(parcels<len(self.lookup))
        region[valid]=self.lookup[parcels[valid]]
        hemisphere=(arrays['coords'][rows,1]>=0).astype(np.int32)
        return region*2+hemisphere,region>=0

    def aggregate(self, request):
        mode=request.get('mode','gene'); metric=request.get('metric','mean' if mode=='gene' else 'count')
        allowed={'gene':['mean','positive_fraction'],'type':['count','fraction']}
        if metric not in allowed[mode]: raise ValueError('当前着色内容不支持该分区指标')
        threshold=float(request.get('positiveThreshold',0)); minimum_n=int(request.get('minCells',5))
        if not math.isfinite(threshold) or not 1<=minimum_n<=10000000: raise ValueError('分区统计参数无效')
        selected_type=str(request.get('cellType',''));level=request.get('level','class')
        if metric=='fraction' and not selected_type: raise ValueError('类型比例需要选择具体细胞类型；全部类型的比例恒为 100%')
        aliases=np.array([int(t['cluster_alias']) for t in self.store.taxonomy if str(t.get(level,''))==selected_type],dtype=np.int32) if selected_type else None
        volume=request.get('volume') is True
        scopes=[{'orientation':'volume','position':None}] if volume else list({(p['orientation'],float(p['position'])):p for p in request['planes']}.values())
        output=[];size=len(self.regions)*2
        names=request['datasets'];hemi=request.get('hemisphere','B');confidence=float(request.get('confidence',0));slab=float(request.get('slab',.1))
        for scope in scopes:
            total=np.zeros(size,dtype=np.int64);counts=total.copy();positive=total.copy();sums=np.zeros(size,dtype=np.float64)
            qc={'registered_cells':0,'mapped_cells':0,'unmapped_cells':0,'invalid_expression_values':0}; per_dataset=[]
            for name in names:
                d=self.store.datasets[name];a=self.store.ready[name];rows=a['valid_rows'];xyz=a['coords'][rows];keep=np.ones(len(rows),dtype=bool)
                if not volume:
                    axis={'coronal':0,'sagittal':1,'horizontal':2}[scope['orientation']]
                    keep&=np.abs(xyz[:,axis]-float(scope['position']))<=slab/2+1e-7
                if hemi!='B': keep&=(xyz[:,1]<0 if hemi=='L' else xyz[:,1]>=0)
                if confidence>0: keep&=np.isfinite(a['confidence'][rows])&(a['confidence'][rows]>=confidence)
                rows=np.asarray(rows[keep],dtype=np.int32);groups,mapped=self.groups(a,rows)
                qc['registered_cells']+=len(rows);qc['mapped_cells']+=int(mapped.sum());qc['unmapped_cells']+=int((~mapped).sum())
                per_dataset.append({'dataset':name,'registered_cells':len(rows),'mapped_cells':int(mapped.sum()),'unmapped_cells':int((~mapped).sum())})
                rows=rows[mapped];groups=groups[mapped]
                total+=np.bincount(groups,minlength=size)
                chosen=np.isin(a['cluster'][rows],aliases) if aliases is not None else np.ones(len(rows),dtype=bool)
                if mode=='gene':
                    values=self.store.values(d,request['gene'])[rows]
                    finite=np.isfinite(values);qc['invalid_expression_values']+=int((chosen&~finite).sum());chosen&=finite
                    values=values[chosen];group=groups[chosen]
                    counts+=np.bincount(group,minlength=size)
                    sums+=np.bincount(group,weights=values.astype(np.float64),minlength=size)
                    positive+=np.bincount(group,weights=(values>threshold).astype(np.int64),minlength=size).astype(np.int64)
                else: counts+=np.bincount(groups[chosen],minlength=size)
            records=[]
            for group in np.flatnonzero(total):
                region=self.regions[group//2];n=int(counts[group] if mode=='gene' else total[group]);selected=int(counts[group]);value=None
                if n>=minimum_n:
                    if metric=='mean': value=float(sums[group]/n)
                    elif metric=='positive_fraction': value=float(100*positive[group]/n)
                    elif metric=='count': value=selected
                    else: value=float(100*selected/n)
                records.append({'region':region['id'],'name':region['name'],'hemisphere':'R' if group%2 else 'L','eligible_cells':int(total[group]),'n':n,'selected_count':selected,'sum_expression':float(sums[group]) if mode=='gene' else None,'positive_count':int(positive[group]) if mode=='gene' else None,'value':value,'status':'observed' if value is not None else 'insufficient_cells'})
            output.append({**scope,'rows':records,'qc':qc,'datasets':per_dataset})
        values=[r['value'] for s in output for r in s['rows'] if r['value'] is not None]
        upper=max(values) if values else 1
        ranges=[0,100] if metric in ['fraction','positive_fraction'] else [min(0,min(values)) if values else 0,upper if upper>0 else 1]
        title={'mean':'Mean expression','positive_fraction':'Positive cells','count':'Cell count','fraction':'Cell-type fraction'}[metric]
        return {'version':1,'metric':metric,'title':title,'unit':'source log2-normalized expression' if metric=='mean' else '%' if metric in ['fraction','positive_fraction'] else 'cells','scope':'whole registered volume' if volume else 'individual CCF slabs','pooling':'cell-weighted descriptive pooling across selected datasets; not animal-level statistics','population':'all registered cells passing spatial/hemisphere/confidence filters; gene means additionally use selected type and finite expression, including zero','positive_rule':'value > threshold','positive_threshold':threshold,'point_minimum_ignored':True,'min_cells':minimum_n,'sampling':'none; all eligible cells before point display sampling','range':ranges,'mapping':self.provenance,'scopes':output}
