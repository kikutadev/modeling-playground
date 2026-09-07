# Unity First-Person Action Asset Manifest

Updated: 2026-09-07

このファイルは、`modeling-playground` に実際に置いた外部アセットと、再配布しない外部アセットを分離して記録する。

## 1. Included: Kenney Blaster Kit 2.1

Path:

`third_party/unity-fps/kenney-blaster-kit/`

Source:

https://kenney.nl/assets/blaster-kit

Official archive used:

`kenney_blaster-kit_2.1.zip`

SHA-256:

`91e3093e95427d59625e7e2ce2d0399b861600160fd0b4ada7714796b67cea8c`

License:

- Creative Commons CC0 1.0 Universal
- original `License.txt` retained

Retained subset:

- FBX models
- FBX texture `Textures/colormap.png`

Contents include weapon variations, clips, crates, grenades, scopes, silencers, smoke and targets.

Intended uses:

- temporary first-person weapon models
- recoil / reload / weapon swap prototyping
- scope / attachment socket tests
- projectile / grenade tests
- destructible target tests

## 2. Included: Kenney Factory Kit 3.0

Path:

`third_party/unity-fps/kenney-factory-kit/`

Source:

https://kenney.nl/assets/factory-kit

Official archive:

`kenney_factory-kit_3.0.zip`

SHA-256:

`7e31fb2308e90304672bd15cd18fa9d9f02c03731a8cbc57a8e3e1c181dfb0a7`

License:

- Creative Commons CC0 1.0 Universal
- original `License.txt` retained

Retained subset:

- `Models/FBX format/*` -> `fbx/`
- `Models/Textures/*` -> `textures/`

The source pack contains 140 models. Useful pieces include:

- floors
- wide doors
- catwalk straight / corner / junction / stairs
- conveyors
- cranes
- boxes
- floor buttons
- barriers / indicators
- industrial machinery

Intended uses:

- building interior traversal arena after ProBuilder graybox
- grapple anchor readability
- vertical void / catwalk / stair combat tests
- industrial obstacle / cover tests

Do not let the art pack define gameplay dimensions. First prove the route with ProBuilder, then replace surfaces and props with this kit.

## 3. Included: Kenney Crosshair Pack 1.1

Path:

`third_party/unity-fps/kenney-crosshair-pack/`

Source:

https://kenney.nl/assets/crosshair-pack

Official archive:

`kenney_crosshair-pack.zip`

SHA-256:

`26cf8f3e135f8c9a3354a8a6e6c2576e78bd8e2db01c841f93ab43ad3205a78f`

License:

- Creative Commons CC0 1.0 Universal
- original `License.txt` retained

The original pack contains 200 crosshair designs with multiple visual variants. To avoid unnecessary duplication, this repository retains:

- 64×64 `PNG/Light/*` set: 200 files
- light tilesheet
- outline tilesheet

Intended uses:

- static reticle
- spread-state experiments
- grapple target reticle
- lock / invalid-anchor visual tests

## 4. Included: Kenney Impact Sounds 1.0

Path:

`third_party/unity-fps/kenney-impact-sounds/`

Source:

https://kenney.nl/assets/impact-sounds

Official archive:

`kenney_impact-sounds.zip`

SHA-256:

`029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8`

License:

- Creative Commons CC0 1.0 Universal
- original `License.txt` retained

Retained subset:

- OGG audio only

The source pack contains 130 sounds. Categories include:

- footsteps: carpet / concrete / grass / snow / wood
- metal impacts
- glass impacts
- plank / plate / generic impacts
- additional foley hits

Intended uses:

- footstep surface feedback
- projectile impact profile
- melee / collision feedback
- environmental interaction prototype

## 5. Included: Kenney Sci-fi Sounds 1.0

Path:

`third_party/unity-fps/kenney-sci-fi-sounds/`

Source:

https://kenney.nl/assets/sci-fi-sounds

Official archive:

`kenney_sci-fi-sounds.zip`

SHA-256:

`119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04`

License:

- Creative Commons CC0 1.0 Universal
- original `License.txt` retained

Retained subset:

- OGG audio only

The source pack contains 70 sounds. Categories include:

- laser large / small / retro
- thruster fire
- space engine
- force field
- explosions
- metal impacts
- computer ambience
- doors

Intended uses:

- weapon prototype
- grapple/web launcher placeholder
- dash / boost / air movement feedback
- airborne enemy movement / attack
- industrial sci-fi ambience

## 6. Included: Kenney Starter Kit FPS asset subset

Path:

`third_party/unity-fps/kenney-fps-assets/`

Source repository:

https://github.com/KenneyNL/Starter-Kit-FPS

The upstream project code is MIT, while the upstream README states that the included 2D sprites, 3D models and sound effects are CC0.

Only the reusable asset subset is retained here.

### models

- blaster
- blaster-repeater
- enemy-flying
- cloud
- grass
- platform
- wall

These are GLB source assets. Unity 6 does not list GLB among its built-in standard model formats. Use either:

1. the repository's Blender conversion pipeline to make FBX, or
2. a separately selected glTF importer.

Do not silently assume native Unity import.

### sounds

OGG files include blaster, enemy attack/hurt/destroy, jump, land, walking and weapon change.

### sprites

PNG files include crosshair, hit marker, burst, blob shadow and skybox.

Godot `.import`, `.tres`, `.tscn`, GDScript, project files and bundled fonts are excluded.

## 7. Not redistributed: Unity Starter Assets

Asset:

Starter Assets - Character Controllers | URP v2.0

https://marketplace.unity.com/packages/essentials/starter-assets-character-controllers-urp-196526

Verified at research date:

- publisher: Unity Technologies
- free
- version: 2.0
- release: 2026-09-04
- Unity 6000.3 / URP compatible

Reason not vendored:

Asset Store license terms are not treated as CC0. Install through Unity's official distribution path rather than committing a raw package here.

## 8. Useful but not vendored globally: Poly Haven

https://polyhaven.com/

License:

- all asset files are CC0

Good uses:

- HDRI lighting
- PBR concrete / metal / plaster / glass materials
- selected realistic props

Do not mirror the whole library. Download only assets selected for a concrete scene and record each selected asset in this manifest.

## 9. Asset acceptance rules

Any future asset added to `third_party/` should record:

- source URL
- exact pack/version if available
- license
- whether redistribution is allowed
- source archive hash when downloaded directly
- selected file subset
- engine import assumptions
- intended use

Prefer:

1. Unity official package for engine/system code
2. CC0 for reusable art/audio
3. permissive source-code license for implementation references

Avoid introducing paid or restrictive assets as architectural dependencies before the vertical slice proves they are necessary.