# M700 PBR model

Author: Stein Games. License: CC0 1.0 Universal (public domain dedication).

Original author page: https://stein-indie.itch.io/m700

Original archive: `Sniper_R700_Free_CC0.zip`, obtained through the author's anonymous public download. Only the FBX and three texture images are used; the bundled Unreal Engine project is excluded.

Converted from the detailed FBX LOD to glTF 2.0. All mechanical vertices have a single rigid joint weight, so the eight joint groups were separated into independent meshes without changing their rest geometry. Original UVs are preserved. The 2048 maps were reduced to 1024; the author's MAOR channels were rearranged from metallic/AO/inverse roughness to glTF AO/roughness/metallic. The Unreal DirectX normal's green channel is inverted for glTF OpenGL normals.

The geometry is 1.07 meters long, with the muzzle along +Z. `FX_FIRE`, `FX_CASING`, `ATTACH_SCOPE`, `ATTACH_SILENCER` and `Muzzle` preserve the author's attachment/effect locations. The source has iron sights and no scope mesh; `ATTACH_SCOPE` remains available for a separate scope.

Reproduce with `scripts/convert-real-weapons.mjs /path/to/Assets m700`. The converter's Three.js FBX loader and helpers use the MIT license in `scripts/vendor/three-fbx/LICENSE`.
