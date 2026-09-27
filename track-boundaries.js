'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {evaluate,distance}=require('./native-spline');
const {buildCurves}=require('./project-fitted-markers');
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function boundarySegments(rows,zSign=-1){
 if(rows.length<2||![1,-1].includes(zSign)||rows.some(r=>r.length!==4||!r.every(Number.isFinite)))throw Error('Invalid boundary rows');
 const points=rows.map(r=>[r[0],zSign*r[2],r[1]]),segments=[];
 for(let i=0;i<points.length-1;i++)segments.push([points[i],points[i+1]]);
 const gap=distance(points[0],points.at(-1));if(gap>1e-6&&gap<5)segments.push([points.at(-1),points[0]]);
 return {segments,endpointGapM:gap,closed:gap<5};
}
function intersections(p,tangent,boundary,{maxWidthM=60,maxHeightM=3}={}){
 const len=Math.hypot(tangent[0],tangent[1]);if(len<1e-10)throw Error('Invalid tangent');
 const normal=[-tangent[1]/len,tangent[0]/len],hits=[];
 for(let i=0;i<boundary.segments.length;i++){
  const [a,b]=boundary.segments[i],v=b.map((x,k)=>x-a[k]),den=cross(normal,v);if(Math.abs(den)<1e-10)continue;
  const q=a.map((x,k)=>x-p[k]),s=cross(q,v)/den,t=cross(q,normal)/den;
  if(t<0||t>=1||Math.abs(s)>maxWidthM)continue;
  const z=a[2]+t*v[2];if(Math.abs(z-p[2])>maxHeightM)continue;
  const point=[p[0]+normal[0]*s,p[1]+normal[1]*s,z];
  if(!hits.some(h=>Math.abs(h.signedLeftM-s)<1e-5))hits.push({boundarySegment:i,signedLeftM:s,heightDifferenceM:z-p[2],positionM:point});
 }
 return hits.sort((a,b)=>Math.abs(a.signedLeftM)-Math.abs(b.signedLeftM));
}
function stats(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?{count:v.length,min:v[0],median:v[Math.floor(v.length/2)],p95:v[Math.min(v.length-1,Math.floor(v.length*.95))],max:v.at(-1)}:{count:0};}
function checkAxes(ai,sides){
 const comparisons=[];
 for(const sign of [1,-1]){
  const boundaries=Object.fromEntries(Object.entries(sides).map(([k,v])=>[k,boundarySegments(v.rows,sign)]));
  const samples={side_l:[],side_r:[]};let missing=0;
  for(let i=0;i<ai.points.length;i++){const p=ai.points[i],e=p.extra,origin=[p.positionM[0],p.positionM[2],p.positionM[1]],forward=[e.forwardX,e.forwardZ,e.forwardY];
   for(const name of ['side_l','side_r']){const h=intersections(origin,forward,boundaries[name])[0];if(!h){missing++;continue;}samples[name].push({signed:h.signedLeftM,error:Math.abs(Math.abs(h.signedLeftM)-e[name==='side_l'?'sideLeft':'sideRight'])});}
  }
  comparisons.push({csvZSign:sign,missing,totalExpected:ai.points.length*2,sides:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{widthErrorM:stats(v.map(x=>x.error)),positive:v.filter(x=>x.signed>0).length,negative:v.filter(x=>x.signed<0).length}]))});
 }
 return comparisons;
}
function generate(fit,sides,sign){
 const bounds=Object.fromEntries(Object.entries(sides).map(([k,v])=>[k,boundarySegments(v.rows,sign)])),curves=buildCurves(fit.race,.25),edges=[],issues=[];
 curves.forEach((c,node)=>{
  const targets=[];for(let s=0;s<c.lengthM;s+=10)targets.push(s);
  for(const d of targets){
   let j=1;while(j<c.samples.length-1&&c.samples[j].distanceM<d)j++;
   const a=c.samples[j-1],b=c.samples[j],parameter=a.parameter+(b.parameter-a.parameter)*(d-a.distanceM)/(b.distanceM-a.distanceM);
   const p=evaluate(c.q,parameter,c.k),t0=Math.max(c.k[1],parameter-1e-4),t1=Math.min(c.k[2],parameter+1e-4),p0=evaluate(c.q,t0,c.k),p1=evaluate(c.q,t1,c.k),tangent=p1.map((x,k)=>x-p0[k]);
   const hits=Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,intersections(p,tangent,v)]));
   const left=hits.side_l[0],right=hits.side_r[0];
   const flags=[];
   if(!left||!right)flags.push('missing-boundary');
   if(left&&right&&left.signedLeftM*right.signedLeftM>=0)flags.push('both-boundaries-on-same-side');
   if(hits.side_l.length>1||hits.side_r.length>1)flags.push('multiple-crossings');
   const edge={raceNodeIndex:node,distanceAlongSegmentM:d,positionM:p,sourceLeft:left??null,sourceRight:right??null,flags};
   if(flags.length)issues.push({edge:edges.length,flags});edges.push(edge);
  }
 });
 return {edges,issues,boundaryGapsM:Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,v.endpointGapM]))};
}
module.exports={boundarySegments,intersections,checkAxes,generate};
if(require.main===module){
 const [sourceDir,fitFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Usage: node track-boundaries.js SOURCE_EXTRACT_DIRECTORY FIT.json NEW_OUTPUT.json');
 const inputs=[path.join(sourceDir,'fast-lane-source.json'),path.join(sourceDir,'boundary-csv-source.json'),fitFile],bytes=inputs.map(p=>fs.readFileSync(p)),[ai,sides,fit]=bytes.map(b=>JSON.parse(b));
 if(!fit.race.passed)throw Error('Failed race fit');
 const axisComparisons=checkAxes(ai,sides),chosen=axisComparisons.find(c=>c.csvZSign===-1);
 const supported=chosen.missing===0&&Object.values(chosen.sides).every(s=>s.widthErrorM.p95<1);
 if(!supported)throw Error('Boundary axis hypothesis failed validation against source AI widths');
 const result={installable:false,targetSlot:'Bahrain',axisComparisons,axisHypothesis:{csvToUnrealMetres:'[x,-z,y]',supportedByAiWidths:supported},
  ...generate(fit,sides,-1),sources:inputs.map((p,i)=>({path:path.resolve(p),sha256:crypto.createHash('sha256').update(bytes[i]).digest('hex')})),
  limitations:['Source side labels have not been mapped to native inside/outside semantics','Multiple intersections require review before native edge generation','No pit boundaries in these race-side CSVs','Runoff and barrier surfaces need KN5 geometry','These are candidate geometric cross-sections, not a complete FTrackEdge array']};
 fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({axisComparisons,edges:result.edges.length,issues:result.issues.length,supportedByAiWidths:supported}));
}
