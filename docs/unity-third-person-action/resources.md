# Unity Third-Person Action Resources

Updated: 2026-09-07

## S — Production baseline

### Starter Assets - Character Controllers | URP v2.0

https://marketplace.unity.com/packages/essentials/starter-assets-character-controllers-urp-196526

- Unity Technologies公式
- Free
- v2.0: 2026-09-04
- Unity 6000.3 / URP compatible
- Third Person Controllerをlocomotion baselineとして利用
- Asset Store EULA対象なのでrepoへ再配布しない

### Cinemachine 3

https://docs.unity3d.com/ja/current/Manual/com.unity.cinemachine.html

Unity 6000.0では3.1.5がreleased。

用途:
- orbit camera
- follow damping
- camera collision / occlusion対策
- aim camera
- lock-on composition
- impact / finisher camera

旧Cinemachine 2.xのFreeLook/3rd Person Aim資料は設計概念の参考にはなるが、実装APIは3.xをauthorityにする。

### Root Motion

https://docs.unity3d.com/ja/current/Manual/RootMotion.html

三人称では必読。Body TransformとRoot Transformの関係、XZ/Y/RotationのBake Into Pose設定を理解する。

### Animation Rigging

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.animation.rigging.html

Unity 6000.0では1.4.0 released。

用途:
- weapon hand IK
- upper-body aim
- head look
- foot/contact補正
- contextual interaction pose

### Avatar Mask

https://docs.unity3d.com/ja/current/Manual/class-AvatarMask.html

locomotion中にupper-body attack / aimを重ねる場合に使う。

### AI Navigation

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.ai.navigation.html

Unity 6000.0では2.0.9 released。

地上敵の追跡、reposition、NavMeshLinkを使う特殊移動のbaseline。

## A — Combat / animation design

### Animation State Machine

https://docs.unity3d.com/ja/current/Manual/StateMachineBasics.html

Idle/Locomotion/Jump/Attack/Hit/Death等のpresentation state管理。

### State Machine Behaviour

https://docs.unity3d.com/ja/current/Manual/StateMachineBehaviours.html

state entry/exitを観測できる。ただしcombat authorityをAnimatorへ寄せすぎない。

### Animation Events

https://docs.unity3d.com/ja/current/Manual/script-AnimationWindowEvent.html

footstep / trail / sound / contact marker等には有用。damage判定の唯一のauthorityにはしない。

## External CC0 animation assets

### Quaternius — Universal Animation Library

https://quaternius.com/packs/universalanimationlibrary.html
https://quaternius.itch.io/universal-animation-library

優先度: S

- CC0
- 120+ animations
- 8-direction locomotion
- combat / gun / crawl / swim / death 等
- Unity / Unreal / Godot向けexport
- 2026-06 v3.0でroot motionを全locomotion/actionへ追加
- root-motion有無の比較に非常に使いやすい

### Quaternius — Universal Animation Library 2

https://quaternius.com/packs/universalanimationlibrary2.html

優先度: A

- CC0
- 3-hit / 4-hit comboを含む
- comboのhit単位・recovery・full comboの比較に向く

### KayKit Character Animations

https://kaylousberg.itch.io/kaykit-character-animations

優先度: S

CC0。含まれる代表motion:
- Idle / Walk / Run
- Jump
- Attack 1H
- Heavy Attack
- Block
- Spinning Attack
- Combo
- Roll
- Dash Front / Back / Left / Right
- Shoot 1H / 2H / Bow

三人称action controllerのsmoke testに非常に向く。

### KayKit Adventurers

https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

- CC0
- rigged/animated character
- sword / shield / axe / crossbow / staff等
- Unity向けFBXあり
- character + weapon socket + animation retargetの比較対象

## Included CC0 assets

### Kenney Animated Characters Protagonists

https://kenney.nl/assets/animated-characters-protagonists

- CC0
- 1 humanoid FBX
- idle / run / jump FBX
- 4 skins
- Humanoid import / retarget smoke test向け

### Kenney Mini Arena

https://kenney.nl/assets/mini-arena

- CC0
- character rig
- sword / spear
- arena / wall / stairs
- melee camera / target lock / dodge spacingの小型graybox向け

### Kenney RPG Audio

https://kenney.nl/assets/rpg-audio

- CC0
- footsteps / cloth / weapon draw / door / interaction等

## Shared resources already in this repository

- `docs/humanoid-rigging/`
- `docs/unity-first-person-action/`
- `third_party/unity-fps/kenney-factory-kit/`
- `third_party/unity-fps/kenney-impact-sounds/`

Factory Kitは三人称のvertical traversal / camera collision検証にもそのまま使える。