'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fit,prepareRace}=require('../fit-track'),{buildCurves,projectMarker}=require('../project-fitted-markers');
const circle=Array.from({length:120},(_,i)=>[30*Math.cos(i*Math.PI/60),30*Math.sin(i*Math.PI/60),0]);
const round=fit(circle,{mandatory:[17,61],initialSpacingM:30,toleranceM:.1,maxNodes:60});
assert(round.passed);assert(round.nodes.some(n=>n.sourceIndex===17));assert(round.nodes.some(n=>n.sourceIndex===61));
const constrained=fit(circle,{initialSpacingM:1000,toleranceM:.001,maxNodes:4});assert.equal(constrained.passed,false);
assert.throws(()=>fit(circle,{mandatory:[999]}),/mandatory/);
const line=fit(Array.from({length:101},(_,i)=>[i,0,0]),{closed:false,maxNodes:10});
assert(line.passed);assert.equal(line.nodes[0].sourceIndex,0);assert.equal(line.nodes.at(-1).sourceIndex,100);
const hit=projectMarker([42,3,2],buildCurves(line));
assert(Math.abs(hit.positionM[0]-42)<1e-4);assert(Math.abs(hit.signedLeftOffsetM-3)<1e-8);assert(Math.abs(hit.heightDifferenceM-2)<1e-8);
const a=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/kalinago-race-adapter02.json')));
const f=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/kalinago-fit03.json'))),prepared=prepareRace(a);
assert(prepared.items[0].labels.includes('timing-0'));
for(const label of ['timing-0','timing-1','timing-2','pit-entry','pit-exit'])assert(f.race.nodes.some(n=>n.labels.includes(label)));
// Independently tighten the curve sampling fivefold with fixed selected controls.
const race=fit(prepared.items.map(p=>p.positionM),{mandatory:f.race.nodes.map(n=>n.sourceIndex),maxNodes:f.race.nodeCount,initialSpacingM:1e9,sampleStepM:.1});
const pitPoints=f.pit.preparedSource.map(p=>p.positionM);
pitPoints[0]=f.pit.nodes[0].positionM;pitPoints[pitPoints.length-1]=f.pit.nodes.at(-1).positionM;
const pit=fit(pitPoints,{closed:false,mandatory:f.pit.nodes.map(n=>n.sourceIndex),maxNodes:f.pit.nodeCount,initialSpacingM:1e9,sampleStepM:.1,endpointControls:f.pit.endpointControls});
assert(race.passed);assert(pit.passed);
assert(f.pit.sourceEndpointAdjustmentsM.every(d=>d<.5));
const topology=f.topology;
assert.deepEqual(topology.positionsCm[topology.pitEntryRaceNode],topology.positionsCm[topology.pitEntryNode]);
assert.deepEqual(topology.positionsCm[topology.pitExitRaceNode],topology.positionsCm[topology.pitExitNode]);
assert.equal(topology.raceNodeCount+topology.pitNodeCount,topology.positionsCm.length);
assert.equal(topology.pitLastGhostNode,topology.positionsCm.length-1);
assert.equal(f.installable,false);
const triggerReport=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/kalinago-pit-triggers01.json')));
for(const trigger of triggerReport.triggers){
 const node=f.pit.nodes.find(n=>n.labels.includes('pit-zone-'+trigger.type));
 assert(node);assert.deepEqual(node.positionM,trigger.positionM);
}
console.log(JSON.stringify({passed:true,denseRaceErrorM:race.maxErrorM,densePitErrorM:pit.maxErrorM,mandatoryAnchors:5}));
