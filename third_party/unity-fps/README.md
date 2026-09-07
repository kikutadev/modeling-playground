# Unity First-Person Action Third-Party Assets

This directory contains only assets whose redistribution terms were checked for this repository.

The detailed manifest, source versions, archive hashes and intended uses are documented in:

`../../docs/unity-first-person-action/assets.md`

## Included packs

| Directory | Source | Version | Retained subset | License |
| --- | --- | --- | --- | --- |
| `kenney-blaster-kit/` | https://kenney.nl/assets/blaster-kit | 2.1 | FBX + texture | CC0 |
| `kenney-factory-kit/` | https://kenney.nl/assets/factory-kit | 3.0 | FBX + textures | CC0 |
| `kenney-crosshair-pack/` | https://kenney.nl/assets/crosshair-pack | 1.1 | Light 64×64 PNG set + tilesheets | CC0 |
| `kenney-impact-sounds/` | https://kenney.nl/assets/impact-sounds | 1.0 | OGG | CC0 |
| `kenney-sci-fi-sounds/` | https://kenney.nl/assets/sci-fi-sounds | 1.0 | OGG | CC0 |
| `kenney-fps-assets/` | https://github.com/KenneyNL/Starter-Kit-FPS | upstream snapshot | reusable GLB / OGG / PNG only | asset files CC0 |

Original license files are retained inside the relevant pack directories whenever the downloaded archive supplied one.

## Selection rules

- Prefer FBX for Unity-facing 3D assets because Unity's own model-format documentation recommends FBX where possible.
- Do not vendor Unity Asset Store packages here unless their redistribution terms explicitly allow it.
- Do not vendor entire external libraries when only one scene-specific asset is needed.
- Keep source URL, version, archive SHA-256 and retained subset in `docs/unity-first-person-action/assets.md`.
- Engine-specific sample code is not copied merely because its accompanying art is reusable.

## Unity Starter Assets

`Starter Assets - Character Controllers | URP` is intentionally **not** included here. Install it through Unity's official distribution path. It is used as a reference/baseline rather than as a vendored third-party source tree.