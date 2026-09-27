'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {safeName}=require('./core');
const [exportRoot,textureDir,out]=process.argv.slice(2);
if(!out||fs.existsSync(out))throw Error('Usage: node prepare-materials.js EXPORT_DIRECTORY TEXTURE_DIRECTORY NEW_OUTPUT.json');
const textureManifestFile=path.join(textureDir,'texture-manifest.json'),textureBytes=fs.readFileSync(textureManifestFile),textures=JSON.parse(textureBytes);
if(textures.failures.length)throw Error('Texture preparation has failures');
const materials=[],unresolved=[],shaderCounts={},sources=[];
for(const dir of fs.readdirSync(path.join(exportRoot,'models'))){
 const file=path.join(exportRoot,'models',dir,'materials.json');if(!fs.existsSync(file))continue;
 const bytes=fs.readFileSync(file),source=JSON.parse(bytes);
 sources.push({path:path.resolve(file),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const local=textures.textures.filter(t=>t.relativeSource.startsWith('models/'+dir+'/textures/'));
 for(const [index,m] of source.entries()){
  shaderCounts[m.shader]=(shaderCounts[m.shader]??0)+1;
  const slots=m.slots.map(slot=>{
   const candidates=local.filter(t=>path.basename(t.relativeSource).replace(/^\d+_/,'')===safeName(slot.texture));
   const unique=[...new Set(candidates.map(t=>t.sourceSha256))];
   if(unique.length!==1){unresolved.push({model:dir,material:index,slot:slot.name,texture:slot.texture,reason:unique.length?'ambiguous-local-texture':'no-local-texture'});return {...slot,resolved:false};}
   const t=candidates[0];return {...slot,resolved:true,png:path.resolve(textureDir,t.png),sourceSha256:t.sourceSha256,width:t.width,height:t.height};
  });
  materials.push({model:dir,index,objMaterialName:'material_'+index,name:m.name,sourceShader:m.shader,sourceBlend:m.blend,sourceAlphaTest:m.alphaTest,sourceDepth:m.depth,properties:m.properties,slots});
 }
}
const report={installable:false,materials,unresolved,shaderCounts,textureManifest:{path:path.resolve(textureManifestFile),sha256:crypto.createHash('sha256').update(textureBytes).digest('hex')},sources,
 limitations:['Source shader parameters are preserved, not translated to equivalent Unreal shading','Only unambiguous model-local textures are resolved; cross-model texture lookup is not guessed','Alpha, two-sided foliage, normal orientation and custom AC shaders need separate material conversion']};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({materials:materials.length,slots:materials.reduce((n,m)=>n+m.slots.length,0),unresolved:unresolved.length,shaderCounts}));
