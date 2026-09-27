'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function readPitMesh(text,allowedSurfaceKeys=['FASTLANE','PITLANE']){
 const keys=new Set(allowedSurfaceKeys.map(k=>k.toLowerCase()));
 const vertices=[],triangles=[],counts={};let name='';
 for(const line of text.split(/\r?\n/)){
  if(line.startsWith('o '))name=line.slice(2).trim();
  else if(line.startsWith('v ')){const p=line.trim().split(/\s+/).slice(1).map(Number);if(p.length!==3||!p.every(Number.isFinite))throw Error('Invalid OBJ vertex');vertices.push(p.map(x=>x/100));}
  else if(line.startsWith('f ')&&keys.has(/^1_([a-z]+)_/i.exec(name)?.[1].toLowerCase())){
   const ids=line.trim().split(/\s+/).slice(1).map(x=>Number(x.split('/')[0])-1);
   if(ids.length!==3||ids.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw Error('Invalid OBJ triangle');
   triangles.push({mesh:name,points:ids.map(i=>vertices[i])});counts[name]=(counts[name]??0)+1;
  }
 }
 if(!triangles.length)throw Error('No pit surfaces found');return {triangles,counts};
}
function section(p,forward,triangles){
 const l=Math.hypot(forward[0],forward[1]);if(l<1e-10)throw Error('Invalid pit tangent');
 const tangent=[forward[0]/l,forward[1]/l],normal=[-tangent[1],tangent[0]],intervals=[];
 for(const tri of triangles){
  const q=tri.points,d=q.map(v=>(v[0]-p[0])*tangent[0]+(v[1]-p[1])*tangent[1]);
  if(Math.min(...d)>0||Math.max(...d)<0)continue;
  const hits=[];
  for(let i=0;i<3;i++){
   const j=(i+1)%3;if(Math.abs(d[i])<1e-8)hits.push(q[i]);
   if(d[i]*d[j]<0){const f=d[i]/(d[i]-d[j]);hits.push(q[i].map((v,k)=>v+f*(q[j][k]-v)));}
  }
  if(hits.length<2||hits.some(v=>Math.abs(v[2]-p[2])>3))continue;
  const s=hits.map(v=>(v[0]-p[0])*normal[0]+(v[1]-p[1])*normal[1]),min=Math.min(...s),max=Math.max(...s);
  if(max-min>1e-7)intervals.push({min,max,meshes:[tri.mesh]});
 }
 intervals.sort((a,b)=>a.min-b.min);const merged=[];
 for(const interval of intervals){const last=merged.at(-1);if(last&&interval.min<=last.max+.01){last.max=Math.max(last.max,interval.max);last.meshes=[...new Set([...last.meshes,...interval.meshes])];}else merged.push({...interval});}
 const containing=merged.filter(i=>i.min<=.01&&i.max>=-.01);
 return {intervals:merged,containing:containing.length===1?containing[0]:null};
}
function spatialIndex(triangles,cellSize=20){
 const cells=new Map();
 triangles.forEach((tri,i)=>{
  const xs=tri.points.map(p=>p[0]),ys=tri.points.map(p=>p[1]);
  const x0=Math.floor(Math.min(...xs)/cellSize),x1=Math.floor(Math.max(...xs)/cellSize),y0=Math.floor(Math.min(...ys)/cellSize),y1=Math.floor(Math.max(...ys)/cellSize);
  if((x1-x0+1)*(y1-y0+1)>100000)throw Error('Unexpectedly large triangle');
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
 });
 return {query(p,radius=60){const ids=new Set();for(let x=Math.floor((p[0]-radius)/cellSize);x<=Math.floor((p[0]+radius)/cellSize);x++)for(let y=Math.floor((p[1]-radius)/cellSize);y<=Math.floor((p[1]+radius)/cellSize);y++)for(const id of cells.get(x+','+y)??[])ids.add(id);return [...ids].map(i=>triangles[i]);}};
}
module.exports={readPitMesh,section,spatialIndex};
if(require.main===module){
 const [obj,aiFile,out,projectFile]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Usage: node pit-surface.js TRACK_COLLISION.obj PIT_SOURCE.json NEW_OUTPUT.json [PROJECT.json]');
 const projectBytes=projectFile?fs.readFileSync(projectFile):null;
 const surfaceKeys=projectBytes?JSON.parse(projectBytes).surfaces.filter(s=>s.values.IS_VALID_TRACK==='1').map(s=>s.values.KEY):['FASTLANE','PITLANE'];
 const b=fs.readFileSync(obj),a=fs.readFileSync(aiFile),mesh=readPitMesh(b.toString(),surfaceKeys),ai=JSON.parse(a),points=ai.points.map(v=>[v.positionM[0],v.positionM[2],v.positionM[1]]),index=spatialIndex(mesh.triangles);
 const sections=points.map((p,i)=>{const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],forward=after.map((v,k)=>v-before[k]);const hit=section(p,forward,index.query(p));return {sourcePitIndex:i,positionM:p,...hit};});
 const missing=sections.filter(s=>!s.containing).map(s=>s.sourcePitIndex);
 const result={installable:false,source:'Kalinago track.kn5 collision mesh exported to Unreal-oriented centimetres',surfaceKeys,meshTriangles:mesh.triangles.length,meshes:mesh.counts,
  crossSectionUnits:'metres',mergeToleranceM:.01,maxVerticalDistanceM:3,sections,missing,
  sources:[{path:path.resolve(obj),sha256:crypto.createHash('sha256').update(b).digest('hex')},{path:path.resolve(aiFile),sha256:crypto.createHash('sha256').update(a).digest('hex')}],
  limitations:['These are selected physical-surface extents, not verified legal pit-lane limits','Spatial query is limited to a 60 metre box around each source point; distant surface extents are not guaranteed','Walls, markings and garage areas must be checked before native pit edges are generated']};
 if(projectBytes)result.sources.push({path:path.resolve(projectFile),sha256:crypto.createHash('sha256').update(projectBytes).digest('hex')});
 fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({triangles:mesh.triangles.length,meshes:mesh.counts,points:sections.length,missing:missing.length,firstMissing:missing.slice(0,12)}));
}
