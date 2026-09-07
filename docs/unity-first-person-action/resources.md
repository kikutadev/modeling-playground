# Unity First-Person Action Resources

Updated: 2026-09-07

優先順位は、Unity 6.3 LTSで現在使える公式資料を最上位に置き、古いsampleは設計比較用に限定する。

## S — 最初に使う

### Unity 6.3 LTS

https://unity.com/releases/unity-6/support

- 2025-12-04公開
- 2027-12までLTS support
- 新規productionのbaseline

### Starter Assets - Character Controllers | URP v2.0

https://marketplace.unity.com/packages/essentials/starter-assets-character-controllers-urp-196526

- Unity Technologies公式
- Free
- v2.0: 2026-09-04 release
- Unity 6000.3 / URP対応
- First Person / Third Person controllerのbaseline
- Asset Store EULA対象なのでrepoへ再配布しない

用途: movement/input/cameraのreference implementation。最終的なweb swing controllerそのものとしては扱わない。

### Input System

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.inputsystem.html

Unity 6000.0 documentationで `com.unity.inputsystem@1.17` がreleased。Unity 6.3 projectではPackage Managerが解決するcompatible versionを採用し、古いInput Managerを新規依存にしない。

Input Action候補:

- Move
- Look
- Jump
- Sprint
- Dash
- Fire
- AltFire
- Grapple
- GrappleLeft / GrappleRight（両手方式を採る場合）
- Release
- Interact

ゲームロジックからdevice-specific inputを分離する。

### Character Controller

https://docs.unity3d.com/ja/current/Manual/class-CharacterController.html

通常歩行・階段・slope・grounded movementの基礎。

重要項目:

- Slope Limit
- Step Offset
- Skin Width
- Min Move Distance

高速アクションではStarter Assetsの値をそのまま正解にせず、速度・step・skin width・ground probeの組合せをscene metricsと一緒にQAする。

### Cinemachine 3

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.cinemachine.html

Unity 6000.0 documentationでは `com.unity.cinemachine@3.1` / 3.1.5がreleased。

用途:

- camera impulse
- landing impact
- weapon recoil presentation
- dash impulse
- scripted camera
- lock-on camera実験

通常のraw mouse lookロジック自体を過度にCinemachineへ依存させず、camera presentationを主用途にする。

### Animation Rigging

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.animation.rigging.html

Unity 6000.0 documentationでは `com.unity.animation.rigging@1.4` / 1.4.0がreleased。

一人称腕・weapon socket・aim correctionに使う。

Two Bone IK:
https://docs.unity3d.com/ja/Packages/com.unity.animation.rigging%401.2/manual/constraints/TwoBoneIKConstraint.html

Rigging workflow:
https://docs.unity3d.com/ja/Packages/com.unity.animation.rigging%401.2/manual/RiggingWorkflow.html

### ProBuilder

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.probuilder.html

Unity 6000.0 documentationでは `com.unity.probuilder@6.0` / 6.0.8がreleased。

ビル内部のgraybox、collision、route spacingをゲームを動かしながら検証する。

### AI Navigation

https://docs.unity3d.com/ja/6000.0/Manual/com.unity.ai.navigation.html

Unity 6000.0 documentationでは `com.unity.ai.navigation@2.0` / 2.0.9がreleased。

地上敵向け。NavMeshLinkでjump等の特殊遷移も表現できる。

空中敵はNavMeshへ無理に載せず、3D steering / obstacle probingを別実装する。

## A — 実装時に参照

### Physics.Raycast

https://docs.unity3d.com/ja/current/ScriptReference/Physics.Raycast.html

- grapple anchor acquisition
- aim
- hitscan
- ground probe補助

### Rigidbody physics

https://docs.unity3d.com/ja/6000.0/Manual/rigidbody-physics-section.html

完全な物理swing、projectile、physics prop、ragdollを検討するときに使う。

### SpringJoint

https://docs.unity3d.com/ScriptReference/SpringJoint.html

web swingの比較実験候補。最初から最終方式に固定しない。

### Rigidbody interpolation

https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Rigidbody-interpolation.html

物理駆動playerを実験するときのcamera jitter対策。

### Continuous collision detection

https://docs.unity3d.com/ja/current/Manual/physics-optimization-cpu-rigidbody-collision-modes.html

高速projectile / dash / physics objectでtunnelingが出た場合に限定して使う。

### Model file formats

https://docs.unity3d.com/ja/6000.0/Manual/3D-formats.html

Unityは標準モデル形式としてFBX / DAE / DXF / OBJを扱い、可能ならFBXを推奨している。

`third_party/unity-fps/kenney-blaster-kit/` と `kenney-factory-kit/` はUnity-facing sourceとしてFBXを保持する。

### Preparing models for export

https://docs.unity3d.com/ja/6000.0/Manual/models-preparing.html

Unityは1 unit = 1 meterを前提にする。Blender / FBX pipelineでもこの規約を固定する。

### Humanoid import / Avatar

https://docs.unity3d.com/ja/current/Manual/ConfiguringtheAvatar.html

Blenderからhuman arms/body animationを持ち込むときに参照する。

## B — 学習・比較用

### FPS Microgame

https://learn.unity.com/project/fps-template

- Unity Technologiesの小規模FPS教材
- gun / enemy / damage / HUDの完成例を見る用途
- Unity 6.3 production architectureのauthorityにはしない

### Unity FPSSample

https://github.com/Unity-Technologies/FPSSample

大規模な公式FPS sampleだが世代が古い。architecture archaeology用。

見る価値があるもの:

- weapon/prediction/networked FPSの分割
- animation presentation
- first-person / third-person representation分離

新規依存元にはしない。

### Standard Assets Characters

https://github.com/Unity-Technologies/Standard-Assets-Characters

Input System/Cinemachine preview時代の古いsample。現行Starter Assetsとの比較用に限定する。

## External CC0 assets — vendored

### Kenney Blaster Kit 2.1

https://kenney.nl/assets/blaster-kit

- 40 models
- CC0
- weapons / clips / grenades / scopes / silencers / targets / crates
- `third_party/unity-fps/kenney-blaster-kit/`

### Kenney Factory Kit 3.0

https://kenney.nl/assets/factory-kit

- 140 models
- CC0
- factory / warehouse / catwalk / door / conveyor / floor / machinery
- `third_party/unity-fps/kenney-factory-kit/`

### Kenney Crosshair Pack 1.1

https://kenney.nl/assets/crosshair-pack

- 200 designs
- CC0
- 64×64 light PNG subsetをvendor
- `third_party/unity-fps/kenney-crosshair-pack/`

### Kenney Impact Sounds 1.0

https://kenney.nl/assets/impact-sounds

- 130 sounds
- CC0
- footsteps / metal / glass / wood / generic impacts
- `third_party/unity-fps/kenney-impact-sounds/`

### Kenney Sci-fi Sounds 1.0

https://kenney.nl/assets/sci-fi-sounds

- 70 sounds
- CC0
- laser / thruster / engine / force field / explosion
- `third_party/unity-fps/kenney-sci-fi-sounds/`

## External CC0 assets — select on demand

### Poly Haven

https://polyhaven.com/
https://polyhaven.com/license

HDRI / textures / 3D models areCC0。

用途:

- concrete / plaster / metal / glass PBR material
- HDRI lighting
- selected realistic props

ライブラリ全体をmirrorせず、実sceneで必要になったものだけ個別導入する。

### Kenney Prototype Kit

https://kenney.nl/assets/prototype-kit

- 145 models
- CC0
- generic wall / building / character / vehicle / prototype geometry

現時点ではProBuilderがgraybox authorityなので未vendor。ProBuilderだけでは比較しにくい場合に導入する。

## modeling-playground 内の既存資料

Unity側だけでなく、以下をasset authoring側のauthorityとして併用する。

- `docs/humanoid-rigging/README.md`
- `docs/humanoid-rigging/resources.md`
- `scripts/rig_character.py`
- `scripts/build_ik.py`
- `scripts/build_humanoid_deform_study.py`
- `models/raven-*`

Blender側で作るActionとUnity runtime側のviewmodel補正を分離する。