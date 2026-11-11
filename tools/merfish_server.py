"""Local, read-only ABC MERFISH bridge. Source H5AD/CSVs are never modified.

Run with a configured Python environment: merfish_server.py --root /path/to/abc_atlas
Derived NumPy indexes live under this project's tools/cache/merfish only.
"""
from __future__ import annotations
import argparse, csv, gzip, hashlib, io, json, math, os, sys, threading, time
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import h5py
import numpy as np
import pandas as pd
from merfish_regions import RegionAggregator
from merfish_symmetry import symmetric_query
from aav_projection import AavStore

APP_ROOT=Path(__file__).resolve().parent.parent
CONTRACT={'version':1,'space':'Allen CCF native mm, not bregma','ap':'ccf.x','dv':'ccf.y','ml':'ccf.z - 5.695','expression':'source log2-normalized values; no second transform'}

def strings(node):
    if isinstance(node,h5py.Dataset): return node.asstr()[:]
    categories=strings(node['categories']);codes=node['codes'][:]
    return np.array([categories[c] if c>=0 else '' for c in codes],dtype=object)

def newest(parent,filename):
    paths=sorted(parent.glob('*/'+filename))
    if not paths: raise FileNotFoundError(str(parent/('*'+filename)))
    return paths[-1]

class MerfishStore:
    def __init__(self,root,cache=None):
        root=Path(root).resolve();self.root=root/'abc_atlas' if (root/'abc_atlas').is_dir() else root
        self.cache=Path(cache or APP_ROOT/'tools/cache/merfish').resolve();self.cache.mkdir(parents=True,exist_ok=True)
        self.datasets={};self.ready={};self.progress={'state':'preparing','message':'正在检查源文件','dataset':'','rows':0};self.lock=threading.RLock();self.expression_cache=OrderedDict()
        self.taxonomy=self.read_taxonomy();self.region_aggregator=None
        for folder in sorted((self.root/'expression_matrices').glob('Zhuang-ABCA-*')):
            name=folder.name;h5=newest(folder,name+'-log2.h5ad');meta=newest(self.root/'metadata'/name,'cell_metadata.csv');ccf=newest(self.root/'metadata'/(name+'-CCF'),'ccf_coordinates.csv')
            sources=[{'path':str(p),'bytes':p.stat().st_size,'mtime_ns':p.stat().st_mtime_ns} for p in [h5,meta,ccf]]
            fingerprint=hashlib.sha256(json.dumps({'contract':CONTRACT,'sources':sources},sort_keys=True).encode()).hexdigest()
            with h5py.File(h5,'r') as f:
                genes=strings(f['var'][f['var'].attrs.get('_index','gene_identifier')]);symbols=strings(f['var']['gene_symbol']);n=int(f['X'].shape[0])
                if not isinstance(f['X'],h5py.Dataset) or f['X'].ndim!=2: raise ValueError(name+': expected dense ABC log2 matrix')
            self.datasets[name]={'id':name,'h5':h5,'meta':meta,'ccf':ccf,'sources':sources,'fingerprint':fingerprint,'n':n,'genes':[{'id':str(g),'symbol':str(s)} for g,s in zip(genes,symbols)],'cache':self.cache/(name+'-'+fingerprint[:16])}
        if not self.datasets: raise ValueError('未找到 Zhuang-ABCA-* 表达矩阵：'+str(self.root))

    def read_taxonomy(self):
        root=self.root/'metadata/WMB-taxonomy';pivot=newest(root,'views/cluster_to_cluster_annotation_membership_pivoted.csv');colours=newest(root,'views/cluster_to_cluster_annotation_membership_color.csv')
        records=pd.read_csv(pivot,keep_default_na=False).merge(pd.read_csv(colours,keep_default_na=False),on='cluster_alias',validate='one_to_one')
        return records.to_dict(orient='records')

    def prepare(self):
        try:
            for name,d in self.datasets.items():
                self.progress={'state':'preparing','message':'正在建立只读坐标索引','dataset':name,'rows':0}
                manifest=d['cache']/'index.json'
                if manifest.exists():
                    info=json.loads(manifest.read_text(encoding='utf8'))
                    if info.get('fingerprint')!=d['fingerprint']: raise ValueError('缓存指纹不匹配')
                else: info=self.build_index(d)
                arrays={key:np.load(d['cache']/(key+'.npy'),mmap_mode='r') for key in ['coords','cluster','section','confidence','parcel','valid_rows','labels']}
                self.ready[name]={'info':info,**arrays}
                print(json.dumps({'event':'indexed','dataset':name,'qc':info['qc']},ensure_ascii=False),flush=True)
            self.progress={'state':'ready','message':'本地 MERFISH 已就绪','dataset':'','rows':sum(len(v['valid_rows']) for v in self.ready.values())}
        except Exception as exc:
            self.progress={'state':'error','message':str(exc),'dataset':self.progress.get('dataset'),'rows':self.progress.get('rows',0)}
            import traceback;traceback.print_exc()

    def build_index(self,d):
        cache=d['cache'];cache.mkdir(parents=True,exist_ok=True)
        with h5py.File(d['h5'],'r') as f: labels=pd.Index(strings(f['obs'][f['obs'].attrs.get('_index','cell_label')]))
        if not labels.is_unique: raise ValueError(d['id']+': H5AD cell_label 不唯一')
        n=len(labels);coords=np.full((n,3),np.nan,dtype=np.float32);cluster=np.full(n,-1,dtype=np.int32);section=np.full(n,-1,dtype=np.int16);confidence=np.full(n,np.nan,dtype=np.float32);parcel=np.zeros(n,dtype=np.int32);ccf_seen=np.zeros(n,dtype=bool);meta_seen=np.zeros(n,dtype=bool);sections={}
        qc={'expression_rows':n,'ccf_rows':0,'metadata_rows':0,'orphan_ccf':0,'orphan_metadata':0,'duplicate_h5_labels':0,'duplicate_ccf':0,'duplicate_metadata':0}
        for chunk in pd.read_csv(d['ccf'],dtype={'cell_label':str},chunksize=100000):
            if not {'cell_label','x','y','z','parcellation_index'}.issubset(chunk.columns): raise ValueError('CCF CSV 缺少要求的字段')
            ids=chunk.cell_label;idx=labels.get_indexer(ids);known=idx>=0;rows=idx[known];qc['ccf_rows']+=len(chunk);qc['orphan_ccf']+=int((~known).sum())
            if not ids.is_unique or len(np.unique(rows))!=len(rows) or ccf_seen[rows].any(): raise ValueError(d['id']+': CCF cell_label 重复，拒绝覆盖')
            xyz=chunk.loc[known,['x','z','y']].to_numpy(dtype=np.float64);xyz[:,1]-=5.695;coords[rows]=xyz;parcel[rows]=chunk.loc[known,'parcellation_index'].to_numpy(dtype=np.int32);ccf_seen[rows]=True;self.progress['rows']=qc['ccf_rows']
        for chunk in pd.read_csv(d['meta'],dtype={'cell_label':str,'brain_section_label':str},usecols=['cell_label','brain_section_label','cluster_alias','cluster_confidence_score'],chunksize=100000):
            ids=chunk.cell_label;idx=labels.get_indexer(ids);known=idx>=0;rows=idx[known];qc['metadata_rows']+=len(chunk);qc['orphan_metadata']+=int((~known).sum())
            if not ids.is_unique or len(np.unique(rows))!=len(rows) or meta_seen[rows].any(): raise ValueError(d['id']+': 元数据 cell_label 重复，拒绝多对多连接')
            part=chunk.loc[known];cluster[rows]=part.cluster_alias.fillna(-1).to_numpy(dtype=np.int32);confidence[rows]=part.cluster_confidence_score.to_numpy(dtype=np.float32)
            codes=[]
            for label in part.brain_section_label:
                if label not in sections: sections[label]=len(sections)
                codes.append(sections[label])
            section[rows]=codes;meta_seen[rows]=True;self.progress['message']='正在匹配细胞分类与切片';self.progress['rows']=qc['metadata_rows']
        finite=np.isfinite(coords).all(axis=1);inside=finite&(coords[:,0]>=0)&(coords[:,0]<=13.2)&(np.abs(coords[:,1])<=5.705)&(coords[:,2]>=0)&(coords[:,2]<=8)
        valid=ccf_seen&meta_seen&inside;valid_rows=np.flatnonzero(valid).astype(np.int32)
        qc.update(ccf_matched=int(ccf_seen.sum()),metadata_matched=int(meta_seen.sum()),metadata_without_ccf=int((meta_seen&~ccf_seen).sum()),ccf_without_metadata=int((ccf_seen&~meta_seen).sum()),nonfinite_ccf=int((ccf_seen&~finite).sum()),outside_volume=int((ccf_seen&finite&~inside).sum()),registered_display_cells=len(valid_rows),left=int((valid&(coords[:,1]<0)).sum()),right=int((valid&(coords[:,1]>=0)).sum()))
        for key,array in [('coords',coords),('cluster',cluster),('section',section),('confidence',confidence),('parcel',parcel),('valid_rows',valid_rows)]: np.save(cache/(key+'.npy'),array,allow_pickle=False)
        max_length=max(map(len,labels));np.save(cache/'labels.npy',np.asarray(labels,dtype='S'+str(max_length)),allow_pickle=False)
        ranges={k:[float(np.min(coords[valid,j])),float(np.max(coords[valid,j]))] for j,k in enumerate(['ap','ml','dv'])} if valid.any() else {}
        info={'version':1,'dataset':d['id'],'fingerprint':d['fingerprint'],'contract':CONTRACT,'sources':d['sources'],'qc':qc,'sections':list(sections),'ranges':ranges}
        tmp=cache/'index.pending.json';tmp.write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8');os.replace(tmp,cache/'index.json');return info

    def catalog(self):
        return {'format':'mouse-atlas-merfish-service','version':1,'root':str(self.root),'contract':CONTRACT,'progress':dict(self.progress),'datasets':[{'id':d['id'],'expression_rows':d['n'],'gene_count':len(d['genes']),'ready':name in self.ready,'qc':self.ready.get(name,{}).get('info',{}).get('qc'),'ranges':self.ready.get(name,{}).get('info',{}).get('ranges'),'fingerprint':d['fingerprint']} for name,d in self.datasets.items()],'genes':next(iter(self.datasets.values()))['genes'],'taxonomy':self.taxonomy}

    def values(self,d,gene):
        key=(d['id'],gene)
        with self.lock:
            if key in self.expression_cache: self.expression_cache.move_to_end(key);return self.expression_cache[key]
            matches=[i for i,g in enumerate(d['genes']) if g['id']==gene]
            if not matches: raise ValueError('所选基因在 '+d['id']+' 中不存在：'+gene)
            start=time.monotonic()
            with h5py.File(d['h5'],'r') as f: values=np.asarray(f['X'][:,matches[0]],dtype=np.float32)
            self.expression_cache[key]=values
            while len(self.expression_cache)>4: self.expression_cache.popitem(last=False)
            print(json.dumps({'event':'gene','dataset':d['id'],'gene':gene,'seconds':round(time.monotonic()-start,3)}),flush=True);return values

    def query(self,request):
        if request.get('symmetry','native')!='native': return symmetric_query(self,request)
        names=request.get('datasets') or []
        if not names or any(name not in self.datasets for name in names): raise ValueError('请选择实际存在的数据集')
        if len(names)!=len(set(names)): raise ValueError('数据集不可重复选择')
        if any(name not in self.ready for name in names): raise RuntimeError('坐标索引尚未就绪，请等待后重试')
        mode=request.get('mode','gene');gene=str(request.get('gene',''));level=request.get('level','class');type_filter=str(request.get('cellType',''));hemi=request.get('hemisphere','B');planes=request.get('planes',[]);volume=request.get('volume') is True
        if mode not in ['gene','type'] or level not in ['class','subclass','neurotransmitter']: raise ValueError('无效着色模式')
        slab=float(request.get('slab',.1));minimum=float(request.get('minimum',0));confidence=float(request.get('confidence',0));limit=int(request.get('limit',200000))
        if not (.01<=slab<=5 and 1<=limit<=500000 and math.isfinite(minimum) and 0<=confidence<=1): raise ValueError('显示参数超出有效范围')
        if not volume and (not planes or len(planes)>128): raise ValueError('需要 1–128 个片层')
        parsed=[]
        for plane in planes:
            axis={'coronal':0,'sagittal':1,'horizontal':2}.get(plane.get('orientation'));p=float(plane.get('position'))
            if axis is None or not math.isfinite(p): raise ValueError('片层坐标无效')
            parsed.append((axis,p))
        aliases=None
        if type_filter: aliases=np.array([int(r['cluster_alias']) for r in self.taxonomy if str(r.get(level,''))==type_filter],dtype=np.int32)
        candidates=[];matched=0;invalid_values=0;full_min=None;full_max=None;source=[]
        for di,name in enumerate(names):
            d=self.datasets[name];a=self.ready[name];rows=a['valid_rows'];xyz=a['coords'][rows];mask=np.ones(len(rows),dtype=bool)
            if not volume:
                mask[:]=False
                for axis,p in parsed: mask|=np.abs(xyz[:,axis]-p)<=slab/2+1e-7
            if hemi=='L': mask&=xyz[:,1]<0
            elif hemi=='R': mask&=xyz[:,1]>=0
            elif hemi!='B': raise ValueError('无效半球')
            if aliases is not None: mask&=np.isin(a['cluster'][rows],aliases)
            if confidence>0: mask&=np.isfinite(a['confidence'][rows])&(a['confidence'][rows]>=confidence)
            rows=np.asarray(rows[mask],dtype=np.int32);values=self.values(d,gene)[rows] if mode=='gene' else np.zeros(len(rows),dtype=np.float32)
            finite=np.isfinite(values);invalid_values+=int((~finite).sum());keep=finite&(values>=minimum if mode=='gene' else True);rows=rows[keep];values=values[keep]
            if len(rows):
                lo=float(values.min());hi=float(values.max());full_min=lo if full_min is None else min(lo,full_min);full_max=hi if full_max is None else max(hi,full_max)
            matched+=len(rows);candidates.append((di,a,rows,values));source.append({'dataset':name,'fingerprint':d['fingerprint'],'matched':len(rows),'sources':d['sources']})
        display=request.get('display','points')
        if display not in ['points','regions','both']: raise ValueError('无效显示方式')
        regional=None
        if display!='points':
            if self.region_aggregator is None: self.region_aggregator=RegionAggregator(self,APP_ROOT)
            regional=self.region_aggregator.aggregate(request)
        stride=max(1,math.ceil(matched/limit));cells=[];offset=0
        for di,a,rows,values in candidates:
            take=np.arange((-offset)%stride,len(rows),stride,dtype=np.int64);offset+=len(rows);selected=rows[take];xyz=a['coords'][selected]
            if display!='regions': cells.extend(np.column_stack((xyz,values[take],a['cluster'][selected],np.full(len(selected),di),selected)).tolist())
        result={'format':'mouse-atlas-merfish-overlay','version':1,'contract':CONTRACT,'datasets':names,'columns':['ap','ml','dv','value','cluster_alias','dataset_index','obs_index'],'cells':cells,'matched':matched,'displayed':len(cells),'sampling':{'method':'systematic source-row stride','stride':stride,'limit':limit},'range':[full_min,full_max] if matched else [0,1],'invalid_expression_values':invalid_values,'sources':source,'query':request,'createdAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
        if regional is not None: result['regional']=regional
        return result

def serve(store,port,aav_roots=None):
    aav=AavStore(aav_roots)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*args): print(fmt%args,flush=True)
        def origin(self):
            origin=self.headers.get('Origin');return origin if origin=='null' or origin in [f'http://127.0.0.1:{port}',f'http://localhost:{port}'] else None
        def headers_for(self,kind,code=200,length=None):
            self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            if self.origin(): self.send_header('Access-Control-Allow-Origin',self.origin());self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Private-Network','true')
            if length is not None:self.send_header('Content-Length',str(length))
        def json(self,value,code=200):
            raw=json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf8');packed=gzip.compress(raw,compresslevel=1) if 'gzip' in self.headers.get('Accept-Encoding','') and len(raw)>2048 else raw
            self.headers_for('application/json; charset=utf-8',code,len(packed))
            if packed is not raw:self.send_header('Content-Encoding','gzip')
            self.end_headers();self.wfile.write(packed)
        def do_OPTIONS(self):
            if self.headers.get('Origin') and not self.origin(): self.send_error(403);return
            self.headers_for('text/plain',204,0);self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type');self.end_headers()
        def do_GET(self):
            if self.headers.get('Origin') and not self.origin(): self.send_error(403);return
            route=urlparse(self.path).path
            if route in ['/api/merfish/catalog','/api/merfish/status']: self.json(store.catalog());return
            if route=='/api/aav/catalog': self.json(aav.catalog());return
            if route=='/':
                path=APP_ROOT/'dist/index.html';self.headers_for('text/html; charset=utf-8',length=path.stat().st_size);self.end_headers()
                with path.open('rb') as file:
                    while data:=file.read(1024*1024):self.wfile.write(data)
                return
            self.send_error(404)
        def do_POST(self):
            if self.headers.get('Origin') and not self.origin():self.send_error(403);return
            try:
                route=urlparse(self.path).path
                if route not in ['/api/merfish/query','/api/aav/query']:self.send_error(404);return
                length=int(self.headers.get('Content-Length',0))
                if not 0<length<=1000000: raise ValueError('请求体大小无效')
                request=json.loads(self.rfile.read(length));self.json((aav if route=='/api/aav/query' else store).query(request))
            except RuntimeError as exc:self.json({'error':str(exc)},503)
            except (ValueError,KeyError,TypeError) as exc:self.json({'error':str(exc)},400)
            except Exception as exc:
                import traceback;traceback.print_exc();self.json({'error':'读取失败：'+str(exc)},500)
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler);threading.Thread(target=store.prepare,daemon=True).start();print(json.dumps({'event':'listening','url':f'http://127.0.0.1:{port}/','root':str(store.root)},ensure_ascii=False),flush=True);server.serve_forever()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',required=True,help='Local ABC Atlas root or its parent; source data are never uploaded');parser.add_argument('--cache');parser.add_argument('--port',type=int,default=8765);parser.add_argument('--aav-root',action='append');parser.add_argument('--prepare-only',action='store_true');args=parser.parse_args();store=MerfishStore(args.root,args.cache);os.environ['ATLAS_DATA_ROOT']=str(store.root)
    if args.prepare_only:store.prepare();print(json.dumps(store.catalog(),ensure_ascii=False));return 0 if store.progress['state']=='ready' else 1
    serve(store,args.port,args.aav_root)

if __name__=='__main__':sys.exit(main())
