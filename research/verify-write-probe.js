'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=__dirname,p='properties/F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap.json';
const read=d=>JSON.parse(fs.readFileSync(path.join(base,d,p)));
const original=read('bahrain_properties01'),roundtrip=read('bahrain_roundtrip_probe03'),edited=read('bahrain_edit_probe01');
const differences=[];
function diff(a,b,p){
 if(JSON.stringify(a)===JSON.stringify(b))return;
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'.'+k);
 }else differences.push({path:p,before:a,after:b});
}
diff(original,roundtrip,'exports');
assert.equal(differences.length,2);
assert(differences.every(d=>/^exports\.[23]\.CookedFormatData\.PhysXPC\.OffsetInFile$/.test(d.path)));
const before=original.find(o=>o.Type==='RaceSimTrackComponent'),after=edited.find(o=>o.Type==='RaceSimTrackComponent');
assert.equal(before.Properties.m_trackNodes[0].m_maxSpeed,400);
assert.equal(after.Properties.m_trackNodes[0].m_maxSpeed,399);
after.Properties.m_trackNodes[0].m_maxSpeed=400;
assert.deepEqual(before,after);
const manifest=JSON.parse(fs.readFileSync(path.join(base,'bahrain_edit_probe01/manifest.json')));
assert.equal(manifest.results[0].container,'TrackBridge_Bahrain_Probe_P.utoc');
const report={installable:false,unchangedRoundtrip:{exports:208,differences},editProbe:{container:manifest.results[0].container,field:'RaceTrackSpline.m_trackNodes[0].m_maxSpeed',before:400,after:399,allOtherRaceSimFieldsEqual:true},inGameTest:false};
fs.writeFileSync(path.join(base,'write-pipeline-verification.json'),JSON.stringify(report,null,2));
console.log('Roundtrip and independent edited IoStore read verified');
