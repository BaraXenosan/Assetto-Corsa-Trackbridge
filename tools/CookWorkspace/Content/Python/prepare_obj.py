"""Compensate the UE5.1 OBJ importer's measured Y reflection in staging only."""
from pathlib import Path
import math
import struct

def prepare(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError("Cannot overwrite source OBJ")
    destination.parent.mkdir(parents=True, exist_ok=True)
    counts = {"vertices": 0, "normals": 0, "faces": 0}
    counts.update(sourceFaces=0, omittedCollapsedFaces=0)
    vertices = []
    minimum, maximum = [math.inf] * 3, [-math.inf] * 3
    with source.open(encoding="utf-8") as incoming, destination.open("x", encoding="utf-8", newline="\n") as outgoing:
        for line in incoming:
            fields = line.split()
            if fields and fields[0] in ("v", "vn"):
                values = [float(v) for v in fields[1:4]]
                if len(values) != 3 or not all(math.isfinite(v) for v in values):
                    raise ValueError("Invalid OBJ coordinate")
                if fields[0] == "v":
                    vertices.append(tuple(struct.unpack("f", struct.pack("f", v))[0] for v in values))
                    minimum = [min(a, b) for a, b in zip(minimum, values)]
                    maximum = [max(a, b) for a, b in zip(maximum, values)]
                fields[2] = str(-float(fields[2]))
                counts["vertices" if fields[0] == "v" else "normals"] += 1
                line = " ".join(fields) + "\n"
            elif fields and fields[0] == "f":
                counts["sourceFaces"] += 1
                indices = [int(v.split("/")[0]) - 1 for v in fields[1:]]
                if len(indices) != 3 or any(i < 0 or i >= len(vertices) for i in indices):
                    raise ValueError("Expected triangular OBJ with valid positive indices")
                if len({vertices[i] for i in indices}) < 3:
                    counts["omittedCollapsedFaces"] += 1
                    continue
                line = "f " + " ".join(reversed(fields[1:])) + "\n"
                counts["faces"] += 1
            outgoing.write(line)
    counts["sourceBoundsCm"] = {"min": minimum, "max": maximum}
    return counts
