'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {distance,knots,evaluate,parameterAtDistance}=require('../native-spline');
const dir=path.join(__dirname,'bahrain_live04');
const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json')));
assert.equal(snapshot.world,'/Game/Circuits/Bahrain/Lvl_Bahrain.Lvl_Bahrain');
assert.equal(snapshot.errors,0);assert.equal(snapshot.tracks.length,1);
const raw=fs.readFileSync(path.join(dir,'track-0-nodes.bin')),track=snapshot.tracks[0];
const p=track.nodes.map(n=>n.position.map(v=>v/100));
let positionScaleError=0,maxKnotError=0,maxArcError=0,maxEndpointError=0;
let totalRaceLengthM=0,tableEntries=0;const segments=[];
for(let i=0;i<p.length;i++){
  const o=i*0x98;
  for(let a=0;a<3;a++)positionScaleError=Math.max(positionScaleError,Math.abs(p[i][a]-raw.readDoubleLE(o+0x30+a*8)));
  const count=raw.readInt32LE(o+0x50);if(!count)continue;
  const ids=i<track.raceCount?[(i+track.raceCount-1)%track.raceCount,i,(i+1)%track.raceCount,(i+2)%track.raceCount]:[i-1,i,i+1,i+2];
  const controls=ids.map(j=>p[j]),computedKnots=knots(controls),cachedKnots=[0,...[0x58,0x5c,0x60].map(j=>raw.readFloatLE(o+j))];
  for(let k=0;k<4;k++)maxKnotError=Math.max(maxKnotError,Math.abs(computedKnots[k]-cachedKnots[k]));
  const table=fs.readFileSync(path.join(dir,'track-0-node-'+i+'-table8.bin'));
  assert.equal(table.length,count*8);
  let last=controls[1],cumulative=0,localError=0;
  for(let j=0;j<count;j++){
    const d=table.readFloatLE(j*8),t=table.readFloatLE(j*8+4);
    const next=evaluate(controls,t,cachedKnots);
    cumulative+=distance(last,next);last=next;
    localError=Math.max(localError,Math.abs(cumulative-d));tableEntries++;
  }
  const endpointError=distance(last,controls[2]);maxEndpointError=Math.max(maxEndpointError,endpointError);
  maxArcError=Math.max(maxArcError,localError);
  const storedLength=raw.readFloatLE(o+0x68),storedChainage=raw.readFloatLE(o+0x6c);
  assert.equal(storedLength,table.readFloatLE((count-1)*8));
  if(i<track.raceCount)totalRaceLengthM+=storedLength;
  segments.push({node:i,controls:ids,entries:count,storedLengthM:storedLength,storedChainageM:storedChainage,maxArcErrorM:localError,endpointErrorM:endpointError});
}
assert(positionScaleError<1e-10);assert(maxKnotError<1e-4);assert(maxArcError<0.005);assert(maxEndpointError<0.005);
let inverseReferences=0,maxInverseParameterError=0;
for(const name of ['grid','pit-stops','garages']){
 const positions=fs.readFileSync(path.join(dir,'track-0-'+name+'.bin'));
 for(let o=0;o<positions.length;o+=24){
  const node=positions.readUInt32LE(o),d=positions.readFloatLE(o+4),cache=positions.readFloatLE(o+20),cacheIndex=positions.readUInt32LE(o+16);
  const bytes=fs.readFileSync(path.join(dir,'track-0-node-'+node+'-table8.bin'));
  const table=Array.from({length:bytes.length/8},(_,i)=>({distanceM:bytes.readFloatLE(i*8),parameter:bytes.readFloatLE(i*8+4)}));
  const calculated=parameterAtDistance(table,d,raw.readFloatLE(node*152+88));
  assert.equal(calculated.upperIndex,cacheIndex);
  maxInverseParameterError=Math.max(maxInverseParameterError,Math.abs(calculated.parameter-cache));inverseReferences++;
 }
}
assert.equal(inverseReferences,55);assert(maxInverseParameterError<1e-6);
const report={installable:false,source:'bahrain_live04',buildSha256:snapshot.executableSha256,
  curve:'centripetal Catmull-Rom, alpha=0.5',evidence:{nodes:p.length,activeSegments:segments.length,tableEntries,positionScaleError,maxKnotError,maxArcErrorM:maxArcError,maxEndpointErrorM:maxEndpointError,totalRaceLengthM,carsObserved:snapshot.cars.length,inverseReferences,maxInverseParameterError},
  observations:{serializedPositions:'centimetres',runtimePositionCache:'metres',runtimeArcLengths:'metres',raceWrap:track.raceCount,activePitSegments:segments.filter(s=>s.node>=track.raceCount).map(s=>s.node)},
  limitations:['Measured on this Bahrain build only','Lateral-offset sign and moving-car native track-position field require separate validation','Table sampling/float-rounding generation not yet reproduced exactly','No Kalinago game test'],segments};
fs.writeFileSync(path.join(__dirname,'native-spline-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.evidence));
