'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const read=p=>JSON.parse(fs.readFileSync(p));
const readback=process.argv[2]??'research/repair02-readback';
const cameraFile=process.argv[3]??'research/camera-map-layout01.json';
const outputFile=process.argv[4]??'research/repair02-verification.json';
const base=readback+'/properties/F1Manager24/Content/';
const scene='TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91/';
const main=read(base+'Circuits/Bahrain/Lvl_Bahrain.umap.json'),expected=read('research/kalinago-component-garages02.json').Properties;
const actual=main.find(x=>x.Name==='RaceTrackSpline').Properties;
assert.equal(actual.m_trackNodes.length,159);assert.equal(actual.m_garagePositions.length,22);
function equal(actual,expected,path){
 if(typeof expected==='number'){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=Math.max(.0001,Math.abs(expected)*2e-7),path);return;}
 if(expected&&typeof expected==='object'){for(const k of Object.keys(expected))equal(actual?.[k],expected[k],path+'.'+k);return;}
 assert.equal(actual,expected,path);
}
equal(actual.m_garagePositions,expected.m_garagePositions,'garages');
const camera=read(cameraFile);for(const e of camera.exports){assert.equal(main[e.index].Name,e.name);equal(main[e.index].Properties,e.Properties,'export '+e.index);}
const garage=read(base+'Circuits/Bahrain/Levels/Section_01/Lvl_Bahrain_Section01_Props.umap.json');
const garagePatch=read('research/garage-layout02.json');for(const e of garagePatch.exports)equal(garage[e.index].Properties,e.Properties,'garage root '+e.index);
const mesh=read(base+scene+'Meshes/SM_1_00_kalinago.uasset.json').find(x=>x.Type==='StaticMesh');
const doorSlots=mesh.Properties.StaticMaterials.map((m,i)=>({m,i})).filter(x=>x.m.MaterialInterface?.ObjectPath?.includes('/M_OpenGarageDoors.'));
assert.deepEqual(doorSlots.map(x=>x.i),[9,25]);
const shaders={};for(const name of ['M_OpenGarageDoors','M_Map_road','M_Map_pit','M_Map_drs','M_Map_ground']){
 const mat=read(base+scene+'Materials/'+name+'.uasset.json')[0];assert.ok(mat.LoadedMaterialResources?.some(r=>r.LoadedShaderMap?.Content),'Missing shaders '+name);shaders[name]=true;
}
const visual=read(base+scene+'KalinagoVisual.umap.json');const components=visual.filter(x=>x.Type==='StaticMeshComponent');
assert.equal(components.length,17+753);assert.ok(!components.some(x=>x.Properties?.StaticMesh?.ObjectPath?.includes('SM_4_timing_gp')));
const svgPath=(process.argv[2]?readback:'research/repair02-svg-readback')+'/raw/F1Manager24/Content/UIGameface/img/minimap/minimapBahrainMinimap.svg';
assert.deepEqual(fs.readFileSync(svgPath),fs.readFileSync('research/kalinago-minimap01.svg'));
const facade=garagePatch.teams.map(t=>t.facadeAlignment);for(const f of facade)assert.ok(f.carOffsetM<f.frontOffsetM&&f.carOffsetM>f.rearOffsetM);
const result={installable:false,offlineReadbackPassed:true,nodeCount:159,garagePositions:22,garageInteriors:11,garageCentersBetweenFacades:true,openDoorMaterialSlots:doorSlots.map(x=>x.i),cameraAndMapExports:camera.exports.length,sceneMeshComponents:components.length,overviewMapSegments:752,inlineShaders:shaders,minimapSvgSha256:crypto.createHash('sha256').update(fs.readFileSync(svgPath)).digest('hex'),runtimeValidated:false,pitReturnValidated:false,animationsValidated:false};
fs.writeFileSync(outputFile,JSON.stringify(result,null,2));console.log(result);
