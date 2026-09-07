# Unity Third-Person Action Asset Manifest

Updated: 2026-09-07

## Included: Kenney Animated Characters Protagonists

Path:
`third_party/unity-third-person/kenney-protagonists/`

Source:
https://kenney.nl/assets/animated-characters-protagonists

License:
- CC0 1.0 Universal
- original `License.txt` retained

Downloaded archive SHA-256:
`ec3787de70fa2200256848d74201b10f6b6c3126594e9857bf989753312c2b84`

Included subset:
- `model/characterMedium.fbx`
- `animations/idle.fbx`
- `animations/run.fbx`
- `animations/jump.fbx`
- four PNG skins

Use:
- Unity Humanoid Avatar import
- animation retarget smoke test
- locomotion / jump baseline

This pack is intentionally not treated as the final combat animation source; its value is a small, redistributable humanoid baseline.

## Included: Kenney Mini Arena

Path:
`third_party/unity-third-person/kenney-mini-arena/`

Source:
https://kenney.nl/assets/mini-arena

License:
- CC0 1.0 Universal
- original `License.txt` retained

Downloaded archive SHA-256:
`514760c2bc2457027451534a0b06a23f98beece166fb11ed2321226276b83c2c`

Included subset:
- FBX format only
- texture
- character-soldier
- sword / spear
- stairs / wall / gate / floor / columns / arena props

Use:
- third-person camera collision
- lock-on camera
- melee spacing
- stairs / obstacle combat
- weapon socket baseline

## Included: Kenney RPG Audio

Path:
`third_party/unity-third-person/kenney-rpg-audio/`

Source:
https://kenney.nl/assets/rpg-audio

License:
- CC0 1.0 Universal
- original `License.txt` retained

Downloaded archive SHA-256:
`6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b`

Included subset:
- OGG audio files only

Use:
- footsteps
- cloth movement
- draw/sheath feedback
- door / interaction

## Recommended, not vendored: Quaternius Universal Animation Library

Source:
https://quaternius.com/packs/universalanimationlibrary.html

License: CC0

Why it is high priority:
- 120+ motions
- 8-direction locomotion
- combat / gun / traversal actions
- Unity tested
- root-motion and non-root-motion comparison
- 2026-06 update added root motion broadly

Not vendored yet because the free current distribution is delivered through itch.io and should be versioned deliberately when the Unity prototype is created.

## Recommended, not vendored: KayKit Character Animations

Source:
https://kaylousberg.itch.io/kaykit-character-animations

License: CC0

Representative motions:
- Attack 1H
- Heavy Attack
- Block
- Combo
- Spin Attack
- Roll
- Dash Front/Back/Left/Right
- Bow / firearm shooting

This is a better action-controller baseline than inventing placeholder combat animations from scratch.

## Recommended, not vendored: KayKit Adventurers

Source:
https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

License: CC0

Repository HEAD checked during research:
`672074b73ba276876a19e8816ecdc5241817ab47`

The pack contains rigged characters and many weapon/accessory FBXs. The repository is comparatively large, so it is recorded as a source rather than copied wholesale.

## Shared assets

The following already-vendored first-person research assets can also be reused:

- `third_party/unity-fps/kenney-factory-kit/` — industrial traversal/camera test environment
- `third_party/unity-fps/kenney-impact-sounds/` — material impact / footsteps
- `third_party/unity-fps/kenney-sci-fi-sounds/` — sci-fi combat
- `third_party/unity-fps/kenney-blaster-kit/` — ranged weapon tests

## Acceptance rules

Future assets must record:
- source URL
- version/update date if available
- license
- redistribution permission
- archive/revision hash
- selected subset
- Unity import assumptions
- intended use

Asset Store packages subject to Unity EULA are referenced but not committed as raw redistributable assets.