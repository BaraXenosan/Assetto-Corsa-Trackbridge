import json,math
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1]
cache=root/'research/camera-triangles01.npy'
if cache.exists():tri=np.load(cache)
else:
 chunks=[]
 for file in sorted((root/'build_kalinago_gp2024/models').glob('*/model.obj')):
  if file.parent.name=='4_timing_gp':continue
  vertices=[];faces=[];material=''
  for line in file.open():
   if line.startswith('v '):vertices.append([float(x)*.01 for x in line.split()[1:4]])
   elif line.startswith('usemtl '):material=line.split()[1]
   elif line.startswith('f '):
    if file.parent.name=='1_00_kalinago' and material in ['material_9','material_26']:continue
    ids=[int(x.split('/')[0])-1 for x in line.split()[1:]]
    for i in range(1,len(ids)-1):faces.append([ids[0],ids[i],ids[i+1]])
  if faces:chunks.append(np.asarray(vertices,dtype=np.float32)[np.asarray(faces,dtype=np.int32)])
  print(file.parent.name,len(faces),flush=True)
 tri=np.concatenate(chunks);np.save(cache,tri)
lo=tri.min(axis=1);hi=tri.max(axis=1)
def blocked(origin,target,local):
 direction=target-origin;length=np.linalg.norm(direction)
 if length<.1:return False
 direction/=length
 selected=local[np.all(local.max(axis=1)>=np.minimum(origin,target),axis=1)&np.all(local.min(axis=1)<=np.maximum(origin,target),axis=1)]
 if not len(selected):return False
 v0=selected[:,0];e1=selected[:,1]-v0;e2=selected[:,2]-v0
 p=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,p);mask=np.abs(det)>1e-7
 if not mask.any():return False
 v0=v0[mask];e1=e1[mask];e2=e2[mask];p=p[mask];inv=1/det[mask]
 t=origin-v0;u=np.einsum('ij,ij->i',t,p)*inv;q=np.cross(t,e1);v=q@direction*inv;distance=np.einsum('ij,ij->i',e2,q)*inv
 return bool(((u>=0)&(v>=0)&(u+v<=1)&(distance>.25)&(distance<length-.25)).any())
results=[]
previousPath=root/'research/camera-visibility01.json'
previous={c['index']:c for c in json.loads(previousPath.read_text())['cameras']} if previousPath.exists() else {}
for camera in json.loads((root/'research/camera-visibility-input01.json').read_text()):
 if camera['index'] in previous and previous[camera['index']]['visibleSamples']==previous[camera['index']]['sampleCount']:
  results.append(previous[camera['index']]);continue
 mid=np.array(camera['mid']);targets=np.array(camera['targets']);normal=np.array([-math.sin(camera['yaw']),math.cos(camera['yaw']),0])
 candidates=[mid+normal*side*offset+np.array([0,0,height]) for height in [6,10,16,24,36] for offset in [18,28,40] for side in [-1,1]]
 bbox=np.vstack([targets,candidates]);minimum=bbox.min(axis=0)-60;maximum=bbox.max(axis=0)+60
 local=tri[np.all(hi>=minimum,axis=1)&np.all(lo<=maximum,axis=1)]
 scored=[]
 for origin in candidates:
  clear=[not blocked(origin,target,local) for target in targets]
  score=sum(clear)*1000-(origin[2]-mid[2])*2-np.linalg.norm(origin-mid)*.1
  scored.append((score,origin,clear))
 _,origin,clear=max(scored,key=lambda x:x[0])
 if sum(clear)<len(targets):
  for anchor in targets:
   for height in [8,16,30,48]:
    for side in [-1,1]:
     candidate=anchor+normal*side*28+np.array([0,0,height])
     visible=[not blocked(candidate,target,local) for target in targets]
     score=sum(visible)*1000-height*2-np.linalg.norm(candidate-mid)*.1
     scored.append((score,candidate,visible))
  _,origin,clear=max(scored,key=lambda x:x[0])
 delta=targets[len(targets)//2]-origin
 results.append({**camera,'positionM':origin.tolist(),'pitch':math.degrees(math.atan2(delta[2],np.linalg.norm(delta[:2]))),'heading':math.degrees(math.atan2(delta[1],delta[0])),'visibleSamples':sum(clear),'sampleCount':len(clear),'clear':clear,'trianglesTestedInArea':len(local)})
 print('Camera',camera['index'],'visible',sum(clear),'/',len(clear),'height',round(origin[2]-mid[2],2),flush=True)
(root/'research/camera-visibility01.json').write_text(json.dumps({'installable':False,'sourceTriangles':len(tri),'method':'Two-sided triangle intersection; five sampled targets per shot; source opaque geometry including conservative foliage','limitations':['Not an in-game visual test','Does not include native garage geometry','Does not prove continuous visibility between samples'],'cameras':results},indent=2))
