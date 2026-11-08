# rock_face_01

Source: https://polyhaven.com/a/rock_face_01

Author: Dario Barresi

License: CC0-1.0 — https://polyhaven.com/license

Downloaded the public 1K glTF and photo textures. Created compact LOD geometry using UV/normal-aware meshoptimizer simplification; kept photographed material UVs, leaf alpha and 1K PBR maps. Converted the official 16-bit leaf alpha by division by 257. Recompressed opaque JPEG maps at quality 86. Centered X/Z and grounded the base at Y=0; Y-up meters. Rounded float positions to 1/4096 m, UVs to 1/8192 and normals to 1/2048 for efficient ZIP transfer without runtime decoders. Native alpha silhouette comparison determines acceptable foliage LOD density. See conversion.json for exact bounds and triangle counts.

Reproduce: node scripts/prepare-new-nature.mjs /path/to/unmodified-downloads
