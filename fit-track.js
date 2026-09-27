'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {distance,knots,evaluate}=require('./native-spline');
function nearest(p,line){
 let best={distanceM:Infinity,index:0,t:0};
 for(let i=0;i<line.length-1;i++){
  const a=line[i],v=line[i+1].map((x,k)=>x-a[k]),len=v.reduce((s,x)=>s+x*x,0);
  const t=len?Math.max(0,Math.min(1,v.reduce((s,x,k)=>s+x*(p[k]-a[k]),0)/len)):0;
  const d=distance(p,a.map((x,k)=>x+t*v[k]));if(d<best.distanceM)best={distanceM:d,index:i,t};
 }
 return best;
}
function fit(points,{closed=true,mandatory=[],toleranceM=.5,maxNodes=210,initialSpacingM=80,sampleStepM=.5,endpointControls=null}={}){
 if(points.length<4||points.some(p=>p.length!==3||!p.every(Number.isFinite)))throw Error('Invalid source points');
 if(!(toleranceM>0&&maxNodes>=4&&sampleStepM>0&&initialSpacingM>0))throw Error('Invalid fitting options');
 if(endpointControls&&(closed||[endpointControls.before,endpointControls.after].some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))))throw Error('Invalid endpoint controls');
 const n=points.length,selected=new Set([0,...mandatory]);if(!closed)selected.add(n-1);
 if([...selected].some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid mandatory index');
 let run=0;
 for(let i=1;i<n;i++){run+=distance(points[i-1],points[i]);if(run>=initialSpacingM){selected.add(i);run=0;}}
 if(selected.size<4)for(let i=0;i<4;i++)selected.add(Math.floor(i*(n-1)/3));
 if(selected.size>maxNodes)throw Error('Initial/mandatory nodes exceed budget');
 const cache=new Map();
 function inspect(ids,j){
  const from=ids[j],to=ids[(j+1)%ids.length];
  const prev=j?points[ids[j-1]]:closed?points[ids.at(-1)]:endpointControls?.before??points[from].map((v,k)=>2*v-points[to][k]);
  const next=j+2<ids.length?points[ids[j+2]]:closed?points[ids[(j+2)%ids.length]]:endpointControls?.after??points[to].map((v,k)=>2*v-points[from][k]);
  const key=JSON.stringify([prev,from,to,next]);if(cache.has(key))return cache.get(key);
  const controls=[prev,points[from],points[to],next],k=knots(controls),source=[],sourceIds=[];
  for(let i=from;;i=(i+1)%n){source.push(points[i]);sourceIds.push(i);if(i===to)break;}
  let sourceLength=0;for(let i=1;i<source.length;i++)sourceLength+=distance(source[i-1],source[i]);
  const steps=Math.max(8,Math.ceil(sourceLength/sampleStepM)),curve=[];
  for(let i=0;i<=steps;i++)curve.push(evaluate(controls,k[1]+(k[2]-k[1])*i/steps,k));
  let maxError=0,split=sourceIds[Math.floor(sourceIds.length/2)],forwardError=0,reverseError=0;
  for(let i=1;i<source.length-1;i++){const d=nearest(source[i],curve).distanceM;forwardError=Math.max(forwardError,d);if(d>maxError){maxError=d;split=sourceIds[i];}}
  for(const p of curve){const hit=nearest(p,source);reverseError=Math.max(reverseError,hit.distanceM);if(hit.distanceM>maxError){maxError=hit.distanceM;split=sourceIds[Math.max(1,Math.min(sourceIds.length-2,hit.index+(hit.t>.5?1:0)))];}}
  let lengthM=0;for(let i=1;i<curve.length;i++)lengthM+=distance(curve[i-1],curve[i]);
  const result={from,to,maxErrorM:maxError,forwardErrorM:forwardError,reverseErrorM:reverseError,split,sourceLengthM:sourceLength,lengthM,samples:curve.length};
  cache.set(key,result);return result;
 }
 let segments,ids;
 for(;;){
  ids=[...selected].sort((a,b)=>a-b);segments=Array.from({length:ids.length-(closed?0:1)},(_,j)=>inspect(ids,j));
  const worst=[...segments].sort((a,b)=>b.maxErrorM-a.maxErrorM)[0];
  if(worst.maxErrorM<=toleranceM||ids.length>=maxNodes)break;
  const candidate=[...segments].sort((a,b)=>b.maxErrorM-a.maxErrorM).find(s=>!selected.has(s.split));
  if(!candidate)break;selected.add(candidate.split);
 }
 const maxErrorM=Math.max(...segments.map(s=>s.maxErrorM));
 return {closed,passed:maxErrorM<=toleranceM,toleranceM,maxErrorM,maxNodes,nodeCount:ids.length,
  curve:'centripetal Catmull-Rom, alpha=0.5',verification:'bidirectional sampled polyline distance within each source interval; not a continuous error bound',sampleStepM,
  endpointControls,openEndpointRule:closed?null:endpointControls?'explicit adjacent race controls':'reflected endpoint controls for fitting only; game pit attachments not assigned',
  lengthM:segments.reduce((s,x)=>s+x.lengthM,0),nodes:ids.map(i=>({sourceIndex:i,positionM:points[i]})),segments};
}
function prepareRace(adapter){
 const original=adapter.race.nodes.map(n=>[n.m_pos.X/100,n.m_pos.Y/100,n.m_pos.Z/100]);
 const anchors=[...adapter.timingGates.map(g=>({...g,label:'timing-'+g.index})),{...adapter.pit.entryProjection,label:'pit-entry'},{...adapter.pit.exitProjection,label:'pit-exit'}];
 const items=[];
 for(let i=0;i<original.length;i++){
  items.push({positionM:original[i],originalSourceIndex:i,labels:[]});
  for(const a of anchors.filter(a=>a.segment===i).sort((a,b)=>a.t-b.t)){
   const p=a.positionCm.map(x=>x/100);
   if(distance(items.at(-1).positionM,p)<1e-6)items.at(-1).labels.push(a.label);
   else if(distance(original[(i+1)%original.length],p)<1e-6){ /* attached after all insertions */ }
   else items.push({positionM:p,originalSourceIndex:null,labels:[a.label]});
  }
 }
 for(const a of anchors){if(!items.some(p=>p.labels.includes(a.label))){const i=items.findIndex(p=>distance(p.positionM,a.positionCm.map(x=>x/100))<1e-6);if(i<0)throw Error('Lost anchor');items[i].labels.push(a.label);}}
 const origin=items.findIndex(p=>p.labels.includes('timing-0')),rotated=[...items.slice(origin),...items.slice(0,origin)];
 return {items:rotated,mandatory:rotated.flatMap((p,i)=>p.labels.length?[i]:[])};
}
module.exports={nearest,fit,prepareRace};
if(require.main===module){
 const [input,output,triggersFile]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('Usage: node fit-track.js ADAPTER.json NEW_OUTPUT.json [PIT_TRIGGERS.json]');
 const bytes=fs.readFileSync(input),adapter=JSON.parse(bytes),prepared=prepareRace(adapter);
 const race=fit(prepared.items.map(p=>p.positionM),{mandatory:prepared.mandatory,maxNodes:210});
 race.nodes.forEach(n=>Object.assign(n,{sourceIndex:n.sourceIndex,...prepared.items[n.sourceIndex]}));
 const entry=race.nodes.findIndex(n=>n.labels.includes('pit-entry')),exit=race.nodes.findIndex(n=>n.labels.includes('pit-exit'));
 const pitPoints=adapter.pit.nodes.map(n=>[n.m_pos.X/100,n.m_pos.Y/100,n.m_pos.Z/100]);
 const originalEndpoints=[pitPoints[0],pitPoints.at(-1)];
 pitPoints[0]=race.nodes[entry].positionM;pitPoints[pitPoints.length-1]=race.nodes[exit].positionM;
 const endpointControls={before:race.nodes[(entry+race.nodeCount-1)%race.nodeCount].positionM,after:race.nodes[(exit+1)%race.nodeCount].positionM};
 const triggerBytes=triggersFile?fs.readFileSync(triggersFile):null,triggers=triggerBytes?JSON.parse(triggerBytes).triggers:[];
 for(const t of triggers){
  if(!Number.isInteger(t.sourceSegment)||t.sourceSegment<1||t.sourceSegment>=pitPoints.length-2||!Number.isFinite(t.fraction)||t.fraction<=0||t.fraction>=1||!['entry','exit'].includes(t.type))throw Error('Invalid pit trigger anchor');
  const p=pitPoints[t.sourceSegment].map((v,k)=>v+t.fraction*(pitPoints[t.sourceSegment+1][k]-v));
  if(!Array.isArray(t.positionM)||t.positionM.length!==3||!t.positionM.every(Number.isFinite)||distance(p,t.positionM)>1e-6)throw Error('Pit trigger belongs to different source geometry');
 }
 const pitItems=[];
 for(let i=0;i<pitPoints.length;i++){
  pitItems.push({positionM:pitPoints[i],originalSourceIndex:i,labels:[]});
  for(const t of triggers.filter(t=>t.sourceSegment===i).sort((a,b)=>a.fraction-b.fraction))pitItems.push({positionM:t.positionM,originalSourceIndex:null,labels:['pit-zone-'+t.type]});
 }
 const pit=fit(pitItems.map(p=>p.positionM),{closed:false,maxNodes:42,initialSpacingM:60,endpointControls,mandatory:pitItems.flatMap((p,i)=>p.labels.length?[i]:[])});
 pit.nodes.forEach(n=>Object.assign(n,pitItems[n.sourceIndex]));
 pit.preparedSource=pitItems;
 pit.sourceEndpointAdjustmentsM=[distance(originalEndpoints[0],pitPoints[0]),distance(originalEndpoints[1],pitPoints.at(-1))];
 const nativePositions=[...race.nodes.map(n=>n.positionM),endpointControls.before,...pit.nodes.map(n=>n.positionM),endpointControls.after];
 const topology={status:'candidate derived from observed Bahrain duplicate-control pattern; not game-tested',raceNodeCount:race.nodeCount,pitNodeCount:pit.nodeCount+2,
  finishNode:0,pitEntryRaceNode:entry,pitExitRaceNode:exit,pitFirstGhostNode:race.nodeCount,pitEntryNode:race.nodeCount+1,pitExitNode:race.nodeCount+pit.nodeCount,pitLastGhostNode:race.nodeCount+pit.nodeCount+1,
  positionsCm:nativePositions.map(p=>({X:p[0]*100,Y:p[1]*100,Z:p[2]*100}))};
 const result={installable:false,targetSlot:'Bahrain',status:'fitted-source-geometry',input:path.resolve(input),inputSha256:crypto.createHash('sha256').update(bytes).digest('hex'),race,pit,
  totalControlNodes:nativePositions.length,topology,conservativeNodeBudget:254,budgetNote:'Engineering cap; not a verified global engine limit. Includes both pit ghost controls.',
  blockers:['Pit loop and trigger semantics not assigned; candidate attachments need validation','Marker positions need projection onto fitted native curve','Speed, corner, edge, incident and barrier data incomplete','New geometry cooking and in-game testing incomplete']};
 if(triggerBytes)result.triggerSource={path:path.resolve(triggersFile),sha256:crypto.createHash('sha256').update(triggerBytes).digest('hex')};
 fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({race:{nodes:race.nodeCount,errorM:race.maxErrorM,passed:race.passed},pit:{nodes:pit.nodeCount,errorM:pit.maxErrorM,passed:pit.passed},total:result.totalControlNodes}));
}
