'use strict';
const fs = require('fs'), path = require('path');
const { evaluate, parameterAtDistance } = require('../native-spline');
const dir = path.join(__dirname, 'bahrain_live04');
const snapshot = require('./bahrain_live04/snapshot.json');
const track = snapshot.tracks[0], count = track.raceCount;
const positions = track.nodes.map(n => n.position.map(v => v / 100));
const raw = fs.readFileSync(path.join(dir, 'track-0-nodes.bin'));
const mappings = require('./bahrain_schema01/race-component.json').Properties.m_pitLaneMapping;
const cache = new Map();
function at(node, distance) {
  if (!cache.has(node)) {
    const ids = node < count ? [(node + count - 1) % count, node, (node + 1) % count, (node + 2) % count] : [node - 1, node, node + 1, node + 2];
    const controls = ids.map(i => positions[i]);
    const knots = [0, ...[0x58, 0x5c, 0x60].map(offset => raw.readFloatLE(node * 0x98 + offset))];
    const bytes = fs.readFileSync(path.join(dir, `track-0-node-${node}-table8.bin`));
    const table = Array.from({length: bytes.length / 8}, (_, i) => ({distanceM: bytes.readFloatLE(i * 8), parameter: bytes.readFloatLE(i * 8 + 4)}));
    cache.set(node, { controls, knots, table });
  }
  const {controls, knots, table} = cache.get(node);
  if (distance > table.at(-1).distanceM + .01 || distance < 0) throw new Error('Mapping distance outside native table');
  const d = Math.min(distance, table.at(-1).distanceM);
  const t = parameterAtDistance(table, d, knots[1]).parameter;
  const point = evaluate(controls, t, knots);
  const before = evaluate(controls, Math.max(knots[1], t - .0001), knots);
  const after = evaluate(controls, Math.min(knots[2], t + .0001), knots);
  const tangent = after.map((v,i) => v - before[i]);
  return {point, tangent};
}
const rows = mappings.map((m, index) => {
  const pit = at(m.m_pitNodeID, m.m_pitSplineDistance), race = at(m.m_trackNodeID, m.m_trackRaceSplineDistance);
  const delta = pit.point.map((v,i) => v - race.point[i]);
  const xy = Math.hypot(delta[0], delta[1]);
  const signedLeft = (race.tangent[0]*delta[1] - race.tangent[1]*delta[0]) / Math.hypot(race.tangent[0], race.tangent[1]);
  return {index, recordedDistanceM:m.m_offTrackDistance, xyDistanceM:xy, distance3dM:Math.hypot(...delta), signedLeftM:signedLeft,
    xyErrorM:Math.abs(xy - m.m_offTrackDistance), lateralMagnitudeErrorM:Math.abs(Math.abs(signedLeft) - m.m_offTrackDistance), intersect:m.m_intersect};
});
const stats = name => {const a = rows.map(x => x[name]).sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
const report = {installable:false, source:'bahrain_live04 + serialized Bahrain component', entries:rows.length,
  xyErrorM:stats('xyErrorM'), lateralMagnitudeErrorM:stats('lateralMagnitudeErrorM'),
  recordedNegative:rows.filter(x=>x.recordedDistanceM<0).length,
  geometricNegative:rows.filter(x=>x.signedLeftM<-.01).length,
  geometricPositive:rows.filter(x=>x.signedLeftM>.01).length,
  limitations:['Pit mapping distance is a different field from car/grid m_offRaceLineDistance',
    'Unsigned magnitude evidence alone cannot establish lateral offset sign or intersect semantics'], rows};
fs.writeFileSync(path.join(__dirname,'bahrain-pit-mapping-geometry01.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined},null,2));
