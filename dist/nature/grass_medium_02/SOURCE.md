# Grass Medium 02

Original asset: https://polyhaven.com/a/grass_medium_02

Author: Rico Cilliers. License: **CC0 1.0**; verified on the author-hosted asset page and https://polyhaven.com/license. Poly Haven allows modification and redistribution of its assets. This is the actual Poly Haven 3D grass geometry with photographic blade textures, not a photo placed behind the scene.

Download manifest: https://api.polyhaven.com/files/grass_medium_02

Original glTF: https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/grass_medium_02/grass_medium_02_1k.gltf

Original geometry: https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/grass_medium_02/grass_medium_02.bin

Original separate alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/1k/grass_medium_02/grass_medium_02_alpha_1k.png

Reproduce with `node scripts/prepare-meadow-grass.mjs /path/to/grass_medium_02`. The source folder must contain `model.gltf`, `grass_medium_02.bin`, and the official diffuse, normal, ARM JPGs and alpha PNG under `textures/`.

The output contains three distinct clumps from the official a/c/e variants. Source display offsets are removed, X/Z centers are normalized, and each root is grounded at Y=0. Units are metres; Y is up. Material uses actual original UVs, double-sided alpha masking, normal mapping and packed roughness/metalness. No arbitrary atlas crop or substitute flat grass quad is used.

The official alpha PNG is 16-bit grayscale. Values are divided by 257 before merging into the diffuse PNG. Black background stays fully transparent; photographed blade colors and silhouettes remain unchanged. The 1K base color is RGBA, while normal and ARM stay JPG.

| Variant | Near triangles | Near height | Far triangles | Far height |
| --- | ---: | ---: | ---: | ---: |
| a | 450 | 0.1564 m | 72 | 0.1341 m |
| c | 599 | 0.2317 m | 108 | 0.2203 m |
| e | 850 | 0.4032 m | 180 | 0.4032 m |

Near geometry uses attribute-aware simplification of the original 714 / 1,215 / 1,664 triangle meshes, preserving UVs and normals. Far geometry simplifies every separate blade island to four triangles; all 18 / 27 / 45 blade islands remain, rather than reducing the tuft to a few unrelated billboard cards. Both LODs share the same exact textures. See `conversion.json` for measured bounds and mesh statistics.

Original files and their MD5 values from Poly Haven's public manifest:

- glTF: `dd8f166a6399238553bc3b2931677b68`
- Binary: `145041ae03fe02783a0adbd1cdcb4988`
- Diffuse JPG: `4bb5230e09358d60dd767331685b2d36`
- Normal JPG: `90b4c27b0c0ff058bd37b88bb70784c1`
- ARM JPG: `2b7a7e6f8b71fd2da62cf172d4784bbb`
- Alpha PNG: `b231cd6a1b5eb7ae21e7c2e626f8318c`

## V2.18 resident meadow use

The game samples these CC0 photographed leaves on slender curved ribbons and two bowed lower tuft surfaces, 48 triangles per fixed clump. The shared 2048 x 1024 alpha atlas composites the original photographed green leaves; it refreshes only when their source image changes. These runtime shapes are authored geometry, not additional photogrammetry scans. All 1,036,377 roots and their full-map placement remain fixed. Original meshes and material sources are retained.
