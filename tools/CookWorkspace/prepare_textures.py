"""Decode source textures for UE import; never change original exports."""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
if destination.exists():
    raise RuntimeError("Output directory already exists")
destination.mkdir(parents=True)
records, failures, unique = [], [], {}
for file in sorted(source.glob("models/*/textures/*")):
    if not file.is_file():
        continue
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    try:
        if digest not in unique:
            with Image.open(file) as image:
                if image.mode not in ("RGB", "RGBA", "P", "L", "LA"):
                    raise RuntimeError("Unsupported source pixel mode: " + image.mode)
                converted = image.convert("RGBA")
                output = destination / (digest + ".png")
                converted.save(output, compress_level=3)
                with Image.open(output) as check:
                    if check.size != converted.size or check.tobytes() != converted.tobytes():
                        raise RuntimeError("PNG roundtrip changed decoded pixels")
                unique[digest] = {"png": output.name, "width": image.width, "height": image.height,
                                  "sourceMode": image.mode, "pixelSha256": hashlib.sha256(converted.tobytes()).hexdigest()}
        records.append({"source": str(file.resolve()), "relativeSource": file.relative_to(source).as_posix(),
                        "sourceSha256": digest, **unique[digest]})
    except Exception as exc:
        failures.append({"source": str(file.resolve()), "error": str(exc)})
report = {"installable": False, "textures": records, "uniqueDecodedTextures": len(unique), "failures": failures,
          "limitations": ["Top mip decoded only; Unreal must regenerate mipmaps", "Shader/material translation and normal-map conventions not validated", "No game installation"]}
(destination / "texture-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({"sourceTextures": len(records), "uniqueTextures": len(unique), "failures": len(failures)}))
if failures:
    sys.exit(2)
