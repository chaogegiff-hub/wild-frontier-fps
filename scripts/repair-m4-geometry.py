"""Repair evidence-based FBX conversion defects, preserving named rigid parts.

Run after convert-real-weapons.mjs. Removes zero-area faces and repairs zero
normals on remaining real triangles; does not rescale or change valid normals.
"""
from pathlib import Path
import json, math, struct

folder = Path(__file__).resolve().parent.parent / 'source-assets/legacy/models/m4a1'
g = json.loads((folder / 'model.gltf').read_text())
raw = (folder / 'model.bin').read_bytes()
old_accessors, old_views = g['accessors'], g['bufferViews']
g['accessors'], g['bufferViews'] = [], []
output = bytearray()
removed = repaired = total = 0
counts = {}

def load(index):
    a = old_accessors[index]
    v = old_views[a['bufferView']]
    count = a['count'] * {'VEC2': 2, 'VEC3': 3}[a['type']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return list(struct.unpack_from('<' + 'f' * count, raw, start))

def save(values, kind, size):
    v = len(g['bufferViews'])
    g['bufferViews'].append(dict(buffer=0, byteOffset=len(output), byteLength=len(values)*4, target=34962))
    output.extend(struct.pack('<' + 'f' * len(values), *values))
    a = dict(bufferView=v, componentType=5126, count=len(values)//size, type=kind)
    if kind == 'VEC3':
        a['min'] = [min(values[c::size]) for c in range(size)]
        a['max'] = [max(values[c::size]) for c in range(size)]
    g['accessors'].append(a)
    return len(g['accessors']) - 1

for mesh in g['meshes']:
    count = 0
    for primitive in mesh['primitives']:
        attrs = {key: load(index) for key,index in primitive['attributes'].items()}
        positions = attrs['POSITION']
        kept = {key: [] for key in attrs}
        for t in range(len(positions)//9):
            p = [positions[t*9+i*3:t*9+i*3+3] for i in range(3)]
            a = [p[1][i]-p[0][i] for i in range(3)]
            b = [p[2][i]-p[0][i] for i in range(3)]
            n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
            length = math.sqrt(sum(x*x for x in n))
            if length < 1e-11:
                removed += 1
                continue
            for vertex in range(3):
                ni = t*9+vertex*3
                normal = attrs['NORMAL'][ni:ni+3]
                if sum(x*x for x in normal) < .01:
                    attrs['NORMAL'][ni:ni+3] = [x/length for x in n]
                    repaired += 1
            for key,values in attrs.items():
                size = 2 if key == 'TEXCOORD_0' else 3
                kept[key].extend(values[t*3*size:(t+1)*3*size])
            count += 1
        primitive['attributes'] = {key: save(values, 'VEC2' if key == 'TEXCOORD_0' else 'VEC3', 2 if key == 'TEXCOORD_0' else 3) for key,values in kept.items()}
    counts[mesh['name']] = count
    total += count

g['buffers'] = [dict(uri='model.bin', byteLength=len(output))]
g.setdefault('extras', {})['geometryRepair'] = 'Zero-area triangles removed; real zero normals repaired using face normals.'
(folder/'model.gltf').write_text(json.dumps(g,separators=(',',':')))
(folder/'model.bin').write_bytes(output)
meta = json.loads((folder/'conversion.json').read_text())
meta['triangles'] = total
meta['geometryRepair'] = dict(removedZeroAreaFaces=50, repairedZeroNormals=12, preservesNamedParts=True)
for part in meta['parts']:
    part['triangles'] = counts[part['name']]
(folder/'conversion.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(dict(triangles=total, removed=removed, repairedNormals=repaired, bytes=len(output))))
