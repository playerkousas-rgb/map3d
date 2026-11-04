"""Independent ezdxf gate. Inspect raw ownership BEFORE ezdxf can repair on load.

Not a serializer, recovery script, desktop-CAD test or general DXF validator.
Only the application's R2010/metre/triangular-3DFACE surface contract is checked.
"""
import argparse
import io
import json
import math
from pathlib import Path
import tempfile

import ezdxf
from ezdxf.lldxf.loader import load_dxf_structure
from ezdxf.lldxf.tagger import ascii_tags_loader


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def first(tags, code, default=None):
    return next((t.value for t in tags if t.code == code), default)


def inspect_raw(text):
    lines = text.splitlines()
    require(len(lines) % 2 == 0 and lines[-2:] == ["0", "EOF"], "missing/truncated EOF")
    sections = load_dxf_structure(ascii_tags_loader(io.StringIO(text)))
    require(all(k in sections for k in ("HEADER", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS")), "missing required section")
    pairs = list(zip(lines[::2], lines[1::2]))
    header = {value: pairs[i + 1][1] for i, (code, value) in enumerate(pairs[:-1]) if code == "9"}
    require(header.get("$ACADVER") == "AC1024", "raw version must be R2010")
    require(header.get("$INSUNITS") == "6", "raw units must be metres")
    identities = {}
    for name, entities in sections.items():
        if name == "HEADER":
            continue
        for tags in entities:
            handle = first(tags, 5, first(tags, 105))
            if handle is not None:
                require(handle not in identities and int(handle, 16) > 0, "duplicate/invalid entity handle")
                identities[handle] = first(tags, 0)
    require(int(header["$HANDSEED"], 16) > max(map(lambda h: int(h, 16), identities)), "HANDSEED must exceed all raw handles")
    records = {first(t, 2): first(t, 5) for t in sections["TABLES"] if first(t, 0) == "BLOCK_RECORD"}
    model = next((h for n, h in records.items() if n.lower() == "*model_space"), None)
    require(model is not None, "missing model-space BLOCK_RECORD")
    block_owner = None
    for tags in sections["BLOCKS"]:
        kind = first(tags, 0)
        if kind == "BLOCK":
            block_owner = records.get(first(tags, 2))
            require(block_owner is not None and first(tags, 330) == block_owner, "BLOCK must belong to its BLOCK_RECORD")
        elif kind == "ENDBLK":
            require(block_owner is not None and first(tags, 330) == block_owner, "ENDBLK must belong to its BLOCK_RECORD")
            block_owner = None
    raw_entities = [t for t in sections["ENTITIES"] if first(t, 0) != "SECTION"]
    owners = {}
    for tags in raw_entities:
        require(first(tags, 0) == "3DFACE", "surface export contains non-3DFACE")
        require(first(tags, 330) == model, "3DFACE owner is not the model-space BLOCK_RECORD")
        owners[first(tags, 5)] = first(tags, 330)
    for name, entities in sections.items():
        if name == "HEADER":
            continue
        for tags in entities:
            for tag in tags:
                if tag.code in (330, 350, 360, 390):
                    require(tag.value == "0" or tag.value in identities, "dangling raw owner/dictionary/plot-style reference")
                if tag.code == 390:
                    require(tag.value == "0", "application must use null default plot-style pointer")
    return owners


def audit_file(file, expect=None):
    expect = expect or {}
    text = file.read_text(encoding="utf8")
    owners = inspect_raw(text)
    # Do not use recover.readfile(): recovery could conceal malformed output.
    doc = ezdxf.read(io.StringIO(text))
    require(doc.dxfversion == "AC1024" and doc.units == 6, "loaded version/units mismatch")
    faces = list(doc.modelspace())
    require(len(faces) == len(owners), "import changed raw entity count")
    vertices, roofs, area = [], [], 0.0
    for face in faces:
        require(face.dxftype() == "3DFACE", "loaded entity is not a surface face")
        require(owners.get(face.dxf.handle) == face.dxf.owner, "ezdxf silently repaired an entity owner")
        a, b, c, d = (getattr(face.dxf, f"vtx{i}") for i in range(4))
        require(all(math.isfinite(v) for p in (a, b, c, d) for v in p), "non-finite coordinate")
        require(c == d, "triangular 3DFACE must repeat vertex3 as vertex4")
        cross = (b - a).cross(c - a)
        require(cross.magnitude_square > 1e-16, "degenerate exported face")
        vertices.extend((a, b, c))
        if cross.z > 1e-7:
            roofs.append((a, b, c))
            area += cross.z / 2
    audit = doc.audit()
    require(not audit.errors and not audit.fixes, f"ezdxf audit errors/fixes: {audit.errors}/{audit.fixes}")
    if "faces" in expect:
        require(len(faces) == expect["faces"], "independent face-count mismatch")
    tolerance = 1e-4
    if "bounds" in expect:
        require(bool(vertices), "expected nonempty model")
        bounds = [[fn(v[i] for v in vertices) for i in range(3)] for fn in (min, max)]
        require(all(abs(a - b) < tolerance for x, y in zip(bounds, expect["bounds"]) for a, b in zip(x, y)), f"metric bounds mismatch: {bounds}")
    if "span" in expect:
        require(bool(vertices), "expected nonempty projected model")
        span = [max(v[i] for v in vertices) - min(v[i] for v in vertices) for i in range(3)]
        require(all(abs(a - b) < tolerance for a, b in zip(span, expect["span"])), f"metric projected spans mismatch: {span}")
    if "zBounds" in expect:
        require(abs(min(v.z for v in vertices) - expect["zBounds"][0]) < tolerance and abs(max(v.z for v in vertices) - expect["zBounds"][1]) < tolerance, "absolute projected vertical bounds changed")
    if "minZ" in expect:
        require(bool(vertices) and abs(min(v.z for v in vertices) - expect["minZ"]) < tolerance, "recovered ground vertical minimum changed")
    if "zLevels" in expect:
        require(all(any(abs(v.z - z) < tolerance for v in vertices) for z in expect["zLevels"]), "recovered ground/roof elevation missing")
    if "vertices" in expect:
        require(all(any(max(abs(a - b) for a, b in zip(v, p)) < tolerance for v in vertices) for p in expect["vertices"]), "expected world-transformed/unit-scaled vertices missing")
    if "roofArea" in expect:
        require(abs(area - expect["roofArea"]) < tolerance, f"upward projected net roof area mismatch: {area}")
    if "roofFaces" in expect:
        require(len(roofs) == expect["roofFaces"], "roof triangulation count mismatch")
    for height, count in (("peak", "peaks"), ("eaves", "eavesNodes")):
        if height in expect:
            points = {(round(v.x, 4), round(v.y, 4)) for face in roofs for v in face if abs(v.z - expect[height]) < tolerance}
            require(len(points) == expect[count], f"unique {height} coordinates mismatch")
    # Independent re-save/re-read is evidence of an ezdxf roundtrip, not AutoCAD.
    stream = io.StringIO()
    doc.write(stream)
    reread = ezdxf.read(io.StringIO(stream.getvalue()))
    require(reread.dxfversion == "AC1024" and reread.units == 6, "roundtrip version/units changed")
    after = [tuple(getattr(f.dxf, f"vtx{i}")) for f in reread.modelspace() for i in range(4)]
    before = [tuple(getattr(f.dxf, f"vtx{i}")) for f in faces for i in range(4)]
    require(before == after, "independent roundtrip changed face order/coordinates")
    return len(faces)


def negative_controls(valid_file):
    pairs = [list(p) for p in zip(*(iter(valid_file.read_text().splitlines()),) * 2)]
    face_start = next(i for i, p in enumerate(pairs) if p == ["0", "3DFACE"])
    block_start = next(i for i, p in enumerate(pairs) if p == ["0", "BLOCK"])
    def change(rows, start, code, value):
        i = next(i for i in range(start + 1, len(rows)) if rows[i][0] == str(code))
        rows[i][1] = value
    def header(rows, name, value):
        i = rows.index(["9", name]); rows[i + 1][1] = value
    controls = [
        ("entity owner repaired on load", lambda rows: change(rows, face_start, 330, next(p[1] for p in rows[block_start:] if p[0] == "5"))),
        ("BLOCK owner null", lambda rows: change(rows, block_start, 330, "0")),
        ("dangling plot-style", lambda rows: change(rows, 0, 390, "DEADBEEF")),
        ("duplicate entity handle", lambda rows: change(rows, face_start, 5, next(p[1] for p in rows[block_start:] if p[0] == "5"))),
        ("wrong units", lambda rows: header(rows, "$INSUNITS", "0")),
        ("wrong version", lambda rows: header(rows, "$ACADVER", "AC1009")),
        ("non-finite vertex", lambda rows: change(rows, face_start, 10, "nan")),
        ("nontriangular fourth vertex", lambda rows: change(rows, face_start, 13, "1234")),
        ("truncated EOF", lambda rows: rows.pop()),
    ]
    with tempfile.TemporaryDirectory(prefix="map3d-cad-negative-") as directory:
        file = Path(directory) / "corrupt.dxf"
        for label, mutate in controls:
            rows = [p.copy() for p in pairs]; mutate(rows)
            file.write_text("\n".join(v for p in rows for v in p) + "\n")
            try:
                audit_file(file)
            except (AssertionError, ezdxf.DXFError, ValueError):
                print(f"PASS negative control: {label}")
            else:
                raise AssertionError(f"Gate accepted corruption: {label}")
    return len(controls)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixtures", type=Path, nargs="?")
    parser.add_argument("--browser-dir", type=Path)
    parser.add_argument("--file", type=Path)
    args = parser.parse_args()
    require(ezdxf.__version__ == "1.4.5", "install pinned scripts/cad-requirements.txt")
    if args.file:
        print(f"PASS {args.file}: {audit_file(args.file)} faces")
        return
    require(args.fixtures is not None, "fixture directory required")
    manifest = json.loads((args.fixtures / "manifest.json").read_text())
    require(manifest["schema"] == 1 and len(manifest["fixtures"]) >= 14, "missing CAD fixtures")
    for entry in manifest["fixtures"]:
        file = args.fixtures / entry["file"]
        print(f"PASS {file.name}: {audit_file(file, entry['expect'])} faces; raw references + ezdxf audit/roundtrip")
    negatives = negative_controls(args.fixtures / "indexed.dxf")
    browser_files = []
    if args.browser_dir:
        browser_files = sorted(args.browser_dir.rglob("*.dxf"))
        require(len(browser_files) >= 63, "expected48 building-mode,3 production native,6 terrain and6 scene-recovery DXF downloads")
        terrain_heights = {f"terrain-{mode}-{width}.dxf": height
                           for width in (390, 768, 1440)
                           for mode, height in (("fallback", 50), ("flat-reference", 0))}
        require(set(terrain_heights).issubset({file.name for file in browser_files}), "missing actual terrain fallback/flat-reference downloads")
        recovery_names = {f"{prefix}scene-recovered-{width}.dxf"
                          for prefix in ("", "production-") for width in (390, 768, 1440)}
        require(recovery_names.issubset({file.name for file in browser_files}), "missing actual in-scene recovery downloads")
        angle_names = {f"cad-hipped-{mode}-{width}.dxf" for mode in ("map", "ortho") for width in (390, 768, 1440)}
        angle_names.update(f"cad-native-legacy-{width}.dxf" for width in (390, 768, 1440))
        require(angle_names.issubset({file.name for file in browser_files}), "missing actual angle-derived roof downloads")
        zero_names = {f"cad-{prefix}-{mode}-{width}.dxf" for prefix in ("skillion", "elevation")
                      for mode in ("map", "ortho") for width in (390, 768, 1440)}
        zero_native = {f"cad-native-legacy-{width}.dxf" for width in (390, 768, 1440)}
        require((zero_names | zero_native).issubset({file.name for file in browser_files}), "missing actual zero-roof-level downloads")
        for file in browser_files:
            expected = {"zBounds": [terrain_heights[file.name]] * 2} if file.name in terrain_heights else None
            if file.name in angle_names:
                expected = {"zLevels": [30]}
            if file.name in zero_names or file.name in zero_native:
                expected = dict(expected or {})
                expected["zLevels"] = expected.get("zLevels", []) + ([24, 26] if file.name in zero_native else [24])
            if file.name in recovery_names:
                expected = {"minZ": 50, "zLevels": [50, 62]}
            require(audit_file(file, expected) > 0, f"empty browser download: {file}")
        print(f"PASS {len(browser_files)} actual browser-downloaded DXF files; no raw ownership repair needed")
    print(f"CAD gate PASS: {len(manifest['fixtures'])} application fixtures, {negatives} negative controls, {len(browser_files)} browser downloads; ezdxf {ezdxf.__version__}")


if __name__ == "__main__":
    main()
