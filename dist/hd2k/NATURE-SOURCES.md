# Native 2K landscape assets

Poly Haven official original files. License: CC0-1.0 — https://polyhaven.com/license

- All 20 active surface photographic maps and all 33 external images in the seven active nature glTF models use original official 2048x2048 Poly Haven sources. No 1K images enlarged.
- Photographic RGB and UV orientation retained; normal maps are OpenGL; ARM maps retain original AO/Roughness/Metal channels. JPEG quality 93 with full 4:4:4 chroma.
- Foliage alpha uses the original 16-bit PNG divided by 257. Invisible RGB is dilated without changing alpha.
- Water normal is generated directly on a periodic 2048px Fourier lattice. It is an authored wave field, not a photograph or enlarged lower-resolution texture.
- Sky is unmodified official 2048x1024 RGBE HDR. All Poly Haven assets CC0-1.0.

Reproduce: `node scripts/prepare-2k-nature.mjs /path/to/download-cache`

## Exact source files

- `environment/sky.hdr` → `hd2k/environment/sky.hdr` (2048×1024)
  Source: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr
- `nature/fern_02/textures/fern_02_arm_1k.jpg` → `hd2k/nature/fern_02/textures/fern_02_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/fern_02/fern_02_arm_2k.jpg
- `nature/fern_02/textures/fern_02_diff_1k.png` → `hd2k/nature/fern_02/textures/fern_02_diff_2k.png` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/fern_02/fern_02_diff_2k.jpg
  Original alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/2k/fern_02/fern_02_alpha_2k.png
- `nature/fern_02/textures/fern_02_nor_gl_1k.jpg` → `hd2k/nature/fern_02/textures/fern_02_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/fern_02/fern_02_nor_gl_2k.jpg
- `nature/flower_heliophila/textures/flower_heliophila_arm_1k.jpg` → `hd2k/nature/flower_heliophila/textures/flower_heliophila_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/flower_heliophila/flower_heliophila_arm_2k.jpg
- `nature/flower_heliophila/textures/flower_heliophila_diff_1k.png` → `hd2k/nature/flower_heliophila/textures/flower_heliophila_diff_2k.png` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/flower_heliophila/flower_heliophila_diff_2k.jpg
  Original alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/2k/flower_heliophila/flower_heliophila_alpha_2k.png
- `nature/flower_heliophila/textures/flower_heliophila_nor_gl_1k.jpg` → `hd2k/nature/flower_heliophila/textures/flower_heliophila_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/flower_heliophila/flower_heliophila_nor_gl_2k.jpg
- `nature/grass_medium_02/textures/grass_medium_02_arm_1k.jpg` → `hd2k/nature/grass_medium_02/textures/grass_medium_02_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/grass_medium_02/grass_medium_02_arm_2k.jpg
- `nature/grass_medium_02/textures/grass_medium_02_diff_1k.png` → `hd2k/nature/grass_medium_02/textures/grass_medium_02_diff_2k.png` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/grass_medium_02/grass_medium_02_diff_2k.jpg
  Original alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/2k/grass_medium_02/grass_medium_02_alpha_2k.png
- `nature/grass_medium_02/textures/grass_medium_02_nor_gl_1k.jpg` → `hd2k/nature/grass_medium_02/textures/grass_medium_02_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/grass_medium_02/grass_medium_02_nor_gl_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_arm_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_arm_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_branches_arm_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_branches_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_branches_arm_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_branches_diff_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_branches_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_branches_diff_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_branches_nor_gl_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_branches_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_branches_nor_gl_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_diff_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_diff_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_leaves_arm_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_leaves_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_leaves_arm_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_leaves_diff_1k.png` → `hd2k/nature/island_tree_02/textures/island_tree_02_leaves_diff_2k.png` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_leaves_diff_2k.jpg
  Original alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/2k/island_tree_02/island_tree_02_leaves_alpha_2k.png
- `nature/island_tree_02/textures/island_tree_02_leaves_nor_gl_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_leaves_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_leaves_nor_gl_2k.jpg
- `nature/island_tree_02/textures/island_tree_02_nor_gl_1k.jpg` → `hd2k/nature/island_tree_02/textures/island_tree_02_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/island_tree_02/island_tree_02_nor_gl_2k.jpg
- `nature/rock_face_01/textures/rock_face_01_arm_1k.jpg` → `hd2k/nature/rock_face_01/textures/rock_face_01_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_face_01/rock_face_01_arm_2k.jpg
- `nature/rock_face_01/textures/rock_face_01_diff_1k.jpg` → `hd2k/nature/rock_face_01/textures/rock_face_01_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_face_01/rock_face_01_diff_2k.jpg
- `nature/rock_face_01/textures/rock_face_01_nor_gl_1k.jpg` → `hd2k/nature/rock_face_01/textures/rock_face_01_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_face_01/rock_face_01_nor_gl_2k.jpg
- `nature/rock_moss_set_01/textures/rock_moss_set_01_diff_1k.jpg` → `hd2k/nature/rock_moss_set_01/textures/rock_moss_set_01_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_moss_set_01/rock_moss_set_01_diff_2k.jpg
- `nature/rock_moss_set_01/textures/rock_moss_set_01_nor_gl_1k.jpg` → `hd2k/nature/rock_moss_set_01/textures/rock_moss_set_01_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_moss_set_01/rock_moss_set_01_nor_gl_2k.jpg
- `nature/rock_moss_set_01/textures/rock_moss_set_01_rough_1k.jpg` → `hd2k/nature/rock_moss_set_01/textures/rock_moss_set_01_rough_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/rock_moss_set_01/rock_moss_set_01_rough_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_arm_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_arm_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_branch_arm_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_branch_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_branch_arm_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_branch_diff_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_branch_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_branch_diff_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_branch_nor_gl_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_branch_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_branch_nor_gl_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_diff_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_diff_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_diff_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_leaves_arm_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_leaves_arm_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_leaves_arm_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_leaves_diff_1k.png` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_leaves_diff_2k.png` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_leaves_diff_2k.jpg
  Original alpha: https://dl.polyhaven.org/file/ph-assets/Models/png/2k/tree_small_02/tree_small_02_leaves_alpha_2k.png
- `nature/woodland_tree_03/textures/tree_small_02_leaves_nor_gl_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_leaves_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_leaves_nor_gl_2k.jpg
- `nature/woodland_tree_03/textures/tree_small_02_nor_gl_1k.jpg` → `hd2k/nature/woodland_tree_03/textures/tree_small_02_nor_gl_2k.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/tree_small_02/tree_small_02_nor_gl_2k.jpg
- `textures/forest-normal.jpg` → `hd2k/textures/forest-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_leaves_01/brown_mud_leaves_01_nor_gl_2k.jpg
- `textures/forest.jpg` → `hd2k/textures/forest.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/brown_mud_leaves_01/brown_mud_leaves_01_diff_2k.jpg
- `textures/grass-normal.jpg` → `hd2k/textures/grass-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_nor_gl_2k.jpg
- `textures/grass-rough.jpg` → `hd2k/textures/grass-rough.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_rough_2k.jpg
- `textures/grass.jpg` → `hd2k/textures/grass.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leafy_grass/leafy_grass_diff_2k.jpg
- `textures/ground-normal.jpg` → `hd2k/textures/ground-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rocky_trail/rocky_trail_nor_gl_2k.jpg
- `textures/ground.jpg` → `hd2k/textures/ground.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rocky_trail/rocky_trail_diff_2k.jpg
- `textures/metal-normal.jpg` → `hd2k/textures/metal-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/metal_plate/metal_plate_nor_gl_2k.jpg
- `textures/metal-rough.jpg` → `hd2k/textures/metal-rough.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/metal_plate/metal_plate_rough_2k.jpg
- `textures/rock-normal.jpg` → `hd2k/textures/rock-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_01/rock_01_nor_gl_2k.jpg
- `textures/rock.jpg` → `hd2k/textures/rock.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_01/rock_01_diff_2k.jpg
- `textures/roof-normal.jpg` → `hd2k/textures/roof-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grey_roof_tiles/grey_roof_tiles_nor_gl_2k.jpg
- `textures/roof-rough.jpg` → `hd2k/textures/roof-rough.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grey_roof_tiles/grey_roof_tiles_rough_2k.jpg
- `textures/roof.jpg` → `hd2k/textures/roof.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grey_roof_tiles/grey_roof_tiles_diff_2k.jpg
- `textures/wall-normal.jpg` → `hd2k/textures/wall-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/plaster_brick_01/plaster_brick_01_nor_gl_2k.jpg
- `textures/wall-rough.jpg` → `hd2k/textures/wall-rough.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/plaster_brick_01/plaster_brick_01_rough_2k.jpg
- `textures/wall.jpg` → `hd2k/textures/wall.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/plaster_brick_01/plaster_brick_01_diff_2k.jpg
- `textures/water-normal.jpg` → `hd2k/textures/water-normal.jpg` (2048×2048)
  Source: scripts/prepare-2k-nature.mjs: native periodic 2048px Fourier wave normal
- `textures/wood-normal.jpg` → `hd2k/textures/wood-normal.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_planks_dirt/wood_planks_dirt_nor_gl_2k.jpg
- `textures/wood-rough.jpg` → `hd2k/textures/wood-rough.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_planks_dirt/wood_planks_dirt_rough_2k.jpg
- `textures/wood.jpg` → `hd2k/textures/wood.jpg` (2048×2048)
  Source: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_planks_dirt/wood_planks_dirt_diff_2k.jpg
