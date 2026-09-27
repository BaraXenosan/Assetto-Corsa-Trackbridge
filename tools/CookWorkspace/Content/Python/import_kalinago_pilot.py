"""Import real Kalinago road geometry after the coordinate probe passes."""
from pathlib import Path
import json
import uuid
import hashlib
import unreal
from prepare_obj import prepare

root = Path(__file__).resolve().parents[2]
reports = root / "Saved" / "TrackBridge"
if not any(json.loads(p.read_text(encoding="utf-8")).get("passed") for p in reports.glob("import-probe-*.json")):
    raise RuntimeError("A successful coordinate probe is required")
run_id = uuid.uuid4().hex
source = root.parent.parent / "build_kalinago_gp2024/models/2_track/collision.obj"
staged = reports / ("pilot_" + run_id) / "road.obj"
report = {"installable": False, "passed": False, "runId": run_id,
          "engineVersion": unreal.SystemLibrary.get_engine_version(),
          "source": str(source), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest()}
try:
    if not report["engineVersion"].startswith("5.1."):
        raise RuntimeError("UE5.1 is required")
    report["staging"] = prepare(source, staged)
    options = unreal.FbxImportUI()
    for key, value in {"import_mesh": True, "import_as_skeletal": False,
                       "import_materials": False, "import_textures": False,
                       "mesh_type_to_import": unreal.FBXImportType.FBXIT_STATIC_MESH}.items():
        options.set_editor_property(key, value)
    data = options.get_editor_property("static_mesh_import_data")
    for key, value in {"combine_meshes": True, "convert_scene": False,
                       "convert_scene_unit": False, "force_front_x_axis": False,
                       "import_uniform_scale": 1.0, "build_nanite": False,
                       "auto_generate_collision": False, "remove_degenerates": False,
                       "generate_lightmap_u_vs": False}.items():
        data.set_editor_property(key, value)
    task = unreal.AssetImportTask()
    for key, value in {"filename": str(staged), "destination_path": "/Game/TrackBridge/KalinagoPilot/Run_" + run_id,
                       "destination_name": "KalinagoRoad", "automated": True,
                       "replace_existing": False, "save": True,
                       "factory": unreal.FbxFactory(), "options": options}.items():
        task.set_editor_property(key, value)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    meshes = [o for o in task.get_objects() if isinstance(o, unreal.StaticMesh)]
    if len(meshes) != 1:
        raise RuntimeError("Expected one combined road mesh")
    mesh = meshes[0]
    box = mesh.get_bounding_box()
    bounds = {"min": [box.min.x, box.min.y, box.min.z], "max": [box.max.x, box.max.y, box.max.z]}
    expected = report["staging"]["sourceBoundsCm"]
    error = max(abs(a-b) for side in ("min", "max") for a, b in zip(bounds[side], expected[side]))
    report.update(asset=mesh.get_path_name(), boundsCm=bounds, maxBoundsErrorCm=error,
                  triangles=mesh.get_num_triangles(0), sections=mesh.get_num_sections(0))
    if error > 0.05 or report["triangles"] != report["staging"]["faces"]:
        raise RuntimeError("Imported road bounds or triangle count differ from source")
    report["passed"] = True
    report["limitations"] = ["Geometry import only; materials and collision setup not completed", "Not installed in F1 Manager"]
except Exception as exc:
    report["error"] = str(exc)
    raise
finally:
    (reports / ("kalinago-pilot-" + run_id + ".json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
    unreal.log("TrackBridge Kalinago pilot: " + run_id)
