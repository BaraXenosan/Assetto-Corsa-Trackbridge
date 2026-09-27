'use strict';
const fs=require('fs'),path=require('path');
const p=require('./bahrain_schema01/race-component.json').Properties;
const raw=fs.readFileSync(path.join(__dirname,'bahrain_live04/track-0-nodes.bin'));
const starts=[0];for(let i=0;i<p.m_trackNodesCount;i++)starts.push(starts.at(-1)+raw.readFloatLE(i*152+0x68));
const total=starts.at(-1);
const edges=p.m_trackEdges.slice(0,p.m_lastRaceTrackEdgeID+1).map(e=>({...e,chainage:starts[e.m_trackNodeID]+e.m_splineDistance})).sort((a,b)=>a.chainage-b.chainage);
function widthAt(node,d,key){let s=starts[node]+d;let hi=edges.findIndex(e=>e.chainage>s);if(hi<0)hi=0;let lo=(hi+edges.length-1)%edges.length;let a=edges[lo].chainage,b=edges[hi].chainage;if(b<a)b+=total;if(s<a)s+=total;const f=(s-a)/(b-a);return edges[lo].m_edgeData[key]*(1-f)+edges[hi].m_edgeData[key]*f;}
const hypotheses=['m_insideEdge','m_outsideEdge'].map(key=>{let errors=0,nearBoundary=0;for(const m of p.m_pitLaneMapping){const width=widthAt(m.m_trackNodeID,m.m_trackRaceSplineDistance,key);if(Math.abs(m.m_offTrackDistance-width)<.1)nearBoundary++;if((m.m_offTrackDistance<=width)!==m.m_intersect)errors++;}return{positiveLeftWidth:key,classificationErrors:errors,nearBoundary};});
const pitStarts=new Map();let pitLength=0;for(let i=p.m_trackNodesCount;i<p.m_trackNodes.length;i++){pitStarts.set(i,pitLength);pitLength+=raw.readFloatLE(i*152+0x68);}
const pitEdges=p.m_trackEdges.slice(p.m_lastRaceTrackEdgeID+1).map(e=>({...e,chainage:pitStarts.get(e.m_trackNodeID)+e.m_splineDistance})).sort((a,b)=>a.chainage-b.chainage);
function pitWidthAt(node,d,key){const s=pitStarts.get(node)+d;let hi=pitEdges.findIndex(e=>e.chainage>s);if(hi<0)return pitEdges.at(-1).m_edgeData[key];if(hi===0)return pitEdges[0].m_edgeData[key];const a=pitEdges[hi-1],b=pitEdges[hi],f=(s-a.chainage)/(b.chainage-a.chainage);return a.m_edgeData[key]*(1-f)+b.m_edgeData[key]*f;}
for(const key of ['m_insideEdge','m_outsideEdge']){let errors=0;for(const m of p.m_pitLaneMapping){const width=widthAt(m.m_trackNodeID,m.m_trackRaceSplineDistance,key)+pitWidthAt(m.m_pitNodeID,m.m_pitSplineDistance,key==='m_insideEdge'?'m_outsideEdge':'m_insideEdge');if((m.m_offTrackDistance<=width)!==m.m_intersect)errors++;}hypotheses.push({positiveLeftWidth:key,rule:'road and pit corridors overlap',classificationErrors:errors});}
const result={installable:false,entries:p.m_pitLaneMapping.length,hypotheses,limitations:['Tests whether serialized pit-road overlap is consistent with positive-left edge widths','Does not prove off-track surface classifications']};
fs.writeFileSync(path.join(__dirname,'edge-side-verification01.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
