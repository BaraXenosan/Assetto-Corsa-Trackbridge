'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || '');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const files = JSON.parse(fs.readFileSync(path.join(root, 'files.json')));
const result = {installable: false, propertiesDecoded: false, files: files.length, packages: [], missingDependencies: []};
const toAsset = name => {
  if (!name?.startsWith('/Game/')) return null;
  const base = 'F1Manager24/Content/' + name.slice(6);
  return files.find(f => f.toLowerCase() === (base + '.umap').toLowerCase() || f.toLowerCase() === (base + '.uasset').toLowerCase()) || null;
};
for (const entry of manifest.results) {
  if (entry.error) throw Error(entry.error);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'metadata', entry.package + '.json')));
  const hashes = JSON.parse(fs.readFileSync(path.join(root, 'hashes', entry.package + '.json')));
  for (const h of hashes) {
    const rawPath = path.resolve(root, 'raw', h.path);
    if (!rawPath.startsWith(root + path.sep)) throw Error('Unsafe raw path');
    const bytes = fs.readFileSync(rawPath);
    if (bytes.length !== h.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== h.sha256) throw Error('Hash mismatch: ' + h.path);
  }
  const dependencies = meta.dependencies.map(name => ({name, package: toAsset(name)}));
  result.missingDependencies.push(...dependencies.filter(d => !d.package));
  result.packages.push({package: entry.package, exportCount: meta.exports.length,
    focusObjects: meta.exports.filter(e => /RaceSimTrackActor|RaceSimTrackComponent|RaceTrackDataAsset|TrackDataGenerationConfig/.test(e.type || '')).map(e => ({...e, objectPath: e.outer ? e.outer + '.' + e.name : meta.Name + '.' + e.name})),
    dependencies, hashes});
}
if (files.length !== new Set(files.map(f => f.toLowerCase())).size) throw Error('Duplicate paths');
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({packages: result.packages.length, uniqueFiles: files.length, missingDependencies: result.missingDependencies.length, verifiedRawHashes: result.packages.reduce((n,p)=>n+p.hashes.length,0)}));
