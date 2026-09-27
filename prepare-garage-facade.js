'use strict';
const fs=require('node:fs');const {buildCurves,projectMarker}=require('./project-fitted-markers');
const read=p=>JSON.parse(fs.readFileSync(p));
const pit=buildCurves(read('research/kalinago-fit03.json').pit),layout=read('research/garage-layout02.json'),component=read('research/kalinago-component-garages02.json');
const original=read('research/pit-actors01/properties/F1Manager24/Content/Circuits/Bahrain/Levels/Section_01/Lvl_Bahrain_Section01_Props.umap.json');
const mesh=read('research/garage-mesh-bounds01/properties/F1Manager24/Content/Environment/Props/PitLanes/PitGarage/Models/SM_PitGarage_Large.uasset.json').find(x=>x.Type==='StaticMesh').Properties.ExtendedBounds;
for(let k=0;k<layout.exports.length;k++){
 const edit=layout.exports[k],team=layout.teams[k],r=edit.Properties;
 const base=original.find(x=>x.Name==='BaseMesh'&&x.Outer?.ObjectName?.endsWith('.'+team.actor+"'"));if(!base)throw Error('Missing garage base');
 const o=base.Properties.RelativeLocation,t=r.RelativeRotation.Yaw*Math.PI/180,c=Math.cos(t),s=Math.sin(t),corners=[];
 for(const dx of [-1,1])for(const dy of [-1,1]){const x=mesh.Origin.X+dx*mesh.BoxExtent.X+o.X,y=mesh.Origin.Y+dy*mesh.BoxExtent.Y+o.Y;corners.push([(r.RelativeLocation.X+c*x-s*y)/100,(r.RelativeLocation.Y+s*x+c*y)/100,team.targetCenterM[2]]);}
 const before=corners.map(p=>projectMarker(p,pit).signedLeftOffsetM),shift=team.facadeAlignment.frontOffsetM-.35-Math.max(...before);
 const normal=[-s,c];r.RelativeLocation.X+=normal[0]*shift*100;r.RelativeLocation.Y+=normal[1]*shift*100;
 for(let i=0;i<2;i++)component.Properties.m_garagePositions[team.team*2+i].m_offRaceLineDistance+=shift;
 team.targetCenterM[0]+=normal[0]*shift;team.targetCenterM[1]+=normal[1]*shift;
 const after=corners.map(p=>projectMarker([p[0]+normal[0]*shift,p[1]+normal[1]*shift,p[2]],pit).signedLeftOffsetM);
 if(Math.max(...after)>team.facadeAlignment.frontOffsetM-.2||Math.min(...after)<team.facadeAlignment.rearOffsetM)throw Error('Garage does not fit between facades');
 team.meshFacadeAlignment={beforeMinM:Math.min(...before),beforeMaxM:Math.max(...before),shiftM:shift,afterMinM:Math.min(...after),afterMaxM:Math.max(...after),clearanceM:team.facadeAlignment.frontOffsetM-Math.max(...after)};
}
layout.limitations=['Mesh bounding box aligned 35 cm behind facade; doorway pillars and animations require visual verification'];
fs.writeFileSync('research/garage-layout03.json',JSON.stringify(layout,null,2),{flag:'wx'});fs.writeFileSync('research/kalinago-component-garages03.json',JSON.stringify(component,null,2),{flag:'wx'});
console.log('Aligned 11 interior mesh fronts with garage facade');
