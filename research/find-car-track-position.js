'use strict';
const fs=require('node:fs'),path=require('node:path'),{evaluate}=require('../native-spline');
const dir=path.join(__dirname,'bahrain_live04'),s=JSON.parse(fs.readFileSync(path.join(dir,'snapshot.json'))),raw=fs.readFileSync(path.join(dir,'track-0-nodes.bin'));
const p=s.tracks[0].nodes.map(n=>n.position.map(x=>x/100)),curves=new Map();
for(let i=0;i<p.length;i++){
 const count=raw.readInt32LE(i*152+80);if(!count)continue;
 const ids=i<108?[(i+107)%108,i,(i+1)%108,(i+2)%108]:[i-1,i,i+1,i+2];
 curves.set(i,{q:ids.map(j=>p[j]),k:[0,...[88,92,96].map(o=>raw.readFloatLE(i*152+o))],length:raw.readFloatLE(i*152+104),table:fs.readFileSync(path.join(dir,'track-0-node-'+i+'-table8.bin'))});
}
function position(c,d){let j=0;while(j<c.table.length/8-1&&c.table.readFloatLE(j*8)<d)j++;const d0=j?c.table.readFloatLE((j-1)*8):0,t0=j?c.table.readFloatLE((j-1)*8+4):c.k[1],d1=c.table.readFloatLE(j*8),t1=c.table.readFloatLE(j*8+4);return evaluate(c.q,t0+(t1-t0)*(d-d0)/(d1-d0),c.k);}
const result=[];
for(const car of s.cars){
 const carPoint=car.relativeLocation.map(x=>x/100),matches=[];
 for(const file of [car.file,car.file.replace('.bin','-location.bin')]){
  const b=fs.readFileSync(path.join(dir,file));
  for(let o=0;o<=b.length-12;o+=4){
   const node=b.readUInt32LE(o),d=b.readFloatLE(o+4),off=b.readFloatLE(o+8),c=curves.get(node);
   if(!c||!Number.isFinite(d)||!Number.isFinite(off)||d<0.01||d>c.length||Math.abs(off)>25)continue;
   const point=position(c,d),next=position(c,Math.min(d+.05,c.length)),dx=next[0]-point[0],dy=next[1]-point[1],len=Math.hypot(dx,dy);
   if(len<1e-8)continue;
   for(const sign of [-1,1]){const predicted=[point[0]-sign*off*dy/len,point[1]+sign*off*dx/len];const error=Math.hypot(predicted[0]-carPoint[0],predicted[1]-carPoint[1]);if(error<3)matches.push({file,offset:'0x'+o.toString(16),node,distance:d,lateral:off,normalSign:sign,errorM:error});}
  }
 }
 result.push({car:car.fullPath,matches:matches.sort((a,b)=>a.errorM-b.errorM)});
}
fs.writeFileSync(path.join(__dirname,'car-position-candidates.json'),JSON.stringify({status:'heuristic candidates only',result},null,2));
console.log(JSON.stringify(result.filter(r=>r.matches.length).map(r=>({car:r.car.split('.').at(-1),best:r.matches[0]})),null,2));
