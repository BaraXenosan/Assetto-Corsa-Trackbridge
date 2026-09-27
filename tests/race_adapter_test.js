'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {readCsv,makeLine,project,transform,gateCrossings,adapt}=require('../race-adapter');
const root=path.join(__dirname,'../build_kalinago_gp2024');
const config=JSON.parse(fs.readFileSync(path.join(root,'trackbridge-project.json')));
const race=readCsv(fs.readFileSync(path.join(root,'lines/fast_lane.ai.csv'),'utf8'));
const pit=readCsv(fs.readFileSync(path.join(root,'lines/pit_lane.ai.csv'),'utf8'));
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('CSV rejects missing values and non-monotonic distance',()=>{
  assert.throws(()=>readCsv('index,x,y,z,source_distance_m,source_id\n0,,1,2,0,0'),/Invalid CSV row/);
  assert.throws(()=>readCsv('index,x,y,z,source_distance_m,source_id\n0,0,0,0,1,0\n1,1,0,0,0,1'),/Non-monotonic/);
});
test('Axis transformation uses metres once and puts AC Y into Unreal Z',()=>{
  assert.deepEqual(transform([1,2,3],config.transform),[100,300,200]);
  assert.throws(()=>transform([1,2,3],{...config.transform,scale:1}),/requires/);
});
test('Gate intersection uses the gate segment and rejects another elevation',()=>{
  const l=makeLine([{positionCm:[0,0,0]},{positionCm:[1000,0,0]}],false);
  const h=gateCrossings(l,[200,-100,0],[200,300,0]);
  assert.equal(h.length,1);assert.equal(h[0].chainageM,2);
  assert.equal(gateCrossings(l,[200,100,0],[200,300,0]).length,0);
  assert.equal(gateCrossings(l,[200,-100,1000],[200,300,1000]).length,0);
  assert.equal(project(l,[300,400,0]).distanceM,4);
});
test('Real Kalinago gates, open pit lane and installation guard',()=>{
  const a=adapt(config,race,pit);
  assert.equal(a.installable,false);assert.equal(a.pit.closed,false);
  assert(Math.abs(a.race.polylineLengthM-5717.0059111)<1e-5);
  assert(Math.abs(a.timingGates[1].lapDistanceM-1939.57681)<1e-4);
  assert(Math.abs(a.timingGates[2].lapDistanceM-3678.46751)<1e-4);
  assert(a.pit.entryProjection.distanceM<.1);assert(a.pit.exitProjection.distanceM<.3);
  assert(!JSON.stringify(a).includes('"m_splineDistance":'));
  assert.equal(a.drs[1].wrapsStartFinish,true);
});
test('Reversed AI direction fails sector order',()=>assert.throws(()=>adapt(config,[...race].reverse(),pit),/Sector order/));
test('Ambiguous or missing timing gate fails closed',()=>{
  const c=structuredClone(config);c.timingGates[1].left=[1e6,0,1e6];c.timingGates[1].right=[1e6+1,0,1e6];
  assert.throws(()=>adapt(c,race,pit),/exactly once/);
});
test('Untransformed metre CSV cannot be treated as centimetres',()=>assert.throws(()=>adapt({...config,coordinateUnits:'metres'},race,pit),/centimetre/));
test('Runtime calibration changes unit evidence but never makes source samples installable',()=>{
 const calibration=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/native-spline-verification.json')));
 const a=adapt(config,race,pit,calibration);
 assert.equal(a.installable,false);assert.equal(a.units.nativeSplineDistances,'m from start of native segment');
 assert.equal(a.nativeCurve.sourceSamplesAreNotFinalNativeNodes,true);
 assert.throws(()=>adapt(config,race,pit,{...calibration,evidence:{}}),/calibration/);
});
console.log(checks+' adapter checks passed');
