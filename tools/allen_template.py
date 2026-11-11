"""Allen official NIfTI -> read-only, affine-checked 50um display cache."""
from __future__ import annotations
import base64
import gzip
import hashlib
import json
import math
import os
import struct
import threading
from pathlib import Path
import numpy as np

APP_ROOT=Path(__file__).resolve().parent.parent
ATLAS_ROOT=Path(os.environ.get('ATLAS_DATA_ROOT','abc_atlas'))
SOURCE=ATLAS_ROOT/'image_volumes/Allen-CCF-2020/20230630/average_template_10.nii.gz'
MANIFEST=ATLAS_ROOT/'releases/20240831/manifest.json'


def packed(array):
    return base64.b64encode(gzip.compress(np.ascontiguousarray(array).tobytes(),compresslevel=1,mtime=0)).decode('ascii')


def raster_layout(orientation,shape,resolution):
    size=resolution/10
    if orientation=='coronal': return dict(width=shape[2],height=shape[1],x=.5-size/2,y=.5-size/2,display_width=shape[2]*size,display_height=shape[1]*size)
    if orientation=='sagittal': return dict(width=shape[0],height=shape[1],x=1319.5-(shape[0]-1)*size-size/2,y=.5-size/2,display_width=shape[0]*size,display_height=shape[1]*size)
    return dict(width=shape[2],height=shape[0],x=.5-size/2,y=.5-size/2,display_width=shape[2]*size,display_height=shape[0]*size)


def plane_order(array,orientation):
    # After collapsing AP / DV / LR: row axis matches the existing 2D plane.
    if orientation=='sagittal': return array.T[:,::-1]
    return array


class AllenTemplate:
    def __init__(self,source=None,manifest=None,cache=None):
        atlas_root=Path(os.environ.get('ATLAS_DATA_ROOT',str(ATLAS_ROOT)))
        self.source=Path(source) if source else atlas_root/'image_volumes/Allen-CCF-2020/20230630/average_template_10.nii.gz'
        self.manifest=Path(manifest) if manifest else atlas_root/'releases/20240831/manifest.json'
        self.cache=Path(cache or APP_ROOT/'tools/cache/allen-template')
        self.lock=threading.RLock();self.volume=None;self.info=None

    def load(self):
        with self.lock:
            if self.volume is not None:return self.volume
            stat=self.source.stat()
            entry=json.loads(self.manifest.read_text(encoding='utf8'))['file_listing']['Allen-CCF-2020']['image_volumes']['average_template_10']['files']['nii.gz']
            if stat.st_size!=entry['size']:raise ValueError('官方NIfTI源大小与发布清单不符')
            source={'path':str(self.source),'bytes':stat.st_size,'mtime_ns':stat.st_mtime_ns,'manifest':str(self.manifest),'official_url':entry['url'],'manifest_md5':entry['file_hash']}
            fingerprint=hashlib.sha256(json.dumps({'source':source,'method':'native sample stride5; NIfTI qform verified','version':1},sort_keys=True).encode()).hexdigest()
            self.cache.mkdir(parents=True,exist_ok=True)
            path=self.cache/(fingerprint+'.npy');meta=self.cache/(fingerprint+'.json')
            if not (path.is_file() and meta.is_file()):
                with self.source.open('rb') as stream:md5=hashlib.file_digest(stream,'md5').hexdigest()
                if md5!=entry['file_hash']:raise ValueError('官方NIfTI源MD5与发布清单不符')
                with gzip.open(self.source,'rb') as stream:
                    header=stream.read(352)
                    if struct.unpack_from('<i',header)[0]!=348 or header[344:347]!=b'n+1':raise ValueError('模板不是单文件NIfTI-1')
                    dims=struct.unpack_from('<3h',header,42);datatype=struct.unpack_from('<h',header,70)[0]
                    if dims!=(1320,800,1140) or datatype!=512:raise ValueError('模板维度/类型与官方10µm模板不符')
                    if header[123]&7!=2 or struct.unpack_from('<h',header,252)[0]<1:raise ValueError('模板缺少mm单位/qform')
                    b,c,d,x,y,z=struct.unpack_from('<6f',header,256);a=math.sqrt(max(0,1-b*b-c*c-d*d))
                    rotation=np.array([[a*a+b*b-c*c-d*d,2*(b*c-a*d),2*(b*d+a*c)],[2*(b*c+a*d),a*a+c*c-b*b-d*d,2*(c*d-a*b)],[2*(b*d-a*c),2*(c*d+a*b),a*a+d*d-c*c-b*b]])
                    spacing=np.array(struct.unpack_from('<3f',header,80));spacing[2]*=-1 if struct.unpack_from('<f',header,76)[0]<0 else 1
                    affine=np.eye(4);affine[:3,:3]=rotation@np.diag(spacing);affine[:3,3]=[x,y,z]
                    expected=np.array([[0,0,.01,-5.695],[-.01,0,0,5.35],[0,-.01,0,5.22],[0,0,0,1]])
                    if not np.allclose(affine,expected,atol=1e-5):raise ValueError('官方模板仿射与当前CCF坐标不符，拒绝猜测对齐')
                    if struct.unpack_from('<2f',header,112)!=(1.,0.):raise ValueError('不支持的模板强度缩放')
                    offset=round(struct.unpack_from('<f',header,108)[0]);stream.read(max(0,offset-352))
                    sampled=np.empty((264,160,228),dtype='<u2',order='F');plane_bytes=dims[0]*dims[1]*2
                    for k in range(dims[2]):
                        raw=stream.read(plane_bytes)
                        if len(raw)!=plane_bytes:raise ValueError('官方NIfTI体素数据被截断')
                        if k%5==0:sampled[:,:,k//5]=np.frombuffer(raw,dtype='<u2').reshape(dims[:2],order='F')[::5,::5]
                        if k%200==0:print(json.dumps({'event':'allen-template-cache','plane':k,'total':dims[2]}),flush=True)
                np.save(path,sampled,allow_pickle=False)
                positive=sampled[sampled>0]
                self.info={'format':'mouse-atlas-allen-template','source':source,'source_md5_verified':True,'fingerprint':fingerprint,'source_dims':dims,'source_resolution_um':10,'display_resolution_um':50,'qform_affine':affine.tolist(),'display_affine':(affine@np.diag([5,5,5,1])).tolist(),'method':'native stride-5 intensity samples; display only, not new anatomical resolution','window':[float(np.percentile(positive,.5)),float(np.percentile(positive,99.5))]}
                meta.write_text(json.dumps(self.info,ensure_ascii=False),encoding='utf8')
            else:self.info=json.loads(meta.read_text(encoding='utf8'))
            self.volume=np.load(path,mmap_mode='r',allow_pickle=False)
            return self.volume

    def planes(self,planes,hemisphere='B'):
        volume=self.load();result=[];axes={'coronal':0,'horizontal':1,'sagittal':2}
        for plane in planes:
            orientation=plane['orientation'];position=float(plane['position']);axis=axes[orientation]
            index=(position+(5.695 if axis==2 else 0))/.05
            lo=math.floor(index);hi=lo+1;t=index-lo
            lower=np.take(volume,np.clip(lo,0,volume.shape[axis]-1),axis=axis).astype(np.float32)
            upper=np.take(volume,np.clip(hi,0,volume.shape[axis]-1),axis=axis).astype(np.float32)
            values=plane_order(lower*(1-t)+upper*t,orientation).astype('<f4')
            mask=values>0
            if not 0<=index<=volume.shape[axis]-1:mask[:]=False
            if hemisphere!='B':
                if orientation=='sagittal':mask&=(position<0 if hemisphere=='L' else position>=0)
                else:
                    ml=np.arange(values.shape[1])*.05-5.695
                    mask&=((ml<0) if hemisphere=='L' else (ml>=0))[None,:]
            result.append({**plane,**raster_layout(orientation,volume.shape,50),'resolution_um':50,'values_gzip_f32':packed(values),'mask_gzip_u8':packed(mask.astype('u1'))})
        return {'format':'mouse-atlas-template-planes','version':1,'provenance':self.info,'planes':result}
