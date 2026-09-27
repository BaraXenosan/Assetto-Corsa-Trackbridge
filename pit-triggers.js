'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readPitMesh,spatialIndex}=require('./pit-surface');
const {buildCurves,projectMarker}=require('./project-fitted-markers');
const {distance}=require('./native-spline');
function surfaceBelow(p,triangles){
 for(const tri of triangles){const [a,b,c]=tri.points,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
  const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den,v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den,w=1-u-v;
  if(Math.min(u,v,w)<-1e-8)continue;const z=u*a[2]+v*b[2]+w*c[2];if(Math.abs(z-p[2])<=3)return {mesh:tri.mesh,heightM:z};
 }return null;
}
function transition(a,b,isInside){
 const state=isInside(a);if(state===isInside(b))throw Error('Endpoints do not bracket a transition');
 let lo=0,hi=1;for(let i=0;i<32;i++){const mid=(lo+hi)/2,p=a.map((v,k)=>v+mid*(b[k]-v));if(isInside(p)===state)lo=mid;else hi=mid;}
 const fraction=(lo+hi)/2;return {fraction,positionM:a.map((v,k)=>v+fraction*(b[k]-v)),type:state?'exit':'entry'};
}
module.exports={surfaceBelow,transition};
if(require.main===module){
 const [obj,aiFile,projectFile,fitFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Usage: node pit-triggers.js COLLISION.obj PIT_SOURCE.json PROJECT.json FIT.json NEW_OUTPUT.json');
 const files=[obj,aiFile,projectFile,fitFile],bytes=files.map(p=>fs.readFileSync(p)),ai=JSON.parse(bytes[1]),project=JSON.parse(bytes[2]),fit=JSON.parse(bytes[3]);
 const keys=project.surfaces.filter(s=>s.values.IS_PITLANE==='1').map(s=>s.values.KEY),mesh=readPitMesh(bytes[0].toString(),keys),index=spatialIndex(mesh.triangles);
 const inside=p=>Boolean(surfaceBelow(p,index.query(p,1))),points=ai.points.map(p=>[p.positionM[0],p.positionM[2],p.positionM[1]]),states=points.map(inside),curves=buildCurves(fit.pit),triggers=[];
 let chainage=0;
 for(let i=0;i<points.length-1;i++){
  const len=distance(points[i],points[i+1]);
  if(states[i]!==states[i+1]){const t=transition(points[i],points[i+1],inside),projection=projectMarker(t.positionM,curves);triggers.push({...t,sourceSegment:i,sourcePitDistanceM:chainage+t.fraction*len,projection,candidateNativeNode:fit.topology.pitEntryNode+projection.segment});}
  chainage+=len;
 }
 const result={installable:false,targetSlot:'Bahrain',method:'Vertical projection into collision triangles tagged IS_PITLANE=1; transition refinement between adjacent source AI points',surfaceKeys:keys,insidePoints:states.filter(Boolean).length,totalPoints:states.length,triggers,
  sources:files.map((p,i)=>({path:path.resolve(p),sha256:crypto.createHash('sha256').update(bytes[i]).digest('hex')})),
  limitations:['Transitions reproduce source surface membership; F1M pitLoop/start-trigger field semantics are not assigned','Crossings within a single AI interval with equal endpoint states are not detected','Fitted-curve projection is approximate; native trigger nodes still need anchoring','No speed-limit value is inferred from the surface flag']};
 fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({insidePoints:result.insidePoints,triggers:triggers.map(t=>({type:t.type,sourceSegment:t.sourceSegment,sourcePitDistanceM:t.sourcePitDistanceM,projectionErrorM:t.projection.distanceM}))}));
}
