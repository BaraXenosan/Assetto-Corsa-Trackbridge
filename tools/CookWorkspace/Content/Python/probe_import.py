"""UE 5.1 import probe only. Does not install or cook the track."""
import json
from pathlib import Path
import uuid
import unreal
from prepare_obj import prepare

root = Path(__file__).resolve().parents[2]
run_id = uuid.uuid4().hex
report_dir = root / "Saved" / "TrackBridge"
report_dir.mkdir(parents=True, exist_ok=True)
report_path = report_dir / ("import-probe-" + run_id + ".json")
report = {"installable": False, "passed": False, "runId": run_id,
          "engineVersion": unreal.SystemLibrary.get_engine_version()}
try:
    if not report["engineVersion"].startswith("5.1."):
        raise RuntimeError("This probe targets UE 5.1")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", False)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
    data = options.get_editor_property("static_mesh_import_data")
    for key, value in {"combine_meshes": True, "convert_scene": False,
                       "convert_scene_unit": False, "force_front_x_axis": False,
                       "import_uniform_scale": 1.0, "build_nanite": False,
                       "auto_generate_collision": False,
                       "generate_lightmap_u_vs": False}.items():
        data.set_editor_property(key, value)
    task = unreal.AssetImportTask()
    staged = root / "Saved" / "TrackBridge" / ("coordinate_probe_" + run_id + ".obj")
    report["staging"] = prepare(root / "SourceAssets" / "coordinate_probe.obj", staged)
    for key, value in {"filename": str(staged),
                       "destination_path": "/Game/TrackBridge/Probes/Run_" + run_id,
                       "destination_name": "CoordinateProbe", "automated": True,
                       "replace_existing": False, "save": True,
                       "factory": unreal.FbxFactory(), "options": options}.items():
        task.set_editor_property(key, value)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    meshes = [obj for obj in task.get_objects() if isinstance(obj, unreal.StaticMesh)]
    if len(meshes) != 1:
        raise RuntimeError("Expected exactly one imported StaticMesh")
    mesh = meshes[0]
    box = mesh.get_bounding_box()
    minimum = [box.min.x, box.min.y, box.min.z]
    maximum = [box.max.x, box.max.y, box.max.z]
    report.update(asset=mesh.get_path_name(), minimumCm=minimum, maximumCm=maximum,
                  triangles=mesh.get_num_triangles(0))
    error = max(abs(a-b) for a, b in zip(minimum + maximum, [0, 0, 0, 100, 200, 300]))
    report["maxBoundsErrorCm"] = error
    if error > 0.01 or report["triangles"] != 4:
        raise RuntimeError("Import changed axes, scale, origin, or topology; do not batch import")
    report["passed"] = True
except Exception as exc:
    report["error"] = str(exc)
    raise
finally:
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    unreal.log("TrackBridge import probe report: " + str(report_path))
