'use strict';
// Offline candidate search in previously captured, read-only process snapshots.
const fs = require('fs'), path = require('path');
const { evaluate, parameterAtDistance } = require('../native-spline');
const dir = path.resolve(process.argv[2] || path.join(__dirname,'bahrain_live05'));
const snapshot = JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json')));
const track = snapshot.tracks[0];
const p = track.nodes.map(n=>n.position.map(v=>v/100));
const raw = fs.readFileSync(path.join(dir,'track-0-nodes.bin'));
const curves = new Map();
for(let i=0;i<p.length;i++) {
  const file=path.join(dir,`track-0-node-${i}-table8.bin`);
  if(!fs.existsSync(file))continue;
  const ids=i<track.raceCount?[(i+track.raceCount-1)%track.raceCount,i,(i+1)%track.raceCount,(i+2)%track.raceCount]:[i-1,i,i+1,i+2];
  const bytes=fs.readFileSync(file);
  curves.set(i,{points:ids.map(j=>p[j]),knots:[0,...[0x58,0x5c,0x60].map(j=>raw.readFloatLE(i*0x98+j))],
    table:Array.from({length:bytes.length/8},(_,j)=>({distanceM:bytes.readFloatLE(j*8),parameter:bytes.readFloatLE(j*8+4)}))});
}
const results=[];
for(const kind of ['actor','location']) {
  const cars=snapshot.cars.map((car,i)=>({car, bytes:fs.readFileSync(path.join(dir,kind==='actor'?car.file:`car-${i}-location.bin`))}));
  for(let offset=0;offset+24<=Math.min(...cars.map(c=>c.bytes.length));offset+=4) {
    const matches=[];
    for(const {car,bytes} of cars) {
      const node=bytes.readUInt32LE(offset),d=bytes.readFloatLE(offset+4),lateral=bytes.readFloatLE(offset+8);
      const curve=curves.get(node);
      if(!curve||!Number.isFinite(d)||d<=.01||d>curve.table.at(-1).distanceM||!Number.isFinite(lateral)||Math.abs(lateral)>60||!car.relativeLocation)continue;
      const t=parameterAtDistance(curve.table,d,curve.knots[1]).parameter;
      const center=evaluate(curve.points,t,curve.knots);
      const a=evaluate(curve.points,Math.max(curve.knots[1],t-.0001),curve.knots);
      const b=evaluate(curve.points,Math.min(curve.knots[2],t+.0001),curve.knots);
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const actual=car.relativeLocation.map(v=>v/100);
      const error=sign=>Math.hypot(center[0]-sign*dy/length*lateral-actual[0],center[1]+sign*dx/length*lateral-actual[1]);
      matches.push({car:car.fullPath,node,d,lateral,positiveLeftErrorM:error(1),negativeLeftErrorM:error(-1),cacheParameterError:Math.abs(bytes.readFloatLE(offset+20)-t)});
    }
    if(matches.length<15)continue;
    const median=key=>matches.map(m=>m[key]).sort((a,b)=>a-b)[Math.floor(matches.length/2)];
    results.push({kind,offset:'0x'+offset.toString(16),matches:matches.length,positiveLeftMedianErrorM:median('positiveLeftErrorM'),negativeLeftMedianErrorM:median('negativeLeftErrorM'),medianCacheParameterError:median('cacheParameterError'),samples:matches});
  }
}
results.sort((a,b)=>Math.min(a.positiveLeftMedianErrorM,a.negativeLeftMedianErrorM)-Math.min(b.positiveLeftMedianErrorM,b.negativeLeftMedianErrorM));
const report={installable:false,source:dir,status:'candidate search, not validated offsets',candidates:results.slice(0,10)};
fs.writeFileSync(path.join(dir,'car-track-position-candidates.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(results.slice(0,10).map(({samples,...rest})=>rest),null,2));
