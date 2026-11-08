# Anatomical FPS-only arms

Author: **para**, using the **MakeHuman team** mesh and skin texture.
License: **CC0 1.0 Universal** (public domain dedication).
Primary author page: https://opengameart.org/content/fps-arms-rigged-only
Original archive: https://opengameart.org/sites/default/files/fps%20arms.7z
License: https://creativecommons.org/publicdomain/zero/1.0/

This is a dedicated pair of anatomically modeled first-person arms, not a full
character with its torso hidden. It is authored geometry and a skin texture;
it is not a photogrammetry scan. The original asset is ungloved.

Prepared using `scripts/prepare-fps-arms.mjs` from `FPS ARMS RIG 1.fbx` and
`new_diff.png`. The skin map is resized to 1024px and encoded as JPEG. Original
vertex normals, UVs, skin weights and full finger joints are preserved.
Duplicate vertices are welded, leaving **4,600 vertices / 8,152 triangles**.

## Coordinates and binding

All positions are **meters**, **Y up**. The author's neutral pose has shoulders
near `(±0.192, 0.015, -0.007)`, elbows near `(±0.362, -0.180, -0.004)` and wrists
near `(±0.498, -0.308, -0.196)`. Upper-arm length is 0.259m, forearm length 0.267m.
Left means the player's left, so left X is negative. No placement transform is
needed to correct FBX axes; the mesh is in world-meter rest coordinates and the
mesh node transform is identity. The original FBX uniform 0.1 skeleton scale is removed, so joint-local offsets are also meters and bone scales are one. Bind matrices were regenerated from that pose.
The complete neutral bounding box is approximately
`[-0.579, -0.450, -0.370] → [0.579, 0.008, 0.086]`.

For two-bone IK use these nodes:

| Side | Shoulder | Elbow | Wrist controller | Skin wrist |
| --- | --- | --- | --- | --- |
| Left | `upper_armL` | `forearmL` | `handLcontrol` | `handL` |
| Right | `upper_armR` | `forearmR` | `handRcontrol` | `handR` |

The original Blender hand controls were detached from the forearms. During
conversion each controller is reparented into its corresponding forearm while
preserving its global rest transform. Thus rotating the upper arm and forearm
moves both forearm skin and hand skin continuously, without detached wrists.
`handL` and `handR` are direct children of their controllers and are the correct
nodes for additional grip orientation. All finger names and bone rest rotations
are preserved; see `conversion.json` and `model.gltf` for exact data.

Do not reuse a Mixamo-specific finger rotation or soldier-body offset on these
arms. Use the documented joints, solve wrist positions with a normal two-bone
IK, and orient the hand skin joints explicitly for the firearm grip. The asset
contains no authored weapon animations.
