'use strict';
function createRaceNodeMapper(source, finishIndex, targetChain) {
 if(!Array.isArray(source)||source.length<3||!Number.isInteger(finishIndex)||!source[finishIndex])throw Error('Invalid source circuit');
 if(source.some(n=>!Number.isFinite(n.chainage)||n.chainage<0||!Number.isFinite(n.length)||n.length<=0))throw Error('Invalid source distances');
 const total=Math.max(...source.map(n=>n.chainage+n.length));
 if(!Array.isArray(targetChain)||targetChain.length<4||targetChain[0]!==0||targetChain.some((x,i)=>!Number.isFinite(x)||(i&&x<=targetChain[i-1])))throw Error('Invalid target chainage');
 const origin=source[finishIndex].chainage,targetTotal=targetChain.at(-1);
 return {total,map(index){
  if(!Number.isInteger(index)||!source[index])throw Error('Invalid source node');
  const target=((source[index].chainage-origin+total)%total)/total*targetTotal;
  let best=0,error=Infinity;
  for(let i=0;i<targetChain.length-1;i++){
   const difference=Math.abs(targetChain[i]-target),circular=Math.min(difference,targetTotal-difference);
   if(circular<error){best=i;error=circular;}
  }
  return best;
 }};
}
module.exports={createRaceNodeMapper};
