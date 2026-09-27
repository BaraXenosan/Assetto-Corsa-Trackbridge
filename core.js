/* AC TrackBridge 0.2 — original implementation, MIT. */
(function(root){
'use strict';
const te=new TextEncoder(), td=new TextDecoder();
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b){const c=Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)c[i*4+j]+=a[i*4+k]*b[k*4+j];return c;}
function point(p,m){return [0,1,2].map(j=>p[0]*m[j]+p[1]*m[4+j]+p[2]*m[8+j]+m[12+j]);}
function det(m){return m[0]*(m[5]*m[10]-m[6]*m[9])-m[1]*(m[4]*m[10]-m[6]*m[8])+m[2]*(m[4]*m[9]-m[5]*m[8]);}
function normal(p,m){const d=det(m);if(Math.abs(d)<1e-12)throw Error('Вырожденная матрица узла');const a=m[0],b=m[1],c=m[2],e=m[4],f=m[5],g=m[6],h=m[8],i=m[9],j=m[10];const q=[((f*j-g*i)*p[0]+(c*i-b*j)*p[1]+(b*g-c*f)*p[2])/d,((g*h-e*j)*p[0]+(a*j-c*h)*p[1]+(c*e-a*g)*p[2])/d,((e*i-f*h)*p[0]+(b*h-a*i)*p[1]+(a*f-b*e)*p[2])/d];const l=Math.hypot(...q)||1;return q.map(v=>v/l);}
function safeName(s){return String(s).replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'_').slice(0,100)||'asset';}
class Reader{
 constructor(buffer){this.b=new Uint8Array(buffer);this.v=new DataView(buffer);this.p=0;}
 take(n){if(!Number.isSafeInteger(n)||n<0||this.p+n>this.b.length)throw Error('Повреждённый или неподдерживаемый файл, смещение '+this.p);const p=this.p;this.p+=n;return p;}
 u8(){return this.v.getUint8(this.take(1));} i32(){return this.v.getInt32(this.take(4),true);} u32(){return this.v.getUint32(this.take(4),true);}
 f(){const x=this.v.getFloat32(this.take(4),true);if(!Number.isFinite(x))throw Error('Некорректная координата');return x;}
 count(max=1000000){const n=this.u32();if(n>max)throw Error('Превышен лимит элементов: '+n);return n;}
 str(){const n=this.count(1048576);return td.decode(this.b.subarray(this.take(n),this.p));}
 bytes(n){const p=this.take(n);return this.b.subarray(p,p+n);} floats(n){return Array.from({length:n},()=>this.f());}
}
function parseKn5(buffer){
 const r=new Reader(buffer);if(td.decode(r.bytes(6))!=='sc6969')throw Error('Это не обычный KN5 (возможно, защищённый CSP-файл)');
 const version=r.i32();if(![5,6].includes(version))throw Error('Поддерживаются KN5 v5/v6, получена v'+version);if(version===6)r.i32();
 const textures=[],materials=[],meshes=[],anchors=[],warnings=[];let total=0,nodes=0;
 for(let n=r.count(20000);n--;){const active=r.i32(),name=r.str(),size=r.count(512*1024*1024);textures.push({name,active,data:r.bytes(size)});}
 for(let n=r.count(100000);n--;){const name=r.str(),shader=r.str(),blend=r.u8(),alphaTest=r.u8(),depth=r.i32(),properties=[],slots=[];
  for(let k=r.count(10000);k--;)properties.push({name:r.str(),values:r.floats(10)});
  for(let k=r.count(10000);k--;)slots.push({name:r.str(),slot:r.i32(),texture:r.str()});
  materials.push({name,shader,blend,alphaTest,depth,properties,slots});
 }
 function node(parent,enabled,level){
  if(level>128||++nodes>1000000)throw Error('Слишком сложная иерархия');
  const type=r.i32(),name=r.str(),children=r.count(100000),active=Boolean(r.u8())&&enabled;let world=parent;
  if(type===1){world=multiply(r.floats(16),parent);anchors.push({name,active,position:point([0,0,0],world),matrix:world});}
  else if(type===2){const castShadows=r.u8(),visible=r.u8(),transparent=r.u8(),n=r.count(10000000);total+=n;if(total>12000000)throw Error('Лимит: 12 млн вершин на модель');
   r.take(n*44);const start=r.p-n*44;const positions=new Float32Array(n*3),normals=new Float32Array(n*3),uvs=new Float32Array(n*2);
   const end=r.p;r.p=start;
   for(let i=0;i<n;i++){positions.set(point(r.floats(3),world),i*3);normals.set(normal(r.floats(3),world),i*3);uvs.set(r.floats(2),i*2);r.take(12);}r.p=end;
   const ni=r.count(60000000);if(ni%3)throw Error('Некратное трём число индексов');r.take(ni*2);const indices=new Uint16Array(ni);const startI=r.p-ni*2;for(let i=0;i<ni;i++){indices[i]=r.v.getUint16(startI+i*2,true);if(indices[i]>=n)throw Error('Индекс за пределами меша');}
   const material=r.i32(),layer=r.i32(),lod=r.floats(2),sphere=r.floats(4),renderable=r.u8();
   if(material<0||material>=materials.length)throw Error('Неизвестный материал меша');
   if(det(world)<0)for(let i=0;i<ni;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
   meshes.push({name,active,visible,renderable,castShadows,transparent,material,layer,lod,sphere,positions,normals,uvs,indices});
  }else throw Error(type===3?'Skinned mesh не поддерживается; модель не экспортирована':'Неизвестный тип узла '+type);
  for(let i=0;i<children;i++)node(world,active,level+1);
 }
 node(identity(),true,0);if(r.p!==r.b.length)warnings.push('После дерева KN5 есть '+(r.b.length-r.p)+' дополнительных байт. Расширения не интерпретированы.');
 return {version,textures,materials,meshes,anchors,warnings};
}
function parseAi(buffer){const r=new Reader(buffer),version=r.i32();if(version!==7)throw Error('AI: поддерживается только базовая геометрия v7');const count=r.count(1000000),lapTime=r.i32(),sampleCount=r.i32();if(count<2)throw Error('AI: недостаточно точек');r.take(count*20);r.p-=count*20;const points=[];for(let i=0;i<count;i++){const p=r.floats(3),distance=r.f(),id=r.i32();points.push({p,distance,id});}return {version,lapTime,sampleCount,points,ignoredBytes:r.b.length-r.p};}
function parseModels(text){const sections=[];let current=null;for(let line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){line=line.trim();if(!line||line.startsWith(';')||line.startsWith('#'))continue;const h=line.match(/^\[([^\]]+)\]/);if(h){current={section:h[1]};sections.push(current);}else if(current){const i=line.indexOf('=');if(i>=0)current[line.slice(0,i).trim().toUpperCase()]=line.slice(i+1).trim();}}
 return sections.filter(x=>/^MODEL_\d+$/i.test(x.section)).map(x=>{const vector=k=>(x[k]||'0,0,0').split(',').map(Number);const position=vector('POSITION'),rotation=vector('ROTATION');if(position.length!==3||rotation.length!==3||![...position,...rotation].every(Number.isFinite))throw Error('Некорректные координаты в models.ini');if(rotation.some(v=>Math.abs(v)>1e-7))throw Error('Ненулевой ROTATION в '+x.section+' пока не поддерживается');if(!x.FILE)throw Error('Нет FILE в '+x.section);return {file:x.FILE.replace(/\\/g,'/'),position,rotation};});
}
function mapPoint(p,options={}){const scale=options.scale??100,yaw=(options.yaw||0)*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);const x=p[0],y=p[2],z=p[1];return [(x*c-y*s)*scale,(x*s+y*c)*scale,z*scale];}
const fmt=v=>Number(v.toFixed(6)).toString();
function shouldExportMesh(m,options={}){
 if(options.mode==='collision')return m.active&&/^\d+[_a-z]/i.test(m.name);
 return options.includeHidden||Boolean(m.active&&m.visible&&m.renderable);
}
function* exportObjChunks(model,options={},offset=[0,0,0]){
 let lines=['# TrackBridge. Unreal-oriented centimetres: X=AC X, Y=AC Z, Z=AC Y.','mtllib model.mtl'],base=1;
 for(let k=0;k<model.meshes.length;k++){const m=model.meshes[k];if(!shouldExportMesh(m,options))continue;
 lines.push('o '+safeName(m.name)+'_'+k,'usemtl material_'+m.material);
 for(let i=0;i<m.positions.length;i+=3){lines.push('v '+mapPoint([m.positions[i]+offset[0],m.positions[i+1]+offset[1],m.positions[i+2]+offset[2]],options).map(fmt).join(' '));if(lines.length>=4096){yield lines.join('\n')+'\n';lines=[];}}
 for(let i=0;i<m.uvs.length;i+=2){lines.push('vt '+fmt(m.uvs[i])+' '+fmt(1-m.uvs[i+1]));if(lines.length>=4096){yield lines.join('\n')+'\n';lines=[];}}
 for(let i=0;i<m.normals.length;i+=3){lines.push('vn '+mapPoint(Array.from(m.normals.subarray(i,i+3)),{scale:1,yaw:options.yaw}).map(fmt).join(' '));if(lines.length>=4096){yield lines.join('\n')+'\n';lines=[];}}
 for(let i=0;i<m.indices.length;i+=3){const f=[m.indices[i],m.indices[i+2],m.indices[i+1]].map(v=>v+base);lines.push('f '+f.map(v=>v+'/'+v+'/'+v).join(' '));if(lines.length>=4096){yield lines.join('\n')+'\n';lines=[];}}base+=m.positions.length/3;
 }
 if(lines.length)yield lines.join('\n')+'\n';
}
function exportObj(model,options={},offset=[0,0,0]){return Array.from(exportObjChunks(model,options,offset)).join('');}
function materialExport(model){const paths=model.textures.map((t,i)=>'textures/'+i+'_'+safeName(t.name));let text='# Approximate diffuse only. AC shader settings in materials.json.\n';model.materials.forEach((m,i)=>{text+='newmtl material_'+i+'\nKd 1 1 1\n';const slot=m.slots.find(s=>s.name.toLowerCase()==='txdiffuse');if(slot){const ti=model.textures.findIndex(t=>t.name===slot.texture);if(ti>=0)text+='map_Kd '+paths[ti]+'\n';}text+='\n';});return {text,paths};}
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(entries){if(entries.length>65535)throw Error('Слишком много файлов ZIP');const parts=[],central=[];let offset=0,cdSize=0;const names=new Set();for(const e of entries){if(names.has(e.name)||e.name.split('/').includes('..')||e.name.startsWith('/'))throw Error('Небезопасное или повторное имя ZIP');names.add(e.name);const name=te.encode(e.name),data=typeof e.data==='string'?te.encode(e.data):e.data;if(offset+data.length>768*1024*1024)throw Error('Экспорт превышает 768 МБ; обрабатывайте модели отдельно');const crc=crc32(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,data);
 const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);cdSize+=c.length;offset+=h.length+data.length;}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,cdSize,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
}
const api={exportObjChunks,shouldExportMesh,parseKn5,parseAi,parseModels,mapPoint,exportObj,materialExport,zip,crc32,identity,multiply,point,normal,safeName};if(typeof module!=='undefined')module.exports=api;else root.TrackBridge=api;
})(globalThis);
