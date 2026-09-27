'use strict';
const fs=require('node:fs'),path=require('node:path');
const {buildCurves}=require('./project-fitted-markers');
const points=buildCurves(require('./research/kalinago-fit03.json').race,1).flatMap(c=>c.samples.filter((_,i)=>i%5===0).map(s=>[s.point[1],-s.point[0]]));
const min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...points.map(p=>p[k])));
const input='research/menu-maps-original01/raw/F1Manager24/Content/UIGameface/img/minimap',out='research/menu-icons-kalinago01';fs.mkdirSync(out);
const names=['Background','Large','LargeDark','Medium','Small','SmallDark','SmallLight'];
for(const name of names){
 const filename='minimapBahrain'+name+'.svg',source=fs.readFileSync(path.join(input,filename),'utf8');
 const view=source.match(/viewBox="([^"]+)"/)[1],size=view.split(' ').map(Number),w=size[2],h=size[3],margin=Math.max(w*.085,8);
 const scale=Math.min((w-2*margin)/(max[0]-min[0]),(h-2*margin)/(max[1]-min[1]));
 const xy=p=>[(p[0]-(min[0]+max[0])/2)*scale+w/2,(p[1]-(min[1]+max[1])/2)*scale+h/2];
 const d='M'+points.map(p=>xy(p).map(x=>x.toFixed(3)).join(',')).join('L')+'Z';
 const styles=source.match(/<defs>[\s\S]*?<\/defs>/)?.[0]??'';
 let body=name==='Background'?`<path id="track" d="${d}" fill="none" stroke="#fff" stroke-width="12"/>`:`<path id="track" class="cls-1" d="${d}"/><path id="track-2" class="cls-2" d="${d}"/>`;
 if(name==='Small')body=`<path id="track" d="${d}" fill="#15151e" fill-opacity=".25" stroke="#15151e" stroke-width="9"/><path id="track-2" d="${d}" fill="none" stroke="#e6e6e6" stroke-width="2"/>`;
 fs.writeFileSync(path.join(out,filename),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${styles}<g id="${name}">${body}</g></svg>`);
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({installable:false,variants:names,source:'kalinago-fit03',unmodified:['Minimap (already replaced in 1003)','Sectors','Speed'],runtimeVerified:false},null,2));
console.log('Prepared seven menu/card map variants');
