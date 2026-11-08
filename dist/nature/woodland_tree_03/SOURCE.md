# Original individual leaf woodland tree

Source: https://polyhaven.com/a/tree_small_02

Author: Rico Cilliers

License: CC0-1.0 — https://polyhaven.com/license

The original tree's separate 3D leaf/twig islands are fitted individually to their own UV planes and original UV bounds, retaining their original spatial positions/orientations and full photographic alpha outlines. These individual leaf surfaces replace the fine curved tessellation of the source; no large crossed-photo-cluster crowns are used. The high LOD retains every original leaf/twig island. The middle LOD deterministically samples individual leaves while retaining every occupied 32 cm canopy voxel. This is an authored game LOD of a CC0 model, not a newly scanned tree.

Original photographic leaf albedo uses the original 16-bit alpha divided by 257, stored RGBA at 1024px with transparent RGB edge dilation to prevent dark mip halos. Bark albedo remains 1024px; normal/ARM maps are 512px. The source's UV transforms and all material-used UV sets are preserved; only the unused leaf second UV channel is omitted. Grounded at Y=0 with the original crown centered on X/Z. The existing eight-view woodland_tree_02 far atlas was baked from this exact original model and coordinate convention.

Reproduce: node scripts/prepare-full-leaf-tree.mjs /path/to/original-tree-small-02

Exact triangle counts, source checksum, original leaf counts and dimensions: conversion.json.
