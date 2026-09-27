import unreal,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
results={}
for name,path in [('authoring','/Game/TrackBridge/Authoring/Kalinago_Editor'),('scene','/Game/TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91/KalinagoVisual')]:
 if not unreal.EditorLevelLibrary.load_level(path):raise RuntimeError('Load failed '+path)
 actors=unreal.EditorLevelLibrary.get_all_level_actors()
 labels=[a.get_actor_label() for a in actors]
 results[name]={'actors':len(actors),'garageMarkers':sum(x.startswith('Garages_') for x in labels),'mapObjects':sum(x.startswith('TB_Map_') for x in labels)}
 if name=='authoring' and results[name]['garageMarkers']!=22:raise RuntimeError('Missing garage markers after reopening')
 if name=='scene' and results[name]['mapObjects']!=753:raise RuntimeError('Missing overview geometry after reopening')
results['passed']=True
(root/'Saved/TrackBridge/repair-editor-reopen01.json').write_text(json.dumps(results,indent=2))
