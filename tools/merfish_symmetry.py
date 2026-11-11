"""Explicit display-only reflection of one source hemisphere, without recounting cells."""
from copy import deepcopy


def symmetric_query(store, request):
    mode = request.get('symmetry', 'native')
    if mode not in ('left', 'right'):
        raise ValueError('无效双侧展示方式')
    target = request.get('hemisphere', 'B')
    if target not in ('B', 'L', 'R'):
        raise ValueError('无效半球')
    source_hemi = 'L' if mode == 'left' else 'R'
    sign = -1 if mode == 'left' else 1
    original_planes = request.get('planes', [])
    native = deepcopy(request)
    native.pop('symmetry', None)
    native['hemisphere'] = source_hemi
    for plane in native.get('planes', []):
        if plane.get('orientation') == 'sagittal':
            plane['position'] = sign * abs(float(plane['position']))
    result = store.query(native)
    real_cells = result['cells']
    cells = []
    mirrored = 0
    actual = 0
    for row in real_cells:
        if target in ('B', source_hemi):
            cells.append(row + [False, row[1]])
            actual += 1
        if target == 'B' or target != source_hemi:
            if abs(row[1]) > 1e-7:
                copy = list(row)
                copy[1] = -copy[1]
                cells.append(copy + [True, row[1]])
                mirrored += 1
    result.update(cells=cells, displayed=len(cells), query=deepcopy(request))
    result['columns'] += ['is_mirrored', 'source_ml']
    result['symmetry'] = {
        'mode': mode, 'source_hemisphere': source_hemi,
        'midline_ml_mm': 0, 'transform': 'ml -> -ml; ap,dv unchanged',
        'display_only': True, 'independent_measurements': False,
        'matched_source_cells': result['matched'],
        'sampled_source_cells': len(real_cells),
        'displayed_actual_points': actual, 'mirrored_points': mirrored,
        'limit_applies_to': 'sampled real source cells; bilateral copies can double displayed points',
        'note': 'Mirrored display copies, not observed contralateral cells. All statistics use source hemisphere only.'
    }
    if 'regional' in result:
        regional = result['regional']
        source_scopes = deepcopy(regional['scopes'])
        regional['source_scopes'] = source_scopes
        scopes = []
        planes = [{'orientation': 'volume', 'position': None}] if request.get('volume') else original_planes
        for plane in planes:
            source_position = sign * abs(float(plane['position'])) if plane['orientation'] == 'sagittal' else plane['position']
            source = next(s for s in source_scopes if s['orientation'] == plane['orientation'] and (source_position is None or abs(s['position'] - source_position) < 1e-6))
            scope = deepcopy(source)
            scope.update(orientation=plane['orientation'], position=plane['position'], source_position=source_position)
            scope['rows'] = []
            for row in source['rows']:
                if target in ('B', source_hemi):
                    scope['rows'].append({**row, 'source_hemisphere': source_hemi, 'is_mirrored': False})
                if target == 'B' or target != source_hemi:
                    scope['rows'].append({**row, 'hemisphere': 'R' if source_hemi == 'L' else 'L', 'source_hemisphere': source_hemi, 'is_mirrored': True, 'status': 'mirrored_' + row['status']})
            scopes.append(scope)
        regional['scopes'] = scopes
        regional['population'] += '; display reflected from source hemisphere; mirrored rows are not additional samples'
        regional['symmetry'] = deepcopy(result['symmetry'])
    return result
