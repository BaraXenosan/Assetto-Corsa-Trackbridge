'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {readAiSource}=require('../kalinago-source'),{readCsv}=require('../race-adapter');
const root=path.join(__dirname,'../sources/kalinago_v092/content/tracks/00_kalinago/gp_2024/ai');
for(const name of ['fast_lane','pit_lane']){
 const bytes=fs.readFileSync(path.join(root,name+'.ai')),original=Buffer.from(bytes),ai=readAiSource(bytes);
 const csv=readCsv(fs.readFileSync(path.join(__dirname,'../build_kalinago_gp2024/lines/'+name+'.ai.csv'),'utf8'));
 assert.equal(ai.count,csv.length);assert.equal(ai.extraCount,ai.count);assert.deepEqual(bytes,original);
 ai.points.forEach((p,i)=>{
  const transformed=[p.positionM[0]*100,p.positionM[2]*100,p.positionM[1]*100];
  for(let j=0;j<3;j++)assert(Math.abs(transformed[j]-csv[i].positionCm[j])<1e-8);
  assert.equal(p.distanceM,csv[i].sourceDistanceM);assert.equal(p.id,csv[i].sourceId);
 });
 assert.throws(()=>readAiSource(bytes.subarray(0,16+ai.count*20+4+ai.count*72-1)),/Truncated/);
 const badCount=Buffer.from(bytes);badCount.writeInt32LE(ai.count+1,16+ai.count*20);assert.throws(()=>readAiSource(badCount),/count/);
 const badVersion=Buffer.from(bytes);badVersion.writeInt32LE(8,0);assert.throws(()=>readAiSource(badVersion),/version/);
 console.log('PASS '+name+': all source points match CSV, extra records parsed, invalid inputs rejected, original unchanged');
}
