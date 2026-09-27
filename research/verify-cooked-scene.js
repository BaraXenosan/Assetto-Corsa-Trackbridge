'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const scene = read(path.join(root, 'tools/CookWorkspace/Saved/TrackBridge/kalinago-scene-2b0d5b5e7e44432db837463ecc98aa91.json'));
const decoded = path.join(__dirname, 'kalinago-scene-decoded03');
const manifest = read(path.join(decoded, 'manifest.json'));
assert.equal(scene.passed, true);
assert.equal(manifest.readShaderMaps, true);
assert.equal(manifest.metadataOnly, false);
assert.equal(manifest.results.length, scene.meshes.length + scene.materials.length + scene.textures.length + 1);
const mounted = new Set(read(path.join(decoded, 'files.json')).map(x => x.toLowerCase()));
const packageFile = asset => 'F1Manager24/Content/' + asset.split('.')[0].slice(6);
const objects = new Map();
let dependenciesChecked = 0;
for (const entry of manifest.results) {
  assert.ok(!entry.error, entry.error);
  assert.equal(entry.container, 'TrackBridge_Kalinago_Scene_P.utoc');
  objects.set(entry.package, read(path.join(decoded, entry.output)));
  const meta = read(path.join(decoded, 'metadata', entry.package + '.json'));
  for (const dep of meta.dependencies) {
    assert.ok(dep, 'Unresolved dependency');
    let file;
    if (dep.startsWith('/Game/')) file = packageFile(dep);
    else if (dep.startsWith('/Engine/')) file = 'Engine/Content/' + dep.slice(8);
    else throw new Error('Unexpected dependency root ' + dep);
    assert.ok(mounted.has((file + '.uasset').toLowerCase()) || mounted.has((file + '.umap').toLowerCase()), 'Missing dependency ' + dep);
    dependenciesChecked++;
  }
}
const get = (asset, type, extension='.uasset') => {
  const found = objects.get(packageFile(asset) + extension).filter(o => o.Type === type);
  assert.equal(found.length, 1, asset);
  return found[0];
};
let triangles = 0, shaderMaps = 0, shaderEntries = 0, maxBoundsErrorCm = 0;
for (const expected of scene.meshes) {
  const mesh = get(expected.asset, 'StaticMesh');
  assert.equal(mesh.RenderData.LODs.length, 1);
  const count = mesh.RenderData.LODs[0].Sections.reduce((sum, s) => sum + s.NumTriangles, 0);
  assert.equal(count, expected.triangles);
  triangles += count;
  const bounds = mesh.RenderData.Bounds;
  for (const [i, axis] of ['X','Y','Z'].entries()) {
    maxBoundsErrorCm = Math.max(maxBoundsErrorCm,
      Math.abs(bounds.Origin[axis] - bounds.BoxExtent[axis] - expected.staging.sourceBoundsCm.min[i]),
      Math.abs(bounds.Origin[axis] + bounds.BoxExtent[axis] - expected.staging.sourceBoundsCm.max[i]));
  }
  const slots = mesh.Properties.StaticMaterials;
  assert.equal(slots.length, expected.materials.length);
  for (const assignment of expected.materials) {
    assert.equal(slots[assignment.index].MaterialInterface.ObjectPath.split('.')[0], assignment.asset.split('.')[0]);
  }
}
assert.ok(maxBoundsErrorCm < .1);
for (const expected of scene.materials) {
  const mat = get(expected.asset, 'Material');
  assert.ok(mat.LoadedMaterialResources.length > 0, 'No shader resource: ' + expected.asset);
  for (const resource of mat.LoadedMaterialResources) {
    const map = resource.LoadedShaderMap;
    assert.equal(map.ShaderPlatform, 'SP_PCD3D_SM5');
    assert.ok(map.Code?.ShaderEntries?.length > 0, 'Missing inline shader code');
    assert.equal(map.Code.ShaderEntries.length, map.Code.ShaderHashes.length);
    assert.ok(map.Code.ShaderEntries.every(e => typeof e.Code === 'string' && e.Code.length > 0));
    shaderMaps++; shaderEntries += map.Code.ShaderEntries.length;
  }
}
const textures = read(path.join(__dirname, 'kalinago-textures01/texture-manifest.json')).textures;
for (const expected of scene.textures) {
  const tex = get(expected.asset, 'Texture2D');
  const source = textures.find(t => t.sourceSha256 === expected.sourceSha256);
  assert.equal(tex.SizeX, source.width);
  assert.equal(tex.SizeY, source.height);
  assert.ok(tex.Mips.length > 0);
}
const levelObjects = objects.get(packageFile(scene.level) + '.umap');
assert.equal(levelObjects.filter(x => x.Type === 'StaticMeshActor').length, scene.meshes.length);
const components = levelObjects.filter(x => x.Type === 'StaticMeshComponent');
assert.equal(components.length, scene.meshes.length);
assert.deepEqual(components.map(x => x.Properties.StaticMesh.ObjectPath.split('.')[0]).sort(), scene.meshes.map(x => x.asset.split('.')[0]).sort());
const pack = path.join(__dirname, 'kalinago-scene-pack02');
const containers = fs.readdirSync(pack).sort().map(name => {
  const data = fs.readFileSync(path.join(pack, name));
  return { name, bytes:data.length, sha256:crypto.createHash('sha256').update(data).digest('hex') };
});
const report = {passed:true, installable:false, packages:manifest.results.length, meshes:scene.meshes.length,
  triangles, materials:scene.materials.length, textures:scene.textures.length, maxBoundsErrorCm,
  shaderMaps, shaderEntries, dependenciesChecked, containers,
  limitations:['CUE4Parse validation, not rendering in the game', 'Visual prototype has no RaceSim component',
    'No Kalinago weekend or race validation; collision, advanced materials and cameras incomplete']};
fs.writeFileSync(path.join(__dirname, 'kalinago-scene-verification01.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
