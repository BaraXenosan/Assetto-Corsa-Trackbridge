import unreal,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
scene='/Game/TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91/KalinagoVisual'
if not unreal.EditorLevelLibrary.load_level(scene): raise RuntimeError('Cannot load scene')
removed=[]
for actor in unreal.EditorLevelLibrary.get_all_level_actors():
 if actor.get_actor_label()=='4_timing_gp':
  removed.append(actor.get_actor_label()); unreal.EditorLevelLibrary.destroy_actor(actor)
if len(removed)!=1: raise RuntimeError('Expected exactly one AC timing helper mesh')
if not unreal.EditorLevelLibrary.save_current_level(): raise RuntimeError('Save failed')
(root/'Saved/TrackBridge/cleanup01.json').write_text(json.dumps({'removed':removed,'runtimeValidated':False}))
unreal.log('TRACKBRIDGE_CLEANUP_SUCCESS')
