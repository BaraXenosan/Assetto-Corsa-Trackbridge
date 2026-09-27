const assert=require('node:assert/strict');
const {createRaceNodeMapper}=require('../camera-distance-mapping');
// The finish is NOT array element zero: the last element ends only partway through the lap.
const source=[{chainage:200,length:100},{chainage:300,length:100},{chainage:0,length:100},{chainage:100,length:100}];
const mapper=createRaceNodeMapper(source,2,[0,50,100,150,200,250,300,350,400]);
assert.equal(mapper.total,400);assert.deepEqual(source.map((_,i)=>mapper.map(i)),[4,6,0,2]);
assert.throws(()=>mapper.map(4),/Invalid/);assert.throws(()=>createRaceNodeMapper(source,2,[0,10,10,20]),/Invalid/);
const fs=require('fs'),raw=fs.readFileSync(require('path').join(__dirname,'../research/bahrain_live05/track-0-nodes.bin'));
const stock=Array.from({length:108},(_,i)=>({chainage:raw.readFloatLE(i*152+108),length:raw.readFloatLE(i*152+104)}));
const regression=createRaceNodeMapper(stock,106,Array.from({length:130},(_,i)=>i*50));
assert.ok(regression.total>5300&&regression.total<5400);assert.equal(regression.map(106),0);assert.ok(regression.map(1)<16);
console.log('Camera mapping: rotated finish, wrap, invalid input, Bahrain regression passed');
