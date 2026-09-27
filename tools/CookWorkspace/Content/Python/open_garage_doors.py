import unreal,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
assetroot='/Game/TrackBridge/KalinagoScene/Run_2b0d5b5e7e44432db837463ecc98aa91'
mesh=unreal.load_asset(assetroot+'/Meshes/SM_1_00_kalinago')
if not mesh:raise RuntimeError('Main mesh missing')
mat=unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_OpenGarageDoors',assetroot+'/Materials',unreal.Material,unreal.MaterialFactoryNew())
if not mat:raise RuntimeError('Material creation failed')
mat.set_editor_property('blend_mode',unreal.BlendMode.BLEND_MASKED)
zero=unreal.MaterialEditingLibrary.create_material_expression(mat,unreal.MaterialExpressionConstant,0,0);zero.set_editor_property('r',0.0)
unreal.MaterialEditingLibrary.connect_material_property(zero,'',unreal.MaterialProperty.MP_OPACITY_MASK)
unreal.MaterialEditingLibrary.recompile_material(mat)
changed=[]
for i,slot in enumerate(mesh.get_editor_property('static_materials')):
 name=str(slot.get_editor_property('imported_material_slot_name'))
 if name in ('material_9','material_26'):
  mesh.set_material(i,mat);changed.append({'slot':i,'source':name})
if len(changed)!=2:raise RuntimeError('Expected exactly two garage door material slots')
unreal.EditorAssetLibrary.save_loaded_asset(mat);unreal.EditorAssetLibrary.save_loaded_asset(mesh)
(root/'Saved/TrackBridge/open-garages01.json').write_text(json.dumps({'passed':True,'slots':changed,'method':'Hide only garage shutter surfaces using zero opacity mask','runtimeValidated':False},indent=2))
