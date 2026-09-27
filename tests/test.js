'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const B=require('../core.js');
function fixture(version=6,kind=2){const chunks=[];const bytes=b=>chunks.push(Buffer.from(b));const i=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);bytes(b);};const f=n=>{const b=Buffer.alloc(4);b.writeFloatLE(n);bytes(b);};const s=x=>{const b=Buffer.from(x);i(b.length);bytes(b);};const matrix=B.identity();matrix[12]=10;matrix[13]=2;matrix[14]=30;
bytes(Buffer.from('sc6969'));i(version);if(version===6)i(0);i(0);i(1);s('road');s('ksPerPixel');bytes([0,0]);i(0);i(1);s('ksDiffuse');Array(10).fill(.5).forEach(f);i(0);
i(1);s('ROOT');i(1);bytes([1]);matrix.forEach(f);i(kind);s('1ROAD_DEMO');i(0);bytes([1]);if(kind!==2)return Buffer.concat(chunks);bytes([1,1,0]);i(4);for(const p of [[0,0,0],[100,0,0],[100,0,70],[0,0,70]])[...p,0,1,0,p[0]/100,p[2]/70,1,0,0].forEach(f);i(6);const indices=Buffer.alloc(12);[0,2,1,0,3,2].forEach((n,k)=>indices.writeUInt16LE(n,k*2));bytes(indices);i(0);i(0);[0,10000,0,0,0,200].forEach(f);bytes([1]);return Buffer.concat(chunks);}
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
async function main(){let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const demo=fixture(),model=B.parseKn5(ab(demo));
test('v6 materials, root transform and topology',()=>{assert.equal(model.meshes.length,1);assert.deepEqual(Array.from(model.meshes[0].positions.slice(0,3)),[10,2,30]);assert.equal(model.meshes[0].indices.length,6);assert.equal(model.materials[0].properties[0].values.length,10);assert.equal(model.warnings.length,0);});
test('v5',()=>assert.equal(B.parseKn5(ab(fixture(5))).version,5));
test('truncated inputs rejected at several boundaries',()=>{for(const n of [0,6,10,20,60,100,demo.length-1])assert.throws(()=>B.parseKn5(ab(demo.subarray(0,n))));});
test('bad magic rejected',()=>assert.throws(()=>B.parseKn5(ab(Buffer.alloc(30))),/KN5/));
test('skinned mesh explicitly rejected',()=>assert.throws(()=>B.parseKn5(ab(fixture(6,3))),/Skinned/));
test('axis conversion and scale',()=>assert.deepEqual(B.mapPoint([1,2,3]),[100,300,200]));
test('yaw',()=>{const p=B.mapPoint([1,2,0],{scale:1,yaw:90});assert.ok(Math.abs(p[0])<1e-8);assert.equal(p[1],1);assert.equal(p[2],2);});
test('inverse transpose normal under shear',()=>{const m=B.identity();m[1]=2;const n=B.normal([0,1,0],m);assert.ok(Math.abs(n[0]*1+n[1]*2)<1e-8);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-8);});
test('matrix parent composition',()=>{const a=B.identity(),b=B.identity();a[12]=4;b[0]=2;assert.deepEqual(B.point([1,0,0],B.multiply(a,b)),[10,0,0]);});
test('OBJ winding, positions, normal and UV',()=>{const obj=B.exportObj(model);assert.match(obj,/v 1000 3000 200\n/);assert.match(obj,/f 1\/1\/1 2\/2\/2 3\/3\/3/);assert.match(obj,/vn 0 0 1/);assert.match(obj,/vt 0 1/);});
test('hidden filtering',()=>{const m=B.parseKn5(ab(demo));m.meshes[0].active=false;assert.ok(!B.exportObj(m).includes('\nf '));assert.ok(B.exportObj(m,{includeHidden:true}).includes('\nf '));});
test('INI positions and unsupported rotations',()=>{assert.deepEqual(B.parseModels('[MODEL_0]\nFILE=demo.kn5\nPOSITION=1,2,3')[0].position,[1,2,3]);assert.throws(()=>B.parseModels('[MODEL_0]\nFILE=x\nROTATION=0,90,0'),/ROTATION/);});
test('unsafe texture name sanitization',()=>assert.ok(!B.safeName('../../bad x').includes('/')));
test('CRC standard vector',()=>assert.equal(B.crc32(Buffer.from('123456789')),0xcbf43926));
const ai=Buffer.alloc(16+20*2);ai.writeInt32LE(7);ai.writeInt32LE(2,4);ai.writeFloatLE(1,16);ai.writeFloatLE(2,20);ai.writeFloatLE(3,24);ai.writeFloatLE(4,36);ai.writeFloatLE(5,40);ai.writeFloatLE(6,44);
test('AI v7 coordinate records',()=>{const line=B.parseAi(ab(ai));assert.deepEqual(line.points[1].p,[4,5,6]);assert.equal(line.ignoredBytes,0);assert.throws(()=>B.parseAi(ab(ai.subarray(0,20))));});
test('ZIP traversal and duplicate paths rejected',()=>{assert.throws(()=>B.zip([{name:'../x',data:'x'}]));assert.throws(()=>B.zip([{name:'a',data:'x'},{name:'a',data:'y'}]));});
fs.mkdirSync(path.join(__dirname,'../demo'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../demo/demo.kn5'),demo);fs.writeFileSync(path.join(__dirname,'../demo/fast_lane.ai'),ai);fs.writeFileSync(path.join(__dirname,'../demo/models.ini'),'[MODEL_0]\nFILE=demo.kn5\nPOSITION=0,0,0\nROTATION=0,0,0\n');fs.writeFileSync(path.join(__dirname,'../demo/README.txt'),'Synthetic format test: one flat rectangle and two AI points. Not a real track.\n');
fs.writeFileSync(path.join(require('node:os').tmpdir(),'trackbridge_test_export.zip'),Buffer.from(await B.zip([{name:'model.obj',data:B.exportObj(model)},{name:'тест.txt',data:'Проверка ZIP'}]).arrayBuffer()));console.log(count+' tests passed');}
main().catch(e=>{console.error(e);process.exit(1);});
