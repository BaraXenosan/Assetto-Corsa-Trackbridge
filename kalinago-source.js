'use strict';
// AI v7 additional-record order: AcTools/AiFile/AiPointExtra.cs.
// All fields below remain source data, not generated F1 Manager parameters.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fields=['speed','gas','brake','obsoleteLatG','radius','sideLeft','sideRight','camber','direction','normalX','normalY','normalZ','length','forwardX','forwardY','forwardZ','tag','grade'];
function readAiSource(input){
 const b=Buffer.from(input);let offset=0;
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||offset+n>b.length)throw Error('Truncated AI at '+offset);const p=offset;offset+=n;return p;};
 const int=()=>b.readInt32LE(take(4)),float=()=>{const v=b.readFloatLE(take(4));if(!Number.isFinite(v))throw Error('Nonfinite AI value');return v;};
 const version=int();if(version!==7)throw Error('Unsupported AI version '+version);
 const count=int(),lapTime=int(),sampleCount=int();
 if(count<2||count>1000000||count*20>b.length-offset)throw Error('Invalid AI point count');
 const points=Array.from({length:count},()=>({positionM:[float(),float(),float()],distanceM:float(),id:int()}));
 const extraCount=int();if(extraCount!==count)throw Error('AI extra count does not match point count');
 if(extraCount*72>b.length-offset)throw Error('Truncated AI extra records');
 points.forEach(p=>p.extra=Object.fromEntries(fields.map(f=>[f,float()])));
 const gridFlag=int();if(gridFlag!==0&&gridFlag!==1)throw Error('Unexpected AI grid flag');
 return {version,count,lapTime,sampleCount,extraCount,gridFlag,decodedBytes:offset,remainingBytes:b.length-offset,
  sourceAxes:'Assetto Corsa XYZ, Y up',speedUnits:'source value; conversion to F1M maxSpeed not calibrated',points};
}
function extract(root,out){
 if(fs.existsSync(out))throw Error('Output exists');
 const provenance=[];
 function read(relative){const p=path.join(root,relative),bytes=fs.readFileSync(p);provenance.push({relativePath:relative,path:path.resolve(p),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});return bytes;}
 const race=readAiSource(read('gp_2024/ai/fast_lane.ai')),pit=readAiSource(read('gp_2024/ai/pit_lane.ai'));
 const ranges=ai=>Object.fromEntries(fields.map(f=>[f,{min:Math.min(...ai.points.map(p=>p.extra[f])),max:Math.max(...ai.points.map(p=>p.extra[f]))}]));
 const iniFiles=['models_gp_2024.ini','gp_2024/data/drs_zones.ini','gp_2024/data/ai_hints.ini','gp_2024/data/surfaces.ini'];
 const configuration=Object.fromEntries(iniFiles.map(f=>[f,read(f).toString('utf8')]));
 const sides={};
 for(const name of ['side_l','side_r']){
  const relative='gp_2024/data/'+name+'.csv',text=read(relative).toString('utf8');
  const rows=text.trim().split(/\r?\n/).map((line,i)=>{const cells=line.split(',');if(cells.length!==4||cells.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('Invalid side CSV row '+i);return cells.map(Number);});
  sides[name]={source:relative,columns:'four original values; axis conventions not yet assigned',rows};
 }
 const missingPitWidths=pit.points.filter(p=>p.extra.sideLeft===0&&p.extra.sideRight===0).length;
 const report={installable:false,targetSlot:'Bahrain',sourceTrack:'00_kalinago',layout:'gp_2024',
  policy:'All Kalinago geometry and driving inputs come from these source files. Bahrain supplies the target schema only.',
  race:{points:race.count,extraRecords:race.extraCount,gridFlag:race.gridFlag,unparsedTailBytes:race.remainingBytes,ranges:ranges(race)},
  pit:{points:pit.count,extraRecords:pit.extraCount,missingWidthRecords:missingPitWidths,ranges:ranges(pit)},
  sideCsv:{left:sides.side_l.rows.length,right:sides.side_r.rows.length},configuration,provenance,
  unresolved:['AI speed units and F1M speed/corner semantics','side CSV axis convention must be matched to KN5/AI before use','Zero pit widths require boundaries from track geometry','AI grid tail preserved in original input but not interpreted','Source hints are preserved verbatim, including any malformed values']};
 fs.mkdirSync(out,{recursive:true});
 for(const [name,value] of Object.entries({'fast-lane-source':race,'pit-lane-source':pit,'boundary-csv-source':sides,'source-report':report}))fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2),{flag:'wx'});
 return report;
}
module.exports={readAiSource,extract};
if(require.main===module){const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Usage: node kalinago-source.js TRACK_SOURCE_DIRECTORY NEW_OUTPUT_DIRECTORY');const r=extract(root,out);console.log(JSON.stringify({source:r.sourceTrack,layout:r.layout,race:r.race.points,pit:r.pit.points,pitMissingWidths:r.pit.missingWidthRecords,sideCsv:r.sideCsv,installable:r.installable}));}
