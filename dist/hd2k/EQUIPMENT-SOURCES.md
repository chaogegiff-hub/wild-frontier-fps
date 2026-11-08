# Equipment texture sources and delivery

- **AKM**: LonesomeDucky, CC0. https://opengameart.org/content/weathered-akm-rifle . Reuse existing 2048px maps exported from author 4096px maps. Original UVs and PBR channels preserved.
- **M700**: Stein Games, CC0. https://stein-indie.itch.io/m700 . Author explicitly provides 2048px textures in Sniper_R700_Free_CC0.zip. Restore original T_SniperR700_C/N/MAOR PNGs, preserve atlas orientation, invert DirectX normal green, repack MAOR to glTF ORM exactly as the existing converter.
- **Military Male 03**: Microsoft / Rocketbox, MIT; original license in models/rocketbox-soldier/LICENSE.md. https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Military_Male_03/Textures . Original TGA maps: body/head/helmet 2048x2048, equipment 2048x1024, holstered pistol 1024x1024. Pistol maps remain 1024px and are explicitly native:false, never enlarged and labeled native 2K. Image orientation is checked against existing glTF maps before encoding.
- **GL6 / gloves finish maps**: newly authored original project CC0 procedural coating, molded polymer, textile fibres and leather pore fields at 2048x2048. They preserve the original model UVs and material types; these are authored surfaces, not photographs or scans. GL6 base and roughness/metallic calibration matches existing finish, with new independent fine detail. Cloth avoids hard checkerboard pattern; leather uses independent pore fields. Glove anatomy/source rights are unchanged.

27 mappings are listed in equipment-manifest.json: 25 native 2048px long-edge maps and two honest source-resolution 1024px small-prop maps. New RGB files use JPEG quality 93, chroma 4:4:4. Native OpenGL normals, UV orientation, original atlas aspect ratios and channel semantics are preserved. No model geometry, runtime or startup pack is changed by the preparation script. Reproduce with node scripts/prepare-2k-equipment.mjs /path/to/author-originals.

## V2.19 anatomical cloth gloves and swimming skin

The glove shell is now thin cotton over the para / MakeHuman CC0 hand topology,
with open cuffs, small seams and KHR_materials_sheen. No rubber or leather panels
remain. Existing native 2K cloth images retain their targets and content hashes;
the two leather mappings are retained but are not assigned to a glove material.
Swimming uses the original skin UVs and 1024x1024 skin.jpg from the same CC0 arms
asset, with smoothly blended wrist weights. This is authored human anatomy, not a
scanned or filmed person; the skin texture is not enlarged and labeled native 2K.

V2.20 uses the same bare anatomical arm mesh for weapons, swimming and vaulting.
Athletic contour sculpting is new CC0 work over the existing licensed anatomy.
The original 1024px skin UV texture is retained honestly; native 2K cloth maps
remain assigned to the gloves, not painted onto the bare arms.
