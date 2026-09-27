#!/usr/bin/env node
'use strict';
// Header layout: CUE4Parse/UE4/IO/Objects/FIoStoreTocHeader.cs (versions 1–5).
const fs = require('node:fs');
const path = require('node:path');

function parseHeader(b, fileSize) {
  if (b.length < 144) throw Error('Truncated IoStore header');
  if (b.subarray(0, 16).toString('ascii') !== '-==--==--==--==-') throw Error('Invalid IoStore magic');
  const version = b[16];
  if (version < 1 || version > 5) throw Error('Unsupported IoStore version: ' + version);
  const headerSize = b.readUInt32LE(20);
  if (headerSize < 144 || headerSize > fileSize) throw Error('Invalid header size');
  const flags = b[80];
  const partitionCount = version >= 3 ? b.readUInt32LE(52) : 1;
  if (partitionCount < 1 || partitionCount > 10000) throw Error('Invalid partition count');
  return {
    version, headerSize, entries: b.readUInt32LE(24),
    compressedBlocks: b.readUInt32LE(28),
    directoryIndexBytes: b.readUInt32LE(48), partitionCount,
    encrypted: !!(flags & 2), compressed: !!(flags & 1),
    signed: !!(flags & 4), indexed: !!(flags & 8),
    containerIdHex: b.subarray(56, 64).toString('hex'),
    encryptionKeyGuidRawHex: b.subarray(64, 80).toString('hex')
  };
}

function inspect(root) {
  root = path.resolve(root);
  const files = fs.readdirSync(root, {withFileTypes: true}).filter(x => x.isFile()).map(x => x.name).sort();
  const containers = files.filter(x => /\.utoc$/i.test(x)).map(name => {
    const result = {file: name, bytes: fs.statSync(path.join(root, name)).size};
    try {
      const fd = fs.openSync(path.join(root, name), 'r');
      const b = Buffer.alloc(144);
      let count;
      try { count = fs.readSync(fd, b, 0, b.length, 0); } finally { fs.closeSync(fd); }
      Object.assign(result, parseHeader(b.subarray(0, count), result.bytes));
      const stem = name.slice(0, -5);
      result.partitions = Array.from({length: result.partitionCount}, (_, i) => {
        const file = stem + (i ? '_s' + i : '') + '.ucas';
        const present = files.includes(file);
        return {file, present, bytes: present ? fs.statSync(path.join(root, file)).size : null};
      });
    } catch (e) { result.error = e.message; }
    return result;
  });
  const issues = [];
  if (!containers.length) issues.push('No IoStore containers found');
  for (const c of containers) {
    if (c.error) issues.push(c.file + ': ' + c.error);
    for (const p of c.partitions || []) if (!p.present) issues.push('Missing partition: ' + p.file);
  }
  return {
    schemaVersion: 1, target: 'F1 Manager 2024', installable: false,
    inspectedAt: new Date().toISOString(), paksDirectory: root,
    scope: 'Top-level container headers only; assets and dependencies have not been extracted or validated.',
    engineVersion: null,
    containers,
    pakFiles: files.filter(x => /\.pak$/i.test(x)).map(file => ({file, bytes: fs.statSync(path.join(root, file)).size})),
    summary: {containers: containers.length, encrypted: containers.filter(x => x.encrypted).length, issues: issues.length},
    issues,
    nextSteps: [
      'Open the game Paks directory in FModel; configure the game version and key using verified settings for this installation.',
      'Locate the chosen track level and export its asset listing, property JSON and referenced dependencies.',
      'Identify race paths, pit entry/exit, sectors, grid, DRS and their game classes from exported assets.',
      'Implement an adapter against those verified structures, then cook, package and test in game.'
    ]
  };
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--paks', '--out'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw Error('Usage: node inspect-game.js --paks PAKS_DIRECTORY [--out NEW_REPORT.json]');
    }
    options[key] = argv[++i];
  }
  if (!options['--paks']) throw Error('--paks is required');
  const report = inspect(options['--paks']);
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options['--out']) fs.writeFileSync(path.resolve(options['--out']), json, {flag: 'wx'});
  else process.stdout.write(json);
  if (report.issues.length) process.exitCode = 2;
}
module.exports = {parseHeader, inspect};
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
