'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {parseHeader, inspect} = require('../inspect-game.js');
const b = Buffer.alloc(144);
b.write('-==--==--==--==-'); b[16] = 5;
b.writeUInt32LE(144, 20); b.writeUInt32LE(2, 52); b[80] = 11;
assert.equal(parseHeader(b, 144).encrypted, true);
assert.throws(() => parseHeader(b.subarray(0, 80), 80), /Truncated/);
assert.throws(() => parseHeader(Buffer.alloc(144), 144), /magic/);
const future = Buffer.from(b); future[16] = 255;
assert.throws(() => parseHeader(future, 144), /Unsupported/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trackbridge-inspect-'));
try {
  fs.writeFileSync(path.join(root, 'test.utoc'), b);
  fs.writeFileSync(path.join(root, 'test.ucas'), 'fixture');
  let r = inspect(root);
  assert.deepEqual(r.issues, ['Missing partition: test_s1.ucas']);
  fs.writeFileSync(path.join(root, 'test_s1.ucas'), 'fixture');
  r = inspect(root);
  assert.equal(r.issues.length, 0);
  assert.equal(r.engineVersion, null);
  assert.equal(r.installable, false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'test.utoc')), b);
  console.log('8 inspector assertions passed');
} finally {
  for (const file of ['test.utoc', 'test.ucas', 'test_s1.ucas']) {
    const target = path.join(root, file);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  fs.rmdirSync(root);
}
