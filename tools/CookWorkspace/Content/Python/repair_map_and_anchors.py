import unreal,json,math
from pathlib import Path
root=Path(__file__).resolve().parents[2]
project=root.parents[1]
assetroot='/Game/TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91'
layout=json.loads((project/'research/map-layout01.json').read_text())
if not unreal.EditorLevelLibrary.load_level(assetroot+'/KalinagoVisual'):raise RuntimeError('Scene load failed')
existing={a.get_actor_label() for a in unreal.EditorLevelLibrary.get_all_level_actors()}
materials={}
for name,rgb in [('road',(0.8,0.8,0.8)),('pit',(0.4,0.4,0.45)),('drs',(0.05,0.6,0.08)),('ground',(0.025,0.03,0.045))]:
 mat=unreal.load_asset(assetroot+'/Materials/M_Map_'+name)
 if mat:materials[name]=mat;continue
 mat=unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_Map_'+name,assetroot+'/Materials',unreal.Material,unreal.MaterialFactoryNew())
 if not mat:raise RuntimeError('Material creation failed '+name)
 mat.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
 color=unreal.MaterialEditingLibrary.create_material_expression(mat,unreal.MaterialExpressionConstant3Vector,0,0)
 color.set_editor_property('constant',unreal.LinearColor(*rgb,1))
 unreal.MaterialEditingLibrary.connect_material_property(color,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
 unreal.MaterialEditingLibrary.recompile_material(mat);unreal.EditorAssetLibrary.save_loaded_asset(mat);materials[name]=mat
cube=unreal.load_asset('/Engine/BasicShapes/Cube')
def box(label,p,scale,yaw,kind):
 if 'TB_Map_'+label in existing:return
 a=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(*p),unreal.Rotator(0,yaw,0))
 a.set_actor_label('TB_Map_'+label);a.set_folder_path('TrackBridge/OverviewMap')
 comp=a.static_mesh_component;comp.set_static_mesh(cube);comp.set_material(0,materials[kind]);comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION);comp.set_editor_property('cast_shadow',False)
 a.set_actor_scale3d(unreal.Vector(*scale))
box('Ground',[0,0,-5003],[12,12,0.01],0,'ground')
for i,line in enumerate(layout['lines']):
 a,b=line['a'],line['b'];dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
 if length<0.0001:continue
 kind=line['kind'];width=1.25 if kind=='pit' else 3.5
 box(str(i),[(a[0]+b[0])/2,(a[1]+b[1])/2,-4997.2],[length/100+0.001,width/100,0.002],math.degrees(math.atan2(dy,dx)),kind)
if not unreal.EditorLevelLibrary.save_current_level():raise RuntimeError('Scene save failed')
anchors=json.loads((project/'research/anchors-garages02.json').read_text())
if not unreal.EditorLevelLibrary.load_level('/Game/TrackBridge/Authoring/Kalinago_Editor'):raise RuntimeError('Authoring map load failed')
bylabel={a.get_actor_label():a for a in unreal.EditorLevelLibrary.get_all_level_actors()}
updated=0
for m in anchors['markers']:
 if m['label'] not in bylabel:
  a=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.TargetPoint,unreal.Vector(*m['positionCm']),unreal.Rotator(0,m['yaw'],0))
  a.set_actor_label(m['label']);a.set_folder_path('TrackBridge/'+m['folder']);a.set_editor_property('is_editor_only_actor',True);a.set_editor_property('tags',[unreal.Name('TrackBridgeAnchor')]);bylabel[m['label']]=a
 a=bylabel[m['label']];a.set_actor_location(unreal.Vector(*m['positionCm']),False,False);a.set_actor_rotation(unreal.Rotator(0,m['yaw'],0),False);updated+=1
if updated!=len(anchors['markers']):raise RuntimeError('Anchor count mismatch')
if not unreal.EditorLevelLibrary.save_current_level():raise RuntimeError('Authoring save failed')
(root/'Content/TrackBridge/Authoring/anchors.json').write_text(json.dumps(anchors,indent=2))
(root/'Saved/TrackBridge/map-repair01.json').write_text(json.dumps({'passed':True,'mapSegments':len(layout['lines']),'anchorsUpdated':updated,'runtimeValidated':False},indent=2))
unreal.log('TRACKBRIDGE_MAP_REPAIR_SUCCESS')
