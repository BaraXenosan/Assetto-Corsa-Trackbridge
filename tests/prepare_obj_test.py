import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools/CookWorkspace/Content/Python"))
from prepare_obj import prepare

with tempfile.TemporaryDirectory(prefix="trackbridge_obj_test_") as folder:
    folder = Path(folder).resolve()
    source, target = folder / "source.obj", folder / "staged.obj"
    text = "v 0 0 0\nv 100 20 0\nv 0 200 0\nv 0 0 0\nvn 0 1 0\nf 1//1 2//1 3//1\nf 1//1 4//1 3//1\n"
    source.write_text(text, encoding="utf-8")
    report = prepare(source, target)
    result = target.read_text(encoding="utf-8")
    assert source.read_text(encoding="utf-8") == text
    assert "v 100 -20.0 0" in result
    assert "vn 0 -1.0 0" in result
    assert "f 3//1 2//1 1//1" in result
    assert report["sourceFaces"] == 2 and report["faces"] == 1 and report["omittedCollapsedFaces"] == 1
    assert report["sourceBoundsCm"] == {"min": [0, 0, 0], "max": [100, 200, 0]}
    try:
        prepare(source, source)
        raise AssertionError("Input overwrite must be rejected")
    except ValueError:
        pass
    try:
        prepare(source, target)
        raise AssertionError("Existing output must be rejected")
    except FileExistsError:
        pass
print("OBJ reflection, normals, winding, collapsed-face accounting and input protection passed")
