'use strict';
// Geometry preparation only. FTrackPosition uses the native game's spline,
// so polyline distances must never be silently written as m_splineDistance.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const mod = (x,n) => ((x % n) + n) % n;
function readCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.shift() !== 'index,x,y,z,source_distance_m,source_id') throw Error('Unexpected CSV schema');
  const result = rows.map((row,i) => {
    const fields = row.split(',');
    if (fields.length !== 6 || fields.some(x => x.trim() === '')) throw Error('Invalid CSV row '+i);
    const v = fields.map(Number);
    if (!v.every(Number.isFinite) || v[0] !== i || !Number.isInteger(v[5])) throw Error('Invalid CSV values '+i);
    return {positionCm:v.slice(1,4),sourceDistanceM:v[4],sourceId:v[5]};
  });
  if (result.length < 2) throw Error('Line requires at least two points');
  for(let i=1;i<result.length;i++) if(result[i].sourceDistanceM < result[i-1].sourceDistanceM) throw Error('Non-monotonic source distance');
  return result;
}
function makeLine(points,closed) {
  const segments=[], cumulative=[0];
  for(let i=0;i<points.length-(closed?0:1);i++) {
    const a=points[i].positionCm, b=points[(i+1)%points.length].positionCm;
    const delta=b.map((v,k)=>v-a[k]), lengthM=Math.hypot(...delta)/100;
    if(lengthM <= 1e-8) throw Error('Duplicate consecutive line points');
    segments.push({a,b,delta,lengthM}); cumulative.push(cumulative.at(-1)+lengthM);
  }
  return {points,closed,segments,cumulative,lengthM:cumulative.at(-1)};
}
function project(line,p) {
  let best;
  line.segments.forEach((s,i)=>{
    const den=s.delta.reduce((v,x)=>v+x*x,0);
    const t=Math.max(0,Math.min(1,s.delta.reduce((v,x,k)=>v+(p[k]-s.a[k])*x,0)/den));
    const q=s.a.map((v,k)=>v+t*s.delta[k]), distanceM=Math.hypot(...p.map((v,k)=>v-q[k]))/100;
    if(!best || distanceM<best.distanceM) best={segment:i,t,positionCm:q,distanceM,chainageM:line.cumulative[i]+t*s.lengthM};
  });
  return best;
}
function transform(p,t) {
  if(t.axisMap !== 'x,z,y' || t.scale !== 100 || t.yaw !== 0) throw Error('Adapter currently requires the verified x,z,y; scale 100; yaw 0 export');
  return [p[0]*100,p[2]*100,p[1]*100];
}
function cross(a,b) {return a[0]*b[1]-a[1]*b[0];}
function gateCrossings(line,left,right) {
  const r=right.map((v,k)=>v-left[k]), hits=[];
  line.segments.forEach((s,i)=>{
    const den=cross(s.delta,r); if(Math.abs(den)<1e-8)return;
    const q=left.map((v,k)=>v-s.a[k]);
    const t=cross(q,r)/den, u=cross(q,s.delta)/den;
    if(t>=0 && t<1 && u>=0 && u<=1) {
      const positionCm=s.a.map((v,k)=>v+t*s.delta[k]);
      const gateZ=left[2]+u*r[2];
      // Reject unrelated crossings of bridges at another height.
      if(Math.abs(positionCm[2]-gateZ)>500)return;
      hits.push({segment:i,t,gateFraction:u,positionCm,heightDifferenceM:(positionCm[2]-gateZ)/100,chainageM:line.cumulative[i]+s.lengthM*t});
    }
  });
  return hits;
}
function adapt(projectData,racePoints,pitPoints,calibration=null) {
  if(calibration && (calibration.curve!=='centripetal Catmull-Rom, alpha=0.5' || calibration.evidence?.inverseReferences!==55 || calibration.evidence.maxInverseParameterError>=1e-6 || calibration.evidence.maxArcErrorM>=.005)) throw Error('Unrecognized or failed native calibration');
  if(!['centimetres','centimeters','cm'].includes(projectData.coordinateUnits)) throw Error('Expected centimetre CSV coordinates');
  const race=makeLine(racePoints,true),pit=makeLine(pitPoints,false);
  const gates=projectData.timingGates.map(g=>{
    const hits=gateCrossings(race,transform(g.left,projectData.transform),transform(g.right,projectData.transform));
    if(hits.length!==1)throw Error('Timing gate '+g.index+' must cross race line exactly once, found '+hits.length);
    return {index:g.index,...hits[0]};
  }).sort((a,b)=>a.index-b.index);
  if(gates.length!==3 || gates.some((g,i)=>g.index!==i))throw Error('Expected gates 0, 1 and 2');
  const origin=gates[0].chainageM;
  gates.forEach(g=>g.lapDistanceM=mod(g.chainageM-origin,race.lengthM));
  if(!(gates[1].lapDistanceM<gates[2].lapDistanceM))throw Error('Sector order disagrees with AI direction');
  const markers=projectData.markers.filter(m=>/^AC_(START|PIT)_\d+$/.test(m.name)).map(m=>{
    const positionCm=transform(m.position,projectData.transform),line=m.name.startsWith('AC_PIT_')?pit:race;
    return {name:m.name,positionCm,line:line===pit?'pit':'race',projection:project(line,positionCm)};
  });
  const pitEntry=project(race,pitPoints[0].positionCm),pitExit=project(race,pitPoints.at(-1).positionCm);
  const directionDot=(p,atEnd)=>{
    const a=race.segments[p.segment].delta,b=pit.segments[atEnd?pit.segments.length-1:0].delta;
    return a.reduce((s,v,k)=>s+v*b[k],0)/Math.hypot(...a)/Math.hypot(...b);
  };
  return {schemaVersion:1,targetSlot:'Bahrain',installable:false,status:'geometry-preparation',
    units:{positions:'cm',polylineDistances:'m',nativeSplineDistances:calibration?'m from start of native segment':'unverified'},transform:projectData.transform,
    nativeCurve:calibration?{type:calibration.curve,buildSha256:calibration.buildSha256,calibrationSource:calibration.source,sourceSamplesAreNotFinalNativeNodes:true}:null,
    race:{closed:true,pointCount:racePoints.length,polylineLengthM:race.lengthM,originSourceChainageM:origin,
      nodes:racePoints.map((p,i)=>({sourceIndex:i,m_pos:{X:p.positionCm[0],Y:p.positionCm[1],Z:p.positionCm[2]},lapDistanceM:mod(race.cumulative[i]-origin,race.lengthM)}))},
    pit:{closed:false,pointCount:pitPoints.length,polylineLengthM:pit.lengthM,entryProjection:pitEntry,exitProjection:pitExit,
      entryDirectionDot:directionDot(pitEntry,false),exitDirectionDot:directionDot(pitExit,true),
      nodes:pitPoints.map(p=>({m_pos:{X:p.positionCm[0],Y:p.positionCm[1],Z:p.positionCm[2]}}))},
    timingGates:gates,markers,
    drs:projectData.drs.map(z=>({name:z.name,sourceNormalized:{detection:z.detection,start:z.start,end:z.end},wrapsStartFinish:z.wrapsStartFinish,status:'AC normalization origin/parameterization requires confirmation'})),
    targetFieldMap:{raceAndPitPositions:'m_trackNodes[].m_pos',grid:'m_carStartPositions',pitStops:'m_pitStopPositions',sectors:'m_sectorCheckpoints',drs:['m_DRSDetection','m_DRSZoneStart','m_DRSZoneEnd']},
    checks:{csvUnits:true,transform:true,uniqueTimingCrossings:true,forwardSectorOrder:true,sourceOrderPreserved:true},
    blockers:[calibration?'Native control-node reduction, table sampling and lateral-offset sign still require validation':'Native spline interpolation and distance units not calibrated','Pit endpoint and ghost-node semantics not verified','Speed, corner, edge, incident and barrier generation incomplete','AC DRS normalization not calibrated','Kalinago visual/collision assets not cooked','Weekend and race not tested']};
}
module.exports={readCsv,makeLine,project,transform,gateCrossings,adapt};
if(require.main===module){
  const [input,out,calibrationFile]=process.argv.slice(2);
  if(!input||!out||fs.existsSync(out))throw Error('Usage: node race-adapter.js EXPORT_DIRECTORY NEW_OUTPUT.json [NATIVE_CALIBRATION.json]');
  const files=['trackbridge-project.json','lines/fast_lane.ai.csv','lines/pit_lane.ai.csv'];
  const bytes=files.map(f=>fs.readFileSync(path.join(input,f)));
  const calibrationBytes=calibrationFile?fs.readFileSync(calibrationFile):null;
  const result=adapt(JSON.parse(bytes[0]),readCsv(bytes[1].toString()),readCsv(bytes[2].toString()),calibrationBytes?JSON.parse(calibrationBytes):null);
  if(calibrationBytes)result.calibration={path:path.resolve(calibrationFile),sha256:crypto.createHash('sha256').update(calibrationBytes).digest('hex')};
  result.sources=files.map((f,i)=>({path:path.resolve(input,f),sha256:crypto.createHash('sha256').update(bytes[i]).digest('hex')}));
  fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify({installable:result.installable,raceLengthM:result.race.polylineLengthM,pitLengthM:result.pit.polylineLengthM,gates:result.timingGates.map(g=>({index:g.index,lapDistanceM:g.lapDistanceM})),pitEntryDistanceM:result.pit.entryProjection.distanceM,pitExitDistanceM:result.pit.exitProjection.distanceM}));
}
