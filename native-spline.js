'use strict';
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function knots(points) {
  if(points.length!==4 || points.some(p=>p.length!==3 || !p.every(Number.isFinite)))throw Error('Expected four finite XYZ points');
  const t=[0];
  for(let i=1;i<4;i++){
    const step=Math.sqrt(distance(points[i],points[i-1]));
    if(step<1e-8)throw Error('Coincident Catmull-Rom control points');
    t.push(t.at(-1)+step);
  }
  return t;
}
function evaluate(points,t,k=knots(points)) {
  if(!Number.isFinite(t)||t<k[1]-1e-4||t>k[2]+1e-4)throw Error('Parameter outside segment');
  const mix=(a,b,x,y)=>a.map((v,j)=>v*(y-t)/(y-x)+b[j]*(t-x)/(y-x));
  const a=[0,1,2].map(j=>mix(points[j],points[j+1],k[j],k[j+1]));
  const b=[0,1].map(j=>mix(a[j],a[j+1],k[j],k[j+2]));
  return mix(b[0],b[1],k[1],k[2]);
}
function parameterAtDistance(table,d,startParameter) {
  if(!Array.isArray(table)||!table.length||!Number.isFinite(d)||d<0||d>table.at(-1).distanceM)throw Error('Distance outside spline table');
  let low=0,high=table.length-1;
  while(low<high){const mid=(low+high)>>1;if(table[mid].distanceM<d)low=mid+1;else high=mid;}
  const before=low?table[low-1]:{distanceM:0,parameter:startParameter},after=table[low];
  if(after.distanceM<=before.distanceM)throw Error('Non-increasing spline table');
  return {parameter:before.parameter+(after.parameter-before.parameter)*(d-before.distanceM)/(after.distanceM-before.distanceM),upperIndex:low};
}
module.exports={distance,knots,evaluate,parameterAtDistance};
