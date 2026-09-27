'use strict';
// Offline prototype. Runtime validation is deliberately a separate gate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildCurves,projectMarker}=require('./project-fitted-markers');
function build(root){
 const sources=[];function read(name){const file=path.join(root,'research',name),b=fs.readFileSync(file);sources.push({path:file,sha256:crypto.createHash('sha256').update(b).digest('hex')});return JSON.parse(b);}
 const original=read('bahrain_schema01/race-component.json').Properties,fit=read('kalinago-fit03.json'),markers=read('kalinago-fitted-markers03.json'),boundaries=read('kalinago-boundaries02.json'),surfaces=read('kalinago-pit-surfaces02.json'),ai=read('kalinago_source01/fast-lane-source.json'),adapter=read('kalinago-race-adapter02.json');
 const sign=read('lateral-sign-verification01.json');if(!sign.passed)throw Error('Lateral sign unverified');
 const t=fit.topology,race=buildCurves(fit.race),pit=buildCurves(fit.pit);
 if(t.positionsCm.length!==159||race.length!==129||pit.length!==27||boundaries.issues.length)throw Error('Unexpected source topology');
 const cumulative=c=>{let d=0;return c.map(x=>{const start=d;d+=x.lengthM;return start;});},rs=cumulative(race),ps=cumulative(pit);
 const total=c=>c.reduce((s,x)=>s+x.lengthM,0),position=(node,d=0,off=0)=>({m_trackNodeID:node,m_splineDistance:d,m_offRaceLineDistance:off});
 function at(d,c,base=0,off=0){if(d<0||d>total(c))throw Error('Chainage outside curve');let i=0;while(i<c.length-1&&d>c[i].lengthM){d-=c[i++].lengthM;}return position(base+i,d,off);}
 const projected=(m,base=0)=>position(base+m.segment,m.distanceAlongSegmentM,m.signedLeftOffsetM);
 const p={};let corner=0,wasCorner=false;
 p.m_trackNodes=t.positionsCm.map((pos,i)=>{
  let speed=120,type='AccelerateOut',bend='Straight',number=0;
  if(i<129){const n=fit.race.nodes[i],s=ai.points[n.originalSourceIndex??Math.min(n.sourceIndex,ai.points.length-1)].extra;
   const curved=Math.abs(s.radius)<250;if(curved&&!wasCorner)corner++;wasCorner=curved;number=corner;
   speed=Math.max(50,Math.min(350,s.speed*3.6));type=s.brake>.05?'MaintainSpeed':'AccelerateOut';bend=curved?(Math.abs(s.radius)<80?'ShortCorner':'MediumCorner'):'Straight';
  }else if(i>=138&&i<147){speed=80;type='PitLane';}
  return {m_pos:pos,m_maxSpeed:speed,m_nodeType:'ENodeType::'+type,m_cornerType:'EBendType::'+bend,m_cornerNumber:number,m_dynamicLineOffset:0,m_previousEdgeID:0,m_highRiskKerb:false};
 });
 const edge=(node,d,inside,outside)=>({...position(node,d),m_edgeData:{m_insideEdge:inside,m_outsideEdge:outside},m_offTrackData:{m_insideEdgeOffset:0,m_outsideEdgeOffset:0,m_insideType:'EOffTrackType::Tarmac',m_outsideType:'EOffTrackType::Tarmac'}});
 p.m_trackEdges=boundaries.edges.map(e=>edge(e.raceNodeIndex,e.distanceAlongSegmentM,e.sourceRight.signedLeftM,-e.sourceLeft.signedLeftM));
 p.m_lastRaceTrackEdgeID=p.m_trackEdges.length-1;
 const nearestSurface=point=>surfaces.sections.reduce((a,b)=>Math.hypot(...a.positionM.map((v,k)=>v-point[k]))<Math.hypot(...b.positionM.map((v,k)=>v-point[k]))?a:b).containing;
 for(let i=0;i<pit.length;i++){for(let j=0;j<pit[i].samples.length;j+=Math.max(1,Math.floor(pit[i].samples.length/4))){const s=pit[i].samples[j],w=nearestSurface(s.point);p.m_trackEdges.push(edge(130+i,s.distanceM,w.max,-w.min));}}
 for(let i=0;i<159;i++){let indices=p.m_trackEdges.map((e,k)=>e.m_trackNodeID===i?k:-1).filter(k=>k>=0);p.m_trackNodes[i].m_previousEdgeID=indices[0]??(i===129?648:i>=157?p.m_trackEdges.length-1:0);}
 const starts=markers.markers.filter(m=>/^AC_START_\d+$/.test(m.name)).sort((a,b)=>+a.name.split('_').at(-1)- +b.name.split('_').at(-1));
 p.m_carStartPositions=starts.slice(0,22).map(m=>projected(m));
 const garages=markers.markers.filter(m=>/^AC_PIT_\d+$/.test(m.name)).sort((a,b)=>(ps[a.segment]+a.distanceAlongSegmentM)-(ps[b.segment]+b.distanceAlongSegmentM));
 p.m_garagePositions=[];p.m_pitStopPositions=[];const allocations=[];
 for(let team=0;team<11;team++){const lo=Math.floor(team*garages.length/11),hi=Math.floor((team+1)*garages.length/11),group=garages.slice(lo,hi),pair=group.slice(Math.floor((group.length-2)/2),Math.floor((group.length-2)/2)+2);
  p.m_garagePositions.push(...pair.map(m=>projected(m,130)));const d=pair.reduce((s,m)=>s+ps[m.segment]+m.distanceAlongSegmentM,0)/2,off=pair.reduce((s,m)=>s+m.signedLeftOffsetM,0)/4;p.m_pitStopPositions.push(at(d,pit,130,off));allocations.push({team,markers:pair.map(m=>m.name)});
 }
 p.m_pitLaneRedFlagPositions=Array.from({length:22},(_,i)=>at(ps[17]-10-i*8,pit,130));
 const unused=garages.find(m=>!allocations.some(a=>a.markers.includes(m.name)));p.m_safetyCarPositions=[projected(unused,130)];
 p.m_sectorCheckpoints=markers.timingGates.filter(g=>g.index>0).sort((a,b)=>a.index-b.index).map(g=>position(g.segment,g.distanceAlongSegmentM));
 p.m_marshalSectorCheckpoints=Array.from({length:31},(_,i)=>at(total(race)*(i+.5)/31,race));
 for(const [field,key]of [['m_DRSDetection','detection'],['m_DRSZoneStart','start'],['m_DRSZoneEnd','end']])p[field]=adapter.drs.map(z=>{let d=(z.sourceNormalized[key]*adapter.race.polylineLengthM-adapter.race.originSourceChainageM+adapter.race.polylineLengthM)%adapter.race.polylineLengthM;return at(d/adapter.race.polylineLengthM*total(race),race);});
 Object.assign(p,{m_trackNodesCount:129,m_pitNodesCount:30,m_cornerCount:corner,m_pitEntrance_RaceTrackNodeID:121,m_pitExit_RaceTrackNodeID:11,m_finishLineNodeID:0,m_pitLoopNodeID:141,m_startLineNodeID:2,PitLaneStartTriggerNodeID:5});
 function widths(node,d){const edges=p.m_trackEdges.filter(e=>e.m_trackNodeID===node);let a=edges[0],b=edges.at(-1);for(let i=1;i<edges.length;i++)if(edges[i].m_splineDistance>=d){a=edges[i-1];b=edges[i];break;}const f=Math.max(0,Math.min(1,(d-a.m_splineDistance)/(b.m_splineDistance-a.m_splineDistance||1)));return {left:a.m_edgeData.m_insideEdge*(1-f)+b.m_edgeData.m_insideEdge*f,right:a.m_edgeData.m_outsideEdge*(1-f)+b.m_edgeData.m_outsideEdge*f};}
 p.m_pitLaneMapping=[];
 for(let i=0;i<pit.length;i++){const samples=pit[i].samples;for(let j=0;j<samples.length;j+=10){const s=samples[j],r=projectMarker(s.point,race),rw=widths(r.segment,r.distanceAlongSegmentM),pw=widths(130+i,s.distanceM),left=r.signedLeftOffsetM>=0;
  p.m_pitLaneMapping.push({m_pitNodeID:130+i,m_trackNodeID:r.segment,m_pitSplineDistance:s.distanceM,m_trackRaceSplineDistance:r.distanceAlongSegmentM,m_offTrackDistance:Math.hypot(s.point[0]-r.positionM[0],s.point[1]-r.positionM[1]),m_intersect:Math.abs(r.signedLeftOffsetM)<=(left?rw.left+pw.right:rw.right+pw.left)});
 }}
 p.m_nodeIncidentsMapping=[];const zero=v=>typeof v==='number'?0:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,zero(x)]));p.m_trackIncidentsData=zero(original.m_trackIncidentsData);p.BarrierSplines=[];
 for(const [key,value]of Object.entries(p))if(!(key in original))throw Error('Unknown property '+key);
 function validate(v){if(typeof v==='number'&&!Number.isFinite(v))throw Error('Nonfinite field');if(v&&typeof v==='object'){if('m_trackNodeID'in v&&(v.m_trackNodeID<0||v.m_trackNodeID>=159))throw Error('Node range');for(const x of Object.values(v))validate(x);}}validate(p);
 if(p.m_carStartPositions.length!==22||p.m_garagePositions.length!==22||p.m_sectorCheckpoints.length!==2)throw Error('Position count mismatch');
 return {installable:false,targetSlot:'Bahrain',status:'offline-prototype-requires-runtime-validation',sources,Properties:p,allocations,assumptions:['AI speeds treated as metres per second; vehicle-specific tuning unvalidated','Pit-stop lateral positions halfway between source garage markers and lane; test animation and clearance','Pit loop node 141 and exit-minus-six trigger pattern require runtime timing validation','DRS uses source normalized polyline chainage; normalization unverified','Pit edges use physical driveable surface, not sporting limits','Incident map and old Bahrain barriers cleared; custom incident configuration pending','Corner regions inferred from source AI radius'],counts:{nodes:159,raceNodes:129,pitNodes:30,edges:p.m_trackEdges.length,pitMappings:p.m_pitLaneMapping.length}};
}
module.exports={build};
if(require.main===module){const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Supply a new output JSON path');const result=build(__dirname);fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result.counts));}
