'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {analyze} = require('../research/analyze-race-component.js');
const filename = path.join(__dirname,'../research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json');
const objects = JSON.parse(fs.readFileSync(filename));
assert.equal(analyze(objects).checks.positionReferences,1484);
function broken(edit,pattern) {
  const copy=structuredClone(objects);
  edit(copy.find(x=>x.Type==='RaceSimTrackComponent').Properties);
  assert.throws(()=>analyze(copy),pattern);
}
broken(p=>p.m_trackNodesCount++,/counts disagree/);
broken(p=>p.m_trackNodes[0].m_pos.X=Infinity,/Nonfinite/);
broken(p=>p.m_trackNodes[0].m_previousEdgeID=p.m_trackEdges.length,/Invalid reference/);
broken(p=>p.m_carStartPositions[0].m_trackNodeID=p.m_trackNodes.length,/Invalid reference/);
broken(p=>p.m_DRSDetection.pop(),/DRS counts/);
console.log('6 schema checks passed (real Bahrain and deliberately corrupted copies)');
