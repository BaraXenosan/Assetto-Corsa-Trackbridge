const assert=require('node:assert/strict'),P=require('../project.js'),B=require('../core.js');let n=0;function test(name,f){f();n++;console.log('PASS',name);}
test('DRS wrap across lap zero',()=>{const x=P.drsZones('[ZONE_0]\nDETECTION=0.95\nSTART=0.993\nEND=0.064')[0];assert.equal(x.wrapsStartFinish,true);assert.equal(x.start,.993);});
test('invalid DRS rejected',()=>assert.throws(()=>P.drsZones('[ZONE_0]\nSTART=2\nEND=0'),/DRS/));
test('polyline length and optional closing segment stay distinct',()=>{const x=P.lineStats([{p:[0,0,0]},{p:[3,0,0]},{p:[3,4,0]}]);assert.equal(x.polylineLengthM,7);assert.equal(x.endpointGapM,5);assert.equal(x.lengthWithClosingSegmentM,12);});
test('timing gates pair by name',()=>{const x=P.timingGates([{name:'AC_TIME_2_R',position:[4,2,0]},{name:'AC_TIME_2_L',position:[0,0,0]},{name:'AC_TIME_1_L',position:[0,0,0]}]);assert.equal(x.length,1);assert.deepEqual(x[0].midpoint,[2,1,0]);});
test('layout resolution prefers sibling of INI',()=>{const x=P.auditLayout([{file:'x.kn5'}],['a/x.kn5','b/x.kn5'],'b/models.ini')[0];assert.equal(x.status,'ok');assert.deepEqual(x.matches,['b/x.kn5']);});
test('missing and ambiguous dependencies',()=>{const x=P.auditLayout([{file:'x.kn5'},{file:'missing.kn5'}],['a/x.kn5','b/x.kn5']);assert.equal(x[0].status,'ambiguous');assert.equal(x[1].status,'missing');});
test('physical road remains exported when nonrenderable',()=>{const m={name:'1_trackp',active:true,visible:1,renderable:0};assert.equal(B.shouldExportMesh(m),false);assert.equal(B.shouldExportMesh(m,{mode:'collision'}),true);assert.equal(B.shouldExportMesh({...m,active:false},{mode:'collision'}),false);assert.equal(B.shouldExportMesh({...m,name:'decorative'},{mode:'collision'}),false);});
console.log(n+' project tests passed');
