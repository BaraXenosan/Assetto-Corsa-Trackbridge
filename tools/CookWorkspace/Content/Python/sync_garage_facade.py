import unreal,json
from pathlib import Path
root=Path(__file__).resolve().parents[2];project=root.parents[1]
data=json.loads((project/'research/anchors-garages03.json').read_text())
if not unreal.EditorLevelLibrary.load_level('/Game/TrackBridge/Authoring/Kalinago_Editor'):raise RuntimeError('Load failed')
actors={a.get_actor_label():a for a in unreal.EditorLevelLibrary.get_all_level_actors()}
for m in data['markers']:
 if m.get('field')=='m_garagePositions':
  a=actors[m['label']];a.set_actor_location(unreal.Vector(*m['positionCm']),False,False);a.set_actor_rotation(unreal.Rotator(0,m['yaw'],0),False)
if not unreal.EditorLevelLibrary.save_current_level():raise RuntimeError('Save failed')
(root/'Content/TrackBridge/Authoring/anchors.json').write_text(json.dumps(data,indent=2))
unreal.log('GARAGE_FACADE_ANCHORS_SAVED')
