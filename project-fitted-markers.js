'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {knots,evaluate,distance}=require('./native-spline');
function buildCurves(fit,stepM=.1){
 if(!fit.passed)throw Error('Cannot project onto a failed fit');
 const p=fit.nodes.map(n=>n.positionM),n=p.length,curves=[];
 for(let i=0;i<n-(fit.closed?0:1);i++){
  const start=p[i],end=p[(i+1)%n];
  const prev=i?p[i-1]:fit.closed?p.at(-1):fit.endpointControls?.before??start.map((x,k)=>2*x-end[k]);
  const next=i+2<n?p[i+2]:fit.closed?p[(i+2)%n]:fit.endpointControls?.after??end.map((x,k)=>2*x-start[k]);
  const q=[prev,start,end,next],k=knots(q),count=Math.max(16,Math.ceil(fit.segments[i].sourceLengthM/stepM)),samples=[];let lengthM=0,last;
  for(let j=0;j<=count;j++){
   const parameter=k[1]+(k[2]-k[1])*j/count,point=evaluate(q,parameter,k);if(last)lengthM+=distance(last,point);
   samples.push({parameter,point,distanceM:lengthM});last=point;
  }
  curves.push({q,k,samples,lengthM});
 }
 return curves;
}
function projectMarker(p,curves){
 let best={distanceM:Infinity};
 for(let i=0;i<curves.length;i++){
  const c=curves[i];
  for(let j=0;j<c.samples.length-1;j++){
   const a=c.samples[j],b=c.samples[j+1],v=b.point.map((x,k)=>x-a.point[k]),den=v.reduce((s,x)=>s+x*x,0);
   const f=Math.max(0,Math.min(1,v.reduce((s,x,k)=>s+x*(p[k]-a.point[k]),0)/den));
   const point=a.point.map((x,k)=>x+f*v[k]),d=distance(point,p);
   if(d<best.distanceM)best={distanceM:d,segment:i,sample:j,parameter:a.parameter+f*(b.parameter-a.parameter)};
  }
 }
 const c=curves[best.segment],a=c.samples[best.sample],b=c.samples[best.sample+1];let lo=a.parameter,hi=b.parameter;
 for(let i=0;i<28;i++){const t1=lo+(hi-lo)/3,t2=hi-(hi-lo)/3;if(distance(evaluate(c.q,t1,c.k),p)<distance(evaluate(c.q,t2,c.k),p))hi=t2;else lo=t1;}
 const parameter=(lo+hi)/2,point=evaluate(c.q,parameter,c.k),t0=Math.max(c.k[1],parameter-1e-4),t1=Math.min(c.k[2],parameter+1e-4);
 const tangent0=evaluate(c.q,t0,c.k),tangent1=evaluate(c.q,t1,c.k),dx=tangent1[0]-tangent0[0],dy=tangent1[1]-tangent0[1],len=Math.hypot(dx,dy);
 if(len<1e-10)throw Error('Undefined horizontal tangent');
 return {segment:best.segment,parameter,positionM:point,distanceM:distance(point,p),distanceAlongSegmentM:a.distanceM+distance(a.point,point),
  signedLeftOffsetM:((p[0]-point[0])*(-dy)+(p[1]-point[1])*dx)/len,heightDifferenceM:p[2]-point[2]};
}
module.exports={buildCurves,projectMarker};
if(require.main===module){
 const [adapterFile,fitFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Usage: node project-fitted-markers.js ADAPTER.json FIT.json NEW_OUTPUT.json');
 const aBytes=fs.readFileSync(adapterFile),fBytes=fs.readFileSync(fitFile),a=JSON.parse(aBytes),f=JSON.parse(fBytes);
 const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
 if(f.inputSha256!==digest(aBytes))throw Error('Fit belongs to a different adapter input');
 const race=buildCurves(f.race),pit=buildCurves(f.pit);
 const markers=a.markers.map(m=>({name:m.name,line:m.line,sourcePositionCm:m.positionCm,...projectMarker(m.positionCm.map(x=>x/100),m.line==='pit'?pit:race)}));
 const gates=a.timingGates.map(g=>({index:g.index,...projectMarker(g.positionCm.map(x=>x/100),race)}));
 const result={installable:false,targetSlot:'Bahrain',sourceFiles:[{path:path.resolve(adapterFile),sha256:digest(aBytes)},{path:path.resolve(fitFile),sha256:digest(fBytes)}],
  distanceUnits:'metres',coordinateFrame:'Unreal axes from source transform',integrationSampleSpacingM:.1,
  raceSplineLengthM:race.reduce((s,c)=>s+c.lengthM,0),pitSplineLengthM:pit.reduce((s,c)=>s+c.lengthM,0),markers,timingGates:gates,
  limitations:['signedLeftOffsetM is geometric left, not yet validated against native m_offRaceLineDistance sign','Segment distances use dense numerical integration, not exact native runtime tables','Pit endpoint control points are provisional','Source start/pit marker count must be mapped to F1M participant/team slots','Not a complete native RaceSim component']};
 fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({markers:markers.length,gates:gates.length,maxGateDistanceM:Math.max(...gates.map(g=>g.distanceM)),raceSplineLengthM:result.raceSplineLengthM,pitSplineLengthM:result.pitSplineLengthM}));
}
