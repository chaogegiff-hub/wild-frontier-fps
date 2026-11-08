import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const files = fs.readdirSync(root, { recursive: true }).filter(f => fs.statSync(path.join(root, f)).isFile());
assert(fs.existsSync(path.join(root, 'index.html')), 'Missing game entry');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
  if (/^(https?:|data:|blob:)/.test(m[1])) continue;
  const target = m[1].split(/[?#]/)[0];
  assert(!target.startsWith('/'), `Absolute asset URL breaks project Pages: ${target}`);
  assert(fs.existsSync(path.join(root, target)), `Missing HTML dependency: ${target}`);
}
let meshes = 0, js = 0, references = 0;
for (const name of files) {
  const full = path.join(root, name);
  assert(fs.statSync(full).size < 100 * 1024 * 1024, `GitHub file limit exceeded: ${name}`);
  if (name.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    js++;
    for (const m of fs.readFileSync(full, 'utf8').matchAll(/(?:from\s*|import\s*\()['"](\.\.?\/[^'"\n]+)['"]/g)) {
      const target = m[1].split(/[?#]/)[0];
      assert(fs.existsSync(path.resolve(path.dirname(full), target)), `Missing module: ${name} -> ${target}`);
      references++;
    }
  }
  if (name.endsWith('.gltf')) {
    const model = JSON.parse(fs.readFileSync(full, 'utf8'));
    assert(model.meshes?.length, `Empty 3D model: ${name}`);
    for (const dep of [...(model.buffers || []), ...(model.images || [])]) {
      if (!dep.uri || dep.uri.startsWith('data:')) continue;
      assert(fs.existsSync(path.resolve(path.dirname(full), decodeURIComponent(dep.uri))), `Missing 3D dependency: ${name} -> ${dep.uri}`);
    }
    meshes++;
  }
}
assert(meshes >= 15, 'Expected the restored full model library');
for (const model of ['models/akm/model.gltf', 'models/m700/model.gltf', 'models/gl6/model.gltf', 'models/rocketbox-soldier/model.gltf', 'models/jeep/model.gltf']) {
  assert(fs.existsSync(path.join(root, model)), `Missing primary game model: ${model}`);
}
console.log(`PASS ${files.length} local files; ${meshes} 3D models; ${js} JavaScript modules; ${references} module references`);
console.log('PASS project Pages paths and full terrain, soldier, weapons and vehicle assets');
