"""Convert the attributed Mapzen Terrarium tile into the game's relief grid.

Usage: python scripts/prepare-terrain.py INPUT.png [OUTPUT.js]
Source: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2194/1430.png
Dependencies: Pillow, NumPy, SciPy. Attribution: dist/ASSET-CREDITS.txt.
"""
import argparse
import base64
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("input", type=Path)
parser.add_argument("output", type=Path, nargs="?", default=Path(__file__).resolve().parents[1] / "dist/terrain-data.js")
args = parser.parse_args()
rgb = np.asarray(Image.open(args.input).convert("RGB"), dtype=np.float64)
height = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
minimum = float(height.min())
height = np.rot90(height, 2)
axis_y = np.linspace(0, height.shape[0] - 1, 129)
axis_x = np.linspace(0, height.shape[1] - 1, 129)
y, x = np.meshgrid(axis_y, axis_x, indexing="ij")
sampled = (map_coordinates(height, [y, x], order=1) - minimum) * 0.057
quantized = np.rint(sampled * 256)
if not np.isfinite(quantized).all() or quantized.min() < 0 or quantized.max() > 65535:
    raise ValueError("Relief exceeds unsigned 16-bit fixed-point range")
packed = base64.b64encode(quantized.astype(">u2").tobytes()).decode("ascii")
code = "// Scaled/rotated Mapzen Terrarium elevation data; source and attribution in ASSET-CREDITS.\n"
code += "const packed='" + packed + "';\n"
code += """const bytes=atob(packed),elevation=new Float32Array(129*129);
for(let i=0;i<elevation.length;i++)elevation[i]=(bytes.charCodeAt(i*2)*256+bytes.charCodeAt(i*2+1))/256;
export function terrainRelief(x,z){
 const u=Math.max(0,Math.min(127.9999,(x/640+.5)*128)),v=Math.max(0,Math.min(127.9999,(z/640+.5)*128));
 const ix=u|0,iz=v|0,fx=u-ix,fz=v-iz,i=iz*129+ix;
 return (elevation[i]*(1-fx)+elevation[i+1]*fx)*(1-fz)+(elevation[i+129]*(1-fx)+elevation[i+130]*fx)*fz;
}
"""
args.output.write_text(code, encoding="utf-8")
print(f"Wrote {args.output}: 129x129 samples, relief {sampled.min():.2f}–{sampled.max():.2f} m")
