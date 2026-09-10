#!/usr/bin/env python3
"""Convert an engine-neutral glTF/GLB asset to an FBX suited for Unity import.

Usage from Blender:
    blender --background --python scripts/export_unity_fbx.py -- input.glb output.fbx
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


def _script_args() -> list[str]:
    """Return arguments passed after Blender's `--` separator."""
    try:
        separator = sys.argv.index("--")
    except ValueError as exc:
        raise SystemExit("Expected: -- <input.glb> <output.fbx>") from exc
    return sys.argv[separator + 1 :]


def _clear_scene() -> None:
    """Remove the startup scene so the exported FBX contains only the source asset."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def convert_glb_to_fbx(source: Path, destination: Path) -> None:
    """Import one GLB/glTF file and export a Unity-friendly FBX copy."""
    if not source.is_file():
        raise FileNotFoundError(source)

    destination.parent.mkdir(parents=True, exist_ok=True)
    _clear_scene()

    bpy.ops.import_scene.gltf(filepath=str(source))

    # Unity uses Y-up; Blender's FBX exporter convention for Unity is -Z forward / Y up.
    # Embedded textures keep each prototype FBX self-contained where the exporter permits it.
    bpy.ops.export_scene.fbx(
        filepath=str(destination),
        use_selection=False,
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        add_leaf_bones=False,
        path_mode="COPY",
        embed_textures=True,
        bake_anim=True,
    )


def main() -> None:
    """Parse Blender CLI arguments and convert exactly one asset."""
    args = _script_args()
    if len(args) != 2:
        raise SystemExit("Expected exactly two arguments: <input.glb> <output.fbx>")

    source = Path(args[0]).expanduser().resolve()
    destination = Path(args[1]).expanduser().resolve()
    convert_glb_to_fbx(source, destination)
    print(f"Exported Unity FBX: {destination}")


if __name__ == "__main__":
    main()
