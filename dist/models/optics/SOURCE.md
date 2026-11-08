# Standalone modeled scope

Source: https://3dassets.dev/assets/mega-weapon-pack-bolt-sniper-chassis-scoped-891e227c

License: CC0 1.0 Universal. Extracted from the game's existing `source-assets/legacy/models/sniper.glb` in the source repository, which is documented in `ASSET-CREDITS.txt`.

Only the scope geometry above the source rifle's receiver is retained. The shape is simplified with meshoptimizer and the four original material groups are preserved. This package is approximately 249 KB, with 3,798 triangles. The scope's axis follows +Z. Its mount base sits at Y=0, so the root may be positioned at the M700 `ATTACH_SCOPE` marker without further scaling. The body is approximately 40 cm long, 7 cm wide and 9.6 cm tall. `OpticalAxis` marks the eye line, 5.2 cm above the attachment plane. Magnification is implemented by the game camera.

Reproduce with `node scripts/extract-scope.mjs`. Three.js helpers use `dist/vendor/LICENSE`; the meshoptimizer helper uses `scripts/vendor/meshoptimizer-LICENSE.md`.
