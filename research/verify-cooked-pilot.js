'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const pilotFile = path.join(root, 'tools/CookWorkspace/Saved/TrackBridge/kalinago-pilot-fc07c325ea3d4a62b8b71ec94ad1aaf8.json');
const decoded = path.join(__dirname, 'kalinago-cooked-decoded01');
const pilot = read(pilotFile);
const manifest = read(path.join(decoded, 'manifest.json'));
assert.equal(pilot.passed, true);
assert.equal(manifest.metadataOnly, false);
assert.equal(manifest.results.length, 1);
const result = manifest.results[0];
assert.equal(result.container, 'TrackBridge_Kalinago_Pilot_P.utoc');
assert.ok(!result.error);
const objects = read(path.join(decoded, result.output));
const meshes = objects.filter(o => o.Type === 'StaticMesh');
assert.equal(meshes.length, 1);
const mesh = meshes[0];
assert.equal(mesh.Package + '.' + mesh.Name, pilot.asset);
assert.equal(mesh.RenderData.LODs.length, 1);
const triangles = mesh.RenderData.LODs[0].Sections.reduce((sum, s) => sum + s.NumTriangles, 0);
assert.equal(triangles, pilot.triangles);
const bounds = mesh.RenderData.Bounds;
let maxBoundsErrorCm = 0;
for (const [i, axis] of ['X', 'Y', 'Z'].entries()) {
  maxBoundsErrorCm = Math.max(maxBoundsErrorCm,
    Math.abs(bounds.Origin[axis] - bounds.BoxExtent[axis] - pilot.boundsCm.min[i]),
    Math.abs(bounds.Origin[axis] + bounds.BoxExtent[axis] - pilot.boundsCm.max[i]));
}
assert.ok(maxBoundsErrorCm < 0.05, `Bounds error ${maxBoundsErrorCm} cm`);
const metadata = read(path.join(decoded, 'metadata', result.package + '.json'));
const mounted = new Set(read(path.join(decoded, 'files.json')).map(s => s.toLowerCase()));
const dependencies = metadata.dependencies.map(packageName => {
  assert.ok(packageName.startsWith('/Engine/'), 'Unexpected external dependency: ' + packageName);
  const file = 'Engine/Content/' + packageName.slice('/Engine/'.length) + '.uasset';
  assert.ok(mounted.has(file.toLowerCase()), 'Missing dependency: ' + file);
  return { packageName, file, present: true };
});
const packRoot = path.join(__dirname, 'kalinago-cooked-pack01');
const containers = fs.readdirSync(packRoot).sort().map(name => {
  const data = fs.readFileSync(path.join(packRoot, name));
  return { name, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
});
const report = { passed: true, installable: false, asset: pilot.asset, triangles, maxBoundsErrorCm,
  sourceContainer: result.container, dependencies, containers,
  limitations: ['Independent cooked mesh deserialization only; game loading not tested',
    'Default material; full materials and collision behavior not validated', 'No Kalinago race component installed'] };
fs.writeFileSync(path.join(__dirname, 'kalinago-cooked-verification01.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
