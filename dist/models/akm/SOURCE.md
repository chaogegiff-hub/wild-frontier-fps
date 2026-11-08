# Weathered AKM

Original asset: **AKM**, by **LonesomeDucky**.

- Source page: https://opengameart.org/content/weathered-akm-rifle
- Original download: https://opengameart.org/sites/default/files/akm54.blend
- License: **CC0 1.0 Universal** https://creativecommons.org/publicdomain/zero/1.0/
- Original page checked 2026-10-18. It explicitly identifies the author, CC0 license, and “Low-poly weathered AKM with PBR textures.”

This is a conversion of the author's actual asset, not an original procedural reconstruction or a scan. Original topology, UV seams, packed authored PBR maps and custom split normals are preserved. 5,322 triangles; 5,172 body and 150 in the original disconnected magazine component. The original mesh uses 2,812 source vertices and 15,966 corners; custom Blender normals were decoded in 2,818 original corner normal fans.

Conversion uses the embedded Blender 4.03 SDNA and the Blender 4.3 corner normal space method. All normal vectors were checked finite and unit length. Source coordinates were rotated with determinant +1 into meters, +Y up, +Z forward. Length is normalized to 0.88 m. Original source transform stored a -90° Z rotation; the local geometry is used for the game's consistent weapon convention.

Five 4096 px source maps were reduced to 2048 px for delivery. Base color is JPEG quality 94; normal and ORM are JPEG quality 95, all with full chroma. OpenGL normal convention is retained; ORM is linear R=original AO, G=original roughness, B=original metallic. No invented metal detail, fake wood grain, generated textures or color multipliers were added. Both maps use the original UV atlas, with V flipped for glTF.

Named marker transforms are documented in conversion.json. SIGHT_REAR is the actual rear notch opening center; SIGHT_FRONT is the center of the source front post top. SIGHT_REAR_RIM is supplied separately for a classic blade-top reference. MagazinePivot preserves the original component placement and supports reload animation.

`read_dna.py`, `convert_akm.py`, `finalize_akm.py` are recovery scripts; `source-full.blend` is the original download. These sources are not needed at runtime.
