'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {evaluate,parameterAtDistance}=require('../native-spline');
const component=require('./bahrain_schema01/race-component.json').Properties;
const results=[];
for(const source of ['bahrain_live04','bahrain_live05']) {
 const dir=path.join(__dirname,source),snapshot=JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json')));
 const cars=snapshot.cars.filter(c=>c.className==='BP_SafetyCar2022_C' && c.fullPath.startsWith(snapshot.world+'.PersistentLevel.'));
 assert.equal(cars.length,1);
 const f=component.m_safetyCarPositions[0],i=f.m_trackNodeID;
 const points=[i-1,i,i+1,i+2].map(j=>snapshot.tracks[0].nodes[j].position.map(v=>v/100));
 const raw=fs.readFileSync(path.join(dir,'track-0-nodes.bin'));
 const k=[0,...[0x58,0x5c,0x60].map(o=>raw.readFloatLE(i*0x98+o))];
 const bytes=fs.readFileSync(path.join(dir,`track-0-node-${i}-table8.bin`));
 const table=Array.from({length:bytes.length/8},(_,j)=>({distanceM:bytes.readFloatLE(j*8),parameter:bytes.readFloatLE(j*8+4)}));
 const t=parameterAtDistance(table,f.m_splineDistance,k[1]).parameter;
 const center=evaluate(points,t,k),a=evaluate(points,t-.0001,k),b=evaluate(points,t+.0001,k);
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),left=[-dy/len,dx/len];
 const actual=cars[0].relativeLocation.map(v=>v/100);
 const predict=sign=>center.map((v,j)=>j<2?v+sign*left[j]*f.m_offRaceLineDistance:v);
 const error=sign=>Math.hypot(...predict(sign).slice(0,2).map((v,j)=>v-actual[j]));
 results.push({source,actualM:actual,centerM:center,offsetM:f.m_offRaceLineDistance,positiveLeftErrorM:error(1),negativeLeftErrorM:error(-1),heightDifferenceM:actual[2]-center[2]});
}
const passed=results.every(r=>r.positiveLeftErrorM<.1 && r.negativeLeftErrorM>10);
const report={installable:false,passed,results,conclusion:passed?'Positive m_offRaceLineDistance matches geometric left in Unreal XY for the parked safety-car FTrackPosition':'Sign not confirmed',limitations:['Measured on parked Bahrain safety car, not every car positioning mode','Actor Z may include suspension/ground placement']};
fs.writeFileSync(path.join(__dirname,'lateral-sign-verification01.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!passed)process.exitCode=2;
