# Authored GL-6 revolver launcher

Created for Wild Frontier. CC0-1.0. Geometry and small tiled finish maps are authored assets, not photogrammetry, a firearm scan, or manufacturer CAD. Reproduce with `node scripts/prepare-gl6.mjs`.

The model uses metres and a +Z muzzle convention. Length is approximately 0.83 m. Its six 40 mm drum chambers have open front faces and internal walls. The 40 mm barrel is an open tube with visible inner wall and separate muzzle collar. Polymer stock/grip and coated metal have separate base colour, roughness/metallic and micro-normal maps. The maps provide subtle authored microfinish, not claimed photographs.

`DRUM` is a rigid rotating group with a local +Z axis. `FX_FIRE`, `Muzzle`, `TRIGGER`, `FX_CASING` and `ATTACH_SCOPE` are attachment markers. The model does not include animation clips: firing/reload motion can rotate `DRUM` in the runtime. The main silhouette, screws, rail slots, open trigger guard, stock, cheek piece and ribbed foregrip remain separate geometric details, merged by material into eight draw calls.
