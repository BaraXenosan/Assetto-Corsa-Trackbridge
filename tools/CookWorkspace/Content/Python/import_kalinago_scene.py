"""Build an isolated visual prototype from visible AC geometry, never a race-ready map."""
from pathlib import Path
import hashlib
import json
import shutil
import uuid
import unreal
from prepare_obj import prepare

root = Path(__file__).resolve().parents[2]
project = root.parent.parent
run_id = uuid.uuid4().hex
asset_root = '/Game/TrackBridge/KalinagoScene/Run_' + run_id
reports = root / 'Saved/TrackBridge'
staging = reports / ('scene_' + run_id)
staging.mkdir(parents=True)
report = dict(installable=False, passed=False, runId=run_id, assetRoot=asset_root,
              meshes=[], materials=[], textures=[], limitations=[
                  'Visual prototype only; no RaceSim component or Bahrain replacement',
                  'Diffuse and alpha only; AC normal/detail/wind shaders not reconstructed',
                  'UV appearance and lighting require visual inspection; collision not configured'])
tools = unreal.AssetToolsHelpers.get_asset_tools()
library = unreal.MaterialEditingLibrary
materials = json.loads((project / 'research/kalinago-materials01.json').read_text(encoding='utf-8'))['materials']
texture_cache = {}
material_cache = {}

def texture(slot):
    key = slot['sourceSha256']
    if key in texture_cache:
        return texture_cache[key]
    if not slot['resolved']:
        raise RuntimeError('Unresolved diffuse texture')
    task = unreal.AssetImportTask()
    for k, v in dict(filename=slot['png'], destination_path=asset_root + '/Textures',
                     destination_name='T_' + key, automated=True, replace_existing=False,
                     save=True, factory=unreal.TextureFactory()).items():
        task.set_editor_property(k, v)
    tools.import_asset_tasks([task])
    objects = [o for o in task.get_objects() if isinstance(o, unreal.Texture2D)]
    if len(objects) != 1:
        raise RuntimeError('Expected one Texture2D')
    tex = objects[0]
    tex.set_editor_property('srgb', True)
    unreal.EditorAssetLibrary.save_loaded_asset(tex)
    texture_cache[key] = tex
    report['textures'].append(dict(asset=tex.get_path_name(), source=slot['png'], sourceSha256=key))
    return tex

def material(source):
    key = (source['model'], source['objMaterialName'])
    if key in material_cache:
        return material_cache[key]
    mat = tools.create_asset('M_' + source['model'] + '_' + str(source['index']),
                             asset_root + '/Materials', unreal.Material, unreal.MaterialFactoryNew())
    if not mat:
        raise RuntimeError('Material creation failed')
    slots = [s for s in source['slots'] if s['name'] == 'txDiffuse']
    masked = bool(source['sourceAlphaTest']) or source['sourceShader'] in ('ksTree', 'ksGrass', 'ksPerPixelAT', 'ksPerPixelAT_NM')
    translucent = source['sourceBlend'] != 0 and not masked
    if masked:
        mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
        mat.set_editor_property('opacity_mask_clip_value', 0.5)
    elif translucent:
        mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
    if masked or 'Tree' in source['sourceShader'] or 'Grass' in source['sourceShader']:
        mat.set_editor_property('two_sided', True)
    if slots:
        node = library.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -400, 0)
        node.set_editor_property('texture', texture(slots[0]))
        if not library.connect_material_property(node, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR):
            raise RuntimeError('Base color connection failed')
        if masked or translucent:
            prop = unreal.MaterialProperty.MP_OPACITY_MASK if masked else unreal.MaterialProperty.MP_OPACITY
            if not library.connect_material_property(node, 'A', prop):
                raise RuntimeError('Alpha connection failed')
    rough = library.create_material_expression(mat, unreal.MaterialExpressionConstant, -400, 200)
    rough.set_editor_property('r', 0.8)
    library.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
    library.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    material_cache[key] = mat
    report['materials'].append(dict(asset=mat.get_path_name(), model=key[0], slot=key[1],
                                    sourceShader=source['sourceShader'], diffuse=bool(slots),
                                    masked=masked, translucent=translucent))
    return mat

try:
    if not unreal.SystemLibrary.get_engine_version().startswith('5.1.'):
        raise RuntimeError('UE5.1 required')
    if not unreal.EditorLevelLibrary.new_level(asset_root + '/KalinagoVisual'):
        raise RuntimeError('New level failed')
    sources = sorted((project / 'build_kalinago_gp2024/models').glob('*/model.obj'))
    if not sources:
        raise RuntimeError('No visible models found')
    for source in sources:
        model = source.parent.name
        target = staging / model / 'model.obj'
        stats = prepare(source, target)
        # Preserve named sections; texture loading is handled explicitly above.
        shutil.copyfile(source.parent / 'model.mtl', target.parent / 'model.mtl')
        options = unreal.FbxImportUI()
        for k, v in dict(import_mesh=True, import_as_skeletal=False, import_materials=False,
                         import_textures=False, mesh_type_to_import=unreal.FBXImportType.FBXIT_STATIC_MESH).items():
            options.set_editor_property(k, v)
        data = options.get_editor_property('static_mesh_import_data')
        for k, v in dict(combine_meshes=True, convert_scene=False, convert_scene_unit=False,
                         force_front_x_axis=False, import_uniform_scale=1.0, build_nanite=False,
                         auto_generate_collision=False, remove_degenerates=False,
                         generate_lightmap_u_vs=False).items():
            data.set_editor_property(k, v)
        task = unreal.AssetImportTask()
        for k, v in dict(filename=str(target), destination_path=asset_root + '/Meshes',
                         destination_name='SM_' + model, automated=True, replace_existing=False,
                         save=True, factory=unreal.FbxFactory(), options=options).items():
            task.set_editor_property(k, v)
        tools.import_asset_tasks([task])
        meshes = [o for o in task.get_objects() if isinstance(o, unreal.StaticMesh)]
        if len(meshes) != 1:
            raise RuntimeError('Expected one mesh for ' + model)
        mesh = meshes[0]
        box = mesh.get_bounding_box()
        bounds = dict(min=[box.min.x, box.min.y, box.min.z], max=[box.max.x, box.max.y, box.max.z])
        error = max(abs(a-b) for side in ('min', 'max') for a, b in zip(bounds[side], stats['sourceBoundsCm'][side]))
        if error > 0.1 or mesh.get_num_triangles(0) != stats['faces']:
            raise RuntimeError('Geometry mismatch for ' + model)
        assignments = []
        for i, slot in enumerate(mesh.get_editor_property('static_materials')):
            name = str(slot.get_editor_property('imported_material_slot_name'))
            matches = [m for m in materials if m['model'] == model and m['objMaterialName'] == name]
            if len(matches) != 1:
                raise RuntimeError('Unmapped material slot: ' + model + '/' + name)
            mat = material(matches[0])
            mesh.set_material(i, mat)
            assignments.append(dict(index=i, sourceSlot=name, asset=mat.get_path_name()))
        unreal.EditorAssetLibrary.save_loaded_asset(mesh)
        actor = unreal.EditorLevelLibrary.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
        if not actor:
            raise RuntimeError('Actor creation failed')
        actor.set_actor_label(model)
        report['meshes'].append(dict(model=model, asset=mesh.get_path_name(), triangles=stats['faces'],
                                     staging=stats, maxBoundsErrorCm=error, materials=assignments,
                                     sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest()))
        unreal.log('TrackBridge scene imported ' + model)
        (reports / ('kalinago-scene-' + run_id + '.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
    if not unreal.EditorLevelLibrary.save_current_level():
        raise RuntimeError('Level save failed')
    report['level'] = asset_root + '/KalinagoVisual'
    report['passed'] = True
except Exception as exc:
    report['error'] = str(exc)
    raise
finally:
    (reports / ('kalinago-scene-' + run_id + '.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
