"""Read-only, offline Allen Mouse Connectivity grid volumes. No network downloads."""
from __future__ import annotations
import csv
import gzip
import hashlib
import json
import math
import re
import threading
from collections import OrderedDict
from pathlib import Path
import numpy as np
from allen_template import AllenTemplate, packed, raster_layout, plane_order

DEFAULT_ROOTS = []  # Supply local volume folders using --aav-root; no author-machine defaults.
CONTRACT = {'space':'Allen CCF native mm, not bregma', 'axes':['AP anterior-to-posterior','DV superior-to-inferior','ML left-to-right'],
            'coordinates':'ap=i*resolution_um/1000; dv=j*resolution_um/1000; ml=k*resolution_um/1000-5.695',
            'value':'projection_density = detected projection pixels / all pixels in voxel, [0,1]',
            'warning':'AAV signal includes injection site unless injection_fraction is available and excluded. Not single-axon tractography or functional connectivity.',
            'mask':'finite data_mask >= 0.5; invalid/nonfinite density excluded, never replaced by zero'}


def read_nrrd(path):
    """Allen inline raw/gzip NRRD, first axis fastest (Fortran order)."""
    with Path(path).open('rb') as stream:
        if not stream.readline().startswith(b'NRRD000'):
            raise ValueError('不是 NRRD 文件：'+str(path))
        fields = {}
        for _ in range(100):
            line = stream.readline()
            if line in (b'\n', b'\r\n'):
                break
            if not line:
                raise ValueError('NRRD 缺少数据段')
            text = line.decode('ascii').strip()
            if text and not text.startswith('#'):
                key, value = text.split(':', 1)
                fields[key.strip().lower()] = value.strip()
        else:
            raise ValueError('NRRD 头过长')
        if fields.get('dimension') != '3' or 'data file' in fields:
            raise ValueError('只支持本机 Allen 三维内联 NRRD')
        shape = tuple(map(int, fields['sizes'].split()))
        if len(shape) != 3 or any(n < 1 or n > 2000 for n in shape):
            raise ValueError('NRRD 尺寸无效')
        kinds = {'float':'f4','double':'f8','uchar':'u1','unsigned char':'u1','uint8':'u1','short':'i2','unsigned short':'u2'}
        if fields['type'] not in kinds:
            raise ValueError('不支持的 NRRD 类型：'+fields['type'])
        dtype = np.dtype(('>' if fields.get('endian') == 'big' else '<') + kinds[fields['type']])
        encoding = fields.get('encoding', 'raw')
        if encoding not in ('gzip', 'gz', 'raw'):
            raise ValueError('不支持的 NRRD 编码')
        raw = gzip.decompress(stream.read()) if encoding in ('gzip', 'gz') else stream.read()
    if len(raw) != math.prod(shape) * dtype.itemsize:
        raise ValueError('NRRD 数据长度与头不符')
    return np.frombuffer(raw, dtype=dtype).reshape(shape, order='F'), fields


class AavStore:
    def __init__(self, roots=None):
        self.roots = [Path(p).resolve() for p in (roots or DEFAULT_ROOTS)]
        self.records = {}
        self.files = {}
        self.omitted = []
        self.cache = OrderedDict()
        self.lock = threading.RLock()
        self.template = AllenTemplate()
        metadata = {}
        for path in [LOCAL_BASE/'gradient_connectivity/step0_connectivity_experiments.csv', LOCAL_BASE/'dat_ires_cre/experiments_DAT-IRES-Cre_Slc6a3-Cre.csv']:
            if path.is_file():
                with path.open(encoding='utf-8-sig', newline='') as stream:
                    for row in csv.DictReader(stream):
                        key = row['section_data_set_id']
                        metadata.setdefault(key, {}).update(row)
        for root in self.roots:
            if not root.is_dir():
                continue
            for folder in sorted(root.iterdir()):
                match = re.fullmatch(r'sds_(\d+)_(.+)', folder.name)
                if not folder.is_dir() or not match:
                    continue
                experiment, acronym = match.groups()
                for density in sorted(folder.glob('projection_density_*um.nrrd')):
                    resolution = int(re.search(r'_(\d+)um\.nrrd$', density.name)[1])
                    mask = folder/f'data_mask_{resolution}um.nrrd'
                    if not mask.is_file():
                        self.omitted.append({'experiment':experiment,'resolution':resolution,'reason':'missing data_mask'})
                        continue
                    injection = folder/f'injection_fraction_{resolution}um.nrrd'
                    key = (experiment, resolution)
                    if key in self.files and (not injection.is_file() or self.files[key].get('injection')):
                        continue
                    self.files[key] = {'density':density,'mask':mask,'injection':injection if injection.is_file() else None}
                    m = metadata.get(experiment, {})
                    self.records[experiment] = {'id':experiment,'sourceAcronym':m.get('primary_injection_acronym') or m.get('source_acronym') or acronym,
                                               'sourceStructureId':m.get('primary_injection_structure_id') or m.get('source_structure_id'),
                                               'specimenId':m.get('specimen_id') or m.get('specimen_name'),
                                               'transgenicLine':m.get('allen_transgenic_line') or None,
                                               'url':'https://connectivity.brain-map.org/projection/experiment/'+experiment}
        for experiment, record in self.records.items():
            record['resolutions'] = sorted(r for e,r in self.files if e == experiment)
            record['injectionResolutions'] = sorted(r for (e,r), f in self.files.items() if e == experiment and f['injection'])

    def catalog(self):
        return {'format':'mouse-atlas-aav-service','version':1,'roots':[str(p) for p in self.roots], 'contract':CONTRACT,
                'experiments':sorted(self.records.values(), key=lambda r:(r['sourceAcronym'], r['id'])), 'omitted':self.omitted,
                'note':'Local files only. Different experiments are not pooled or mirrored.'}

    def load(self, experiment, resolution):
        key = (experiment, resolution)
        if key not in self.files:
            raise ValueError('本机没有所选实验 / 分辨率的投射密度及有效掩膜')
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
            files = self.files[key]
            arrays = {}
            headers = {}
            sources = []
            expected = (round(13200/resolution), round(8000/resolution), round(11400/resolution))
            for kind, path in files.items():
                if path is None:
                    continue
                array, header = read_nrrd(path)
                if array.shape != expected:
                    raise ValueError('不是预期 Allen CCF 全脑网格尺寸：'+str(path))
                vectors = [tuple(map(float, s.split(','))) for s in re.findall(r'\(([^)]+)\)', header.get('space directions',''))]
                if vectors != [(float(resolution),0.,0.),(0.,float(resolution),0.),(0.,0.,float(resolution))] or header.get('space origin') != '(0,0,0)':
                    raise ValueError('不支持的 Allen 网格方向 / 原点，拒绝猜测配准：'+str(path))
                arrays[kind] = array
                headers[kind] = header
                stat = path.stat()
                sources.append({'kind':kind,'path':str(path),'bytes':stat.st_size,'mtime_ns':stat.st_mtime_ns})
            arrays['provenance'] = {'sources':sources,'headers':headers,'fingerprint':hashlib.sha256(json.dumps({'sources':sources,'contract':CONTRACT},sort_keys=True).encode()).hexdigest()}
            self.cache[key] = arrays
            while len(self.cache) > 2:
                self.cache.popitem(last=False)
            return arrays

    def query(self, request):
        experiment = str(request.get('experiment',''))
        resolution = int(request.get('resolution',50))
        threshold = float(request.get('threshold',.001))
        slab = float(request.get('slab',.1))
        limit = int(request.get('limit',200000))
        hemi = request.get('hemisphere','B')
        planes = request.get('planes',[])
        volume = request.get('volume') is True
        if not (0 <= threshold <= 1 and .01 <= slab <= 5 and 1 <= limit <= 500000) or hemi not in ('B','L','R'):
            raise ValueError('AAV 参数无效')
        if not volume and (not planes or len(planes) > 128):
            raise ValueError('AAV 查询需要 1–128 片层')
        a = self.load(experiment, resolution)
        density, mask = a['density'], a['mask']
        finite = np.isfinite(density) & (density >= 0) & (density <= 1)
        valid = np.isfinite(mask) & (mask >= .5)
        spatial = np.ones(density.shape,dtype=bool) if volume else np.zeros(density.shape,dtype=bool)
        step = resolution/1000
        axes = {'coronal':0,'horizontal':1,'sagittal':2}
        for plane in ([] if volume else planes):
            axis = axes.get(plane.get('orientation'))
            position = float(plane.get('position'))
            if axis is None or not math.isfinite(position):
                raise ValueError('AAV 片层无效')
            coordinates = np.arange(density.shape[axis])*step - (5.695 if axis == 2 else 0)
            shape = [1,1,1]
            shape[axis] = len(coordinates)
            spatial |= (np.abs(coordinates-position) <= slab/2+1e-7).reshape(shape)
        if hemi != 'B':
            ml = np.arange(density.shape[2])*step-5.695
            spatial &= ((ml<0) if hemi == 'L' else (ml>=0))[None,None,:]
        injection = a.get('injection')
        exclude = request.get('excludeInjection') is True
        if exclude and injection is None:
            raise ValueError('该实验 / 分辨率没有本地 injection_fraction，不能声称已排除注射区')
        selected = spatial & valid & finite & (density > 0) & (density >= threshold)
        if exclude:
            selected &= np.isfinite(injection) & (injection <= 0)
        indices = np.argwhere(selected)
        n = len(indices)
        values = density[tuple(indices.T)] if n else np.array([],dtype=np.float32)
        stride = max(1, math.ceil(n/limit))
        shown = indices[::stride]
        voxels = [[float(i*step),float(k*step-5.695),float(j*step),float(density[i,j,k]),float(injection[i,j,k]) if injection is not None and np.isfinite(injection[i,j,k]) else None,int(i),int(j),int(k)] for i,j,k in shown]
        result = {'format':'mouse-atlas-aav-overlay','version':1,'experiment':self.records[experiment], 'resolution_um':resolution,
                'columns':['ap','ml','dv','projection_density','injection_fraction','ap_index','dv_index','lr_index'], 'voxels':voxels,
                'matched':n,'displayed':len(voxels),'sampling':{'stride':stride,'limit':limit,'method':'deterministic C-order voxel stride'},
                'range':[0,float(values.max()) if n else 1], 'query':request,'contract':CONTRACT,'provenance':a['provenance'],
                'qc':{'valid_voxels_in_view':int((spatial&valid).sum()),'invalid_density_in_view':int((spatial&valid&~finite).sum()),
                      'masked_voxels_in_view':int((spatial&~valid).sum()),'injection_available':injection is not None,'injection_excluded':exclude},
                'display_semantics':'2D maximum projection of displayed voxel samples within slab; 3D voxel centres, not streamlines; positive signal only'}
        if not volume and request.get('render2D') is True:
            coverage=valid & finite
            if exclude:coverage &= np.isfinite(injection) & (injection<=0)
            if hemi!='B':
                ml=np.arange(density.shape[2])*step-5.695
                coverage &= ((ml<0) if hemi=='L' else (ml>=0))[None,None,:]
            result['rasters']=self.plane_rasters(density,coverage,planes,slab,resolution)
            result['display_semantics']='2D full-population valid-voxel scalar MIP before display threshold; optional mask-normalized Gaussian applied to scalar MIP in browser, not raw values or statistics. 3D voxel centres unchanged.'
            if request.get('background')=='allen':result['background']=self.template.planes(planes,hemi)
        return result

    @staticmethod
    def plane_rasters(density,coverage,planes,slab,resolution):
        output=[];step=resolution/1000;axes={'coronal':0,'horizontal':1,'sagittal':2}
        for plane in planes:
            orientation=plane['orientation'];axis=axes[orientation]
            coordinates=np.arange(density.shape[axis])*step-(5.695 if axis==2 else 0)
            indices=np.flatnonzero(np.abs(coordinates-float(plane['position']))<=slab/2+1e-7)
            shape=tuple(n for i,n in enumerate(density.shape) if i!=axis)
            if len(indices):
                valid=np.take(coverage,indices,axis=axis)
                raw=np.take(density,indices,axis=axis)
                mask=valid.any(axis=axis)
                values=np.max(np.where(valid,raw,-np.inf),axis=axis)
                values[~mask]=0
            else:values=np.zeros(shape,dtype=np.float32);mask=np.zeros(shape,dtype=bool)
            output.append({**plane,**raster_layout(orientation,density.shape,resolution),'resolution_um':resolution,
                           'values_gzip_f32':packed(plane_order(values,orientation).astype('<f4')),
                           'mask_gzip_u8':packed(plane_order(mask,orientation).astype('u1'))})
        return output
