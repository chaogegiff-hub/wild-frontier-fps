# Woodland tree variant

Source: https://polyhaven.com/a/tree_small_02

Author: Rico Cilliers

License: CC0-1.0 — https://polyhaven.com/license

Uses the original different 3D tree and photographic bark and leaf textures.
The shipped LOD is actual reduced 3D bark/branches surrounded by local crossed
leaf-cluster surfaces distributed at the original leaf positions. Each local
crown cell is baked directly from its own original textured leaf triangles
at five directions (near LOD) or three directions (middle LOD), with correct
original alpha and no baked directional darkening. This is a derived game LOD,
not a claimed new scan and not a single flat whole-tree image.

Original bark UV sets and PBR maps are retained. The official separate 16-bit
leaf alpha is converted by division by 257. Transparent texel RGB is dilated
to prevent dark mip fringes. Tree grounded at Y=0 and whole crown centered X/Z,
Y-up metres. Distant eight-view atlas is rendered from the full original tree.
See conversion.json for dimensions, source cells, primitive counts, and atlas
orientation. Native projected-crown checks are asset checks, not browser QA.

Reproduce in order:
node scripts/prepare-woodland-tree.mjs /path/to/tree_small_02
python scripts/prepare-woodland-clusters.py /path/to/tree_small_02 /path/to/qa
python scripts/check-woodland-tree.py /path/to/tree_small_02 /path/to/qa
