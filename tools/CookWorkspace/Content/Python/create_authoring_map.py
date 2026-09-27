import unreal,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
scene='/Game/TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91/KalinagoVisual'
output='/Game/TrackBridge/Authoring/Kalinago_Editor'
if unreal.EditorAssetLibrary.does_asset_exist(output): raise RuntimeError('Authoring map exists')
if not unreal.EditorLevelLibrary.load_level(scene): raise RuntimeError('Scene load failed')
world=unreal.EditorLevelLibrary.get_editor_world()
if not unreal.EditorLoadingAndSavingUtils.save_map(world,output): raise RuntimeError('Save as failed')
data=json.loads((root/'Content/TrackBridge/Authoring/anchors.json').read_text())
for m in data['markers']:
 a=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.TargetPoint,unreal.Vector(*m['positionCm']),unreal.Rotator(0,m['yaw'],0))
 a.set_actor_label(m['label']);a.set_folder_path('TrackBridge/'+m['folder']);a.set_editor_property('is_editor_only_actor',True)
 a.set_editor_property('tags',[unreal.Name('TrackBridgeAnchor')])
 if 'field' in m: a.set_editor_property('tags',[unreal.Name('TrackBridgeAnchor'),unreal.Name(m['field']),unreal.Name(str(m['index']))])
for i,m in enumerate([v for v in data['markers'] if v['folder']=='RaceNodes'][::6]):
 p=m['positionCm'];camera=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.CameraActor,unreal.Vector(p[0],p[1],p[2]+1800),unreal.Rotator(-35,0,0))
 camera.set_actor_label('PreviewCamera_'+str(i));camera.set_folder_path('TrackBridge/Cameras');camera.set_editor_property('is_editor_only_actor',True)
sun=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight,unreal.Vector(0,0,10000),unreal.Rotator(-55,-35,0))
sun.set_actor_label('EditorDaySun');sun.set_editor_property('is_editor_only_actor',True);sun.light_component.set_intensity(100000)
sky=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight,unreal.Vector(0,0,1000));sky.set_actor_label('EditorSkyLight');sky.set_editor_property('is_editor_only_actor',True)
atmos=unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyAtmosphere,unreal.Vector(0,0,0));atmos.set_editor_property('is_editor_only_actor',True)
if not unreal.EditorLevelLibrary.save_current_level():raise RuntimeError('Save failed')
(root/'Saved/TrackBridge/authoring01.json').write_text(json.dumps({'passed':True,'map':output,'markers':len(data['markers']),'installable':False,'note':'Editor-only anchors and preview cameras; runtime animation integration pending'},indent=2))
unreal.log('TRACKBRIDGE_AUTHORING_SUCCESS')
