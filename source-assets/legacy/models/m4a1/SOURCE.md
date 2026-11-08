# M4A1 PBR model

Author: nisu. License: CC0 1.0 Universal (public domain dedication).

Original author page: https://opengameart.org/content/m4a1-assault-rifle

Original archive: https://opengameart.org/sites/default/files/m4a1_0.zip

Converted from the author's FBX to glTF 2.0, with all 13 individual mesh parts and original UV coordinates. The original 2048 maps were reduced to 1024; roughness and metallic were packed into glTF's green and blue channels. The geometry was uniformly scaled to 0.88 meters and rotated so the muzzle points along +Z. The `Muzzle` node records the real barrel opening.

Reproduce with `scripts/convert-real-weapons.mjs`, using the original extracted M4A1 directory. The converter's Three.js FBX loader and helpers use the MIT license in `scripts/vendor/three-fbx/LICENSE`.

Then run `python scripts/repair-m4-geometry.py`. The FBX conversion contained 50 zero-area faces and 12 zero normals on four real receiver faces. The repair removes only those degenerate faces and supplies geometric normals for those four faces. It preserves all valid source normals, UV coordinates, part names and mechanical pivots. The repaired asset has 9,208 triangles.
