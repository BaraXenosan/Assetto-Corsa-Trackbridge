'use strict';
// Map camera coverage by travelled distance, retaining the native camera actors.
const fs=require('node:fs');
const {buildCurves}=require('./project-fitted-markers');
const {createRaceNodeMapper}=require('./camera-distance-mapping');
const read=p=>JSON.parse(fs.readFileSync(p));
const objects=read('research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json');
const fit=read('research/kalinago-fit03.json'), raw=fs.readFileSync('research/bahrain_live05/track-0-nodes.bin');
const curves=buildCurves(fit.race), chain=[0];for(const c of curves)chain.push(chain.at(-1)+c.lengthM);
const mapper=createRaceNodeMapper(Array.from({length:108},(_,i)=>({chainage:raw.readFloatLE(i*0x98+0x6c),length:raw.readFloatLE(i*0x98+0x68)})),106,chain);
function remap(n){
 if(n>=108)return 130+Math.min(27,Math.max(0,Math.round((n-109)/14*27)));
 return mapper.map(n);
}
const changes=new Map(),coverage=[];
function patch(i,p){changes.set(i,{index:i,name:objects[i].Name,Properties:{...(changes.get(i)?.Properties??{}),...p}});}
const nodes=fit.topology.positionsCm;
for(let i=0;i<objects.length;i++){
 const o=objects[i],p=o.Properties??{};
 if(o.Type==='RaceSimCameraComponent'&&p.TrackNodeID!==undefined){
  const start=remap(p.TrackNodeID),end=remap(p.LastTrackNodeID??p.TrackNodeID);
  const fields={TrackNodeID:start,...(p.LastTrackNodeID!==undefined?{LastTrackNodeID:end}:{})};
  if(p.BehaviourSettings?.length)fields.BehaviourSettings=p.BehaviourSettings.map(()=>({
   TrackingSettings:{TrackingMethod:'ETrackingMethod::Follow',HasLatePickup:false,HasDropOffPoint:false,RelativeOffset:{X:0,Y:0,Z:100}},
   ZoomSettings:{ZoomMethod:'EZoomMethod::Automatic',TargetViewHeight:1400,ShouldInterpZoom:true,ZoomInterpSpeed:8},ShouldFinishCompleteShot:false
  }));
  patch(i,fields);
  const rootIndex=Number(p.AttachParent?.ObjectPath.split('.').at(-1)),root=objects[rootIndex];
  if(root?.Properties?.RelativeLocation){
   const middle=start<129?(start+Math.floor(((end-start+129)%129)/2))%129:Math.floor((start+end)/2);
   const pos=nodes[middle],next=nodes[middle<129?(middle+1)%129:Math.min(middle+1,158)],yaw=Math.atan2(next.Y-pos.Y,next.X-pos.X);
   const offset=middle<129?5500:3500,height=middle<129?2200:1500;
   patch(rootIndex,{RelativeLocation:{X:pos.X-Math.sin(yaw)*offset,Y:pos.Y+Math.cos(yaw)*offset,Z:pos.Z+height},...(root.Properties.RelativeRotation?{RelativeRotation:{Pitch:-Math.atan2(height,offset)*180/Math.PI,Yaw:yaw*180/Math.PI-90,Roll:0}}:{})});
  }
  coverage.push({camera:o.Outer?.ObjectName,start,end});
 }
 if(o.Type==='RaceSimHelicamPositionComponent'){
  const n=remap(p.StartNodeID??0),pos=nodes[n];patch(i,{StartNodeID:n,RelativeLocation:{X:pos.X,Y:pos.Y,Z:pos.Z+12000}});
 }
}
const result={installable:false,sourceLapLengthM:mapper.total,exports:[...changes.values()],coverage,limitations:['Runtime shots and occlusion require validation','Spline cinematics and full-screen map are separate from trackside cameras']};
fs.writeFileSync(process.argv[2]??'research/camera-layout04.json',JSON.stringify(result,null,2),{flag:'wx'});
console.log('Prepared',result.exports.length,'camera edits with distance-based coverage and automatic zoom');
