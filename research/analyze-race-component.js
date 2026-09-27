'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function analyze(objects) {
  const components = objects.filter(o => o.Type === 'RaceSimTrackComponent');
  if (components.length !== 1) throw Error('Expected exactly one RaceSimTrackComponent');
  const component = components[0], p = component.Properties;
  const nodes = p.m_trackNodes, edges = p.m_trackEdges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw Error('Missing node/edge arrays');
  const checkIndex = (value, length, field) => {
    if (!Number.isInteger(value) || value < 0 || value >= length) throw Error('Invalid reference: ' + field);
  };
  if (nodes.length !== p.m_trackNodesCount + p.m_pitNodesCount) throw Error('Node counts disagree');
  for (const [i, n] of nodes.entries()) {
    for (const axis of ['X','Y','Z']) if (!Number.isFinite(n.m_pos?.[axis])) throw Error('Nonfinite node ' + i);
    checkIndex(n.m_previousEdgeID, edges.length, 'm_previousEdgeID at node ' + i);
  }
  let positionReferences = 0;
  function visit(value, at) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'm_trackNodeID')) {
      checkIndex(value.m_trackNodeID, nodes.length, at + '.m_trackNodeID');
      positionReferences++;
    }
    if (Object.hasOwn(value, 'm_pitNodeID')) checkIndex(value.m_pitNodeID, nodes.length, at + '.m_pitNodeID');
    for (const [k, v] of Object.entries(value)) visit(v, at + '.' + k);
  }
  visit(p, 'Properties');
  for (const field of ['m_finishLineNodeID','m_startLineNodeID','m_pitEntrance_RaceTrackNodeID','m_pitExit_RaceTrackNodeID']) checkIndex(p[field], p.m_trackNodesCount, field);
  checkIndex(p.m_pitLoopNodeID, nodes.length, 'm_pitLoopNodeID');
  checkIndex(p.m_lastRaceTrackEdgeID, edges.length, 'm_lastRaceTrackEdgeID');
  if (p.m_DRSDetection.length !== p.m_DRSZoneStart.length || p.m_DRSDetection.length !== p.m_DRSZoneEnd.length) throw Error('DRS counts disagree');
  let chordLength = 0;
  for (let i=0;i<p.m_trackNodesCount;i++) {
    const a = nodes[i].m_pos, b = nodes[(i+1)%p.m_trackNodesCount].m_pos;
    chordLength += Math.hypot(a.X-b.X, a.Y-b.Y, a.Z-b.Z);
  }
  return {installable:false, componentName:component.Name, componentClass:'/Script/RaceSim.RaceSimTrackComponent',
    counts:{raceNodes:p.m_trackNodesCount,pitNodes:p.m_pitNodesCount,edges:edges.length,
      grid:p.m_carStartPositions.length,garages:p.m_garagePositions.length,pitStops:p.m_pitStopPositions.length,
      drsZones:p.m_DRSDetection.length,sectorCheckpoints:p.m_sectorCheckpoints.length,
      marshalCheckpoints:p.m_marshalSectorCheckpoints.length,pitLaneMappings:p.m_pitLaneMapping.length},
    references:{finishNode:p.m_finishLineNodeID,startNode:p.m_startLineNodeID,pitEntryRaceNode:p.m_pitEntrance_RaceTrackNodeID,
      pitExitRaceNode:p.m_pitExit_RaceTrackNodeID,pitLoopNode:p.m_pitLoopNodeID,lastRaceEdge:p.m_lastRaceTrackEdgeID},
    checks:{nodeCounts:true,nodeReferences:true,previousEdgeReferences:true,drsCounts:true,positionReferences},
    geometry:{raceClosedChordLengthInStoredUnits:chordLength,metresIfCentimetres:chordLength/100,
      note:'Chord sum is not the game spline length. Spatial scale and spline-distance units must be verified separately.'},
    fieldShapes:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Array.isArray(v)?{kind:'array',count:v.length,example:v[0] && k!=='BarrierSplines'?v[0]:undefined}:{kind:typeof v}])),
    unresolved:['Spline interpolation and distance parameterization','Pit attachment and loop semantics','Speed/corner/edge generation for the new layout','Incident and barrier regeneration','Cooked asset writing, level assembly and in-game validation']};
}
module.exports = {analyze};
if (require.main === module) {
  const [input,out] = process.argv.slice(2);
  if (!input || !out || fs.existsSync(out)) throw Error('Usage: node analyze-race-component.js LEVEL.json NEW_OUTPUT_DIRECTORY');
  const bytes = fs.readFileSync(input), objects = JSON.parse(bytes), report = analyze(objects);
  report.source = path.resolve(input);
  report.sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'race-component.json'),JSON.stringify(objects.find(o=>o.Type==='RaceSimTrackComponent'),null,2));
  fs.writeFileSync(path.join(out,'schema-audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({counts:report.counts,references:report.references,checks:report.checks}));
}
