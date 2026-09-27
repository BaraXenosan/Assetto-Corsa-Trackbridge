'use strict';
const fs=require('node:fs');
const {buildCurves}=require('./project-fitted-markers');
const {evaluate,parameterAtDistance}=require('./native-spline');
const read=p=>JSON.parse(fs.readFileSync(p));
const fit=read('research/kalinago-fit03.json'),race=buildCurves(fit.race),pit=buildCurves(fit.pit);
const component=read('research/kalinago-component-garages02.json').Properties;
const objects=read('research/bahrain_properties01/properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json');
const patch=read('research/camera-layout03.json');
function point(ref){const c=ref.m_trackNodeID<129?race[ref.m_trackNodeID]:pit[ref.m_trackNodeID-130];const t=parameterAtDistance(c.samples.slice(1),ref.m_splineDistance,c.k[1]).parameter,p=evaluate(c.q,t,c.k),a=evaluate(c.q,t-.0001,c.k),b=evaluate(c.q,t+.0001,c.k),yaw=Math.atan2(b[1]-a[1],b[0]-a[0]),offset=ref.m_offRaceLineDistance??0;return {p:[p[0]-Math.sin(yaw)*offset,p[1]+Math.cos(yaw)*offset,p[2]],yaw:yaw*180/Math.PI};}
function sample(curves,spacing){const result=[];let base=0;for(let node=0;node<curves.length;node++){const c=curves[node],n=Math.ceil(c.lengthM/spacing);for(let j=0;j<n;j++){const d=j/n*c.lengthM,t=parameterAtDistance(c.samples.slice(1),d,c.k[1]).parameter;result.push({p:evaluate(c.q,t,c.k),node,d,chain:base+d});}base+=c.lengthM;}return result;}
const points=sample(race,10),pitPoints=sample(pit,10),xs=points.map(x=>x.p[0]),ys=points.map(x=>x.p[1]);
const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1.16;
const origin=[center[0]+span/2,center[1]-span/2],uv=p=>[(p[1]-origin[1])/span*340,(origin[0]-p[0])/span*340];
const fmt=p=>uv(p).map(x=>x.toFixed(3)).join(','),path=ps=>'M'+ps.map(x=>fmt(x.p)).join('L');
let cumulative=[0];for(const c of race)cumulative.push(cumulative.at(-1)+c.lengthM);
const zones=component.m_DRSZoneStart.map((start,i)=>({start:cumulative[start.m_trackNodeID]+start.m_splineDistance,end:cumulative[component.m_DRSZoneEnd[i].m_trackNodeID]+component.m_DRSZoneEnd[i].m_splineDistance}));
const inZone=(chain,z)=>z.end<z.start?chain>=z.start||chain<=z.end:chain>=z.start&&chain<=z.end;
let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340"><g id="Minimap">';
const road=path(points)+'Z';svg+=`<path id="track" d="${road}" fill="#15151e" fill-opacity=".18" stroke="#15151e" stroke-width="14" stroke-linejoin="round"/><path d="${road}" fill="none" stroke="#f7f4f1" stroke-opacity=".6" stroke-width="10" stroke-linejoin="round"/><path d="${road}" fill="none" stroke="#f7f4f1" stroke-width="3"/>`;
svg+=`<path id="pitlane" d="${path(pitPoints)}" fill="none" stroke="#aaa" stroke-width="2"/>`;
zones.forEach((z,i)=>{let selected=points.filter(p=>inZone(p.chain,z));if(z.end<z.start)selected=selected.filter(p=>p.chain>=z.start).concat(selected.filter(p=>p.chain<=z.end));const first=point(component.m_DRSZoneStart[i]).p,last=point(component.m_DRSZoneEnd[i]).p;svg+=`<path id="drs_zone_${i}" d="${path([{p:first},...selected,{p:last}])}" fill="none" stroke="#12c000" stroke-opacity=".4" stroke-width="8"/>`;const [x,y]=uv(point(component.m_DRSDetection[i]).p);svg+=`<g id="DRS_Zone${i?'-'+(i+1):''}"><circle cx="${x}" cy="${y}" r="3" fill="#12c000"/></g>`;});
const finish=uv(points[0].p);svg+=`<g id="Finish_Line" transform="translate(${finish})">`;for(let y=0;y<2;y++)for(let x=0;x<6;x++)svg+=`<rect x="${x*2-6}" y="${y*2-2}" width="2" height="2" fill="${(x+y)%2?'#fff':'#15151e'}"/>`;svg+='</g></g></svg>';
fs.writeFileSync('research/kalinago-minimap01.svg',svg,{flag:'wx'});
const mini=objects.findIndex(x=>x.Type==='MiniMapComponent');patch.exports.push({index:mini,name:objects[mini].Name,Properties:{RelativeLocation:{X:origin[0]*100,Y:origin[1]*100,Z:0},RelativeRotation:{Pitch:0,Yaw:90,Roll:0},RelativeScale3D:{X:span*100,Y:span*100,Z:span*100}}});
const full=objects.findIndex(x=>x.Type==='FullScreenMapComponent'),yaw=objects[full].Properties.RelativeRotation.Yaw*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw),scale=.25;
const mapPoint=p=>[scale*(c*(p[0]-center[0])-s*(p[1]-center[1])),scale*(s*(p[0]-center[0])+c*(p[1]-center[1])),-4997];
patch.exports.push({index:full,name:objects[full].Name,Properties:{FlattenMap:true,RelativeLocation:{X:-scale*(c*center[0]-s*center[1]),Y:-scale*(s*center[0]+c*center[1]),Z:-4995.1147}}});
const lines=[];for(let i=0;i<points.length;i++){let a=points[i],b=points[(i+1)%points.length];lines.push({a:mapPoint(a.p),b:mapPoint(b.p),kind:zones.some(z=>inZone(a.chain,z))?'drs':'road'});}for(let i=0;i<pitPoints.length-1;i++)lines.push({a:mapPoint(pitPoints[i].p),b:mapPoint(pitPoints[i+1].p),kind:'pit'});
fs.writeFileSync('research/map-layout01.json',JSON.stringify({installable:false,centerM:center,spanM:span,miniMapOriginM:origin,miniMapProjection:'u=(y-originY)/span; v=(originX-x)/span; stock Bahrain finish matches SVG within 3 pixels',lines},null,2),{flag:'wx'});
fs.writeFileSync('research/camera-map-layout01.json',JSON.stringify(patch,null,2),{flag:'wx'});
const anchors=read('tools/CookWorkspace/Content/TrackBridge/Authoring/anchors.json');
for(const m of anchors.markers)if(m.field==='m_garagePositions'){const v=point(component.m_garagePositions[m.index]);m.positionCm=v.p.map(x=>x*100);m.yaw=v.yaw;}
fs.writeFileSync('research/anchors-garages02.json',JSON.stringify(anchors,null,2),{flag:'wx'});
console.log('Map prepared',lines.length,'segments; garage anchors synchronized; runtime validation pending');

