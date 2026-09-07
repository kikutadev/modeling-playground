# Humanoid Rigging / Animation Resources

Updated: 2026-09-07  
Scope: Blender 5.x, humanoid deformation, rigging, animation, Blender Python, glTF 2.0, Three.js

単なるリンク集ではなく、`modeling-playground` で「人型モデルを作って、リグを組み、Actionを作り、GLBとしてゲームで再生する」ために必要な順で整理する。

## 0. 最短ルート

まず以下だけを順番に見る。

1. [Blender Fundamentals 4.5 LTS / Rigging + 3D Animation](https://studio.blender.org/training/blender-fundamentals-45-lts/)
2. [Blender Manual / Armatures](https://docs.blender.org/manual/en/latest/animation/armatures/index.html)
3. [Blender Manual / Weight Paint](https://docs.blender.org/manual/en/latest/sculpt_paint/weight_paint/index.html)
4. [Blender Manual / Rigify](https://docs.blender.org/manual/en/latest/addons/rigify/index.html)
5. [Blender Studio / Stylized Character Workflow — Retopology](https://studio.blender.org/training/stylized-character-workflow/)
6. [Blender Studio / Animation Fundamentals](https://studio.blender.org/training/animation-fundamentals/)
7. [Blender Manual / glTF 2.0 exporter](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)
8. [Khronos glTF Tutorial / Skins](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_020_Skins.md)
9. [Three.js / SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html)
10. [Three.js / AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)

これで、モデリング → skinning → control rig → Action → GLB → browser runtime の全体像がつながる。

---

## 1. 人型モデリングと変形トポロジ

### Blender Studio — Stylized Character Workflow

https://studio.blender.org/training/stylized-character-workflow/

**優先度: S**  
**主題:** sculpt、retopology、body topology、joint loops、face topology

人型モデルをアニメーションさせる前提で作るなら最重要。

特に見る箇所:

- Clean Retopology
- Retopology Setup
- Body Topology — Separate Limbs
- Body Topology — Joint Loops
- Facial Topology — Articulation / Deformations
- Topology Guides — Poles & Edge Flow

このコースの価値は、「ポリゴンを綺麗に並べる」ではなく、**どこが曲がり、どこで体積を維持し、どこへループを逃がすか**を学べること。

`modeling-playground` への適用:

- Milo/Suzu系organic characterの肩、肘、股関節、膝を作り直す際の基準にする。
- RAVENのようなロボットは、無理にcontinuous skinにせず、装甲をrigid pieceとして分離する判断基準にもなる。

### Blender Studio — Realistic Character Workflow / Generic Retopology

https://studio.blender.org/training/realistic-human-research/retopology/

**優先度: A**  
**主題:** realistic human向けのretopo設計

Stylized Character Workflowより短く、最終トポロジを早期に固定する重要性を確認する用途に向く。

### Blender Manual — Sculpting

https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/index.html

**優先度: B**

人型の形状探索用。最終rig用meshとしてそのまま使うのではなく、sculpt → retopoの前段として考える。

### Blender Manual — Remesh

https://docs.blender.org/manual/en/latest/sculpt_paint/sculpting/tool_settings/remesh.html

**優先度: B**

Voxel Remeshは形状探索には便利だが、rigging済みmeshやshape keyとの互換性を期待して使うものではない。最終変形トポロジとは分離する。

---

## 2. Armatureの基礎

### Blender Manual — Armatures

https://docs.blender.org/manual/en/latest/animation/armatures/index.html

**優先度: S**

以下の公式リファレンスの入口。

- bones
- chain structure
- rest pose / pose position
- bone relations
- skinning
- posing
- bone constraints

重要ポイント:

- Edit Modeで変更するのはrest pose。
- 既存animationはrest poseに依存するため、Action制作後に骨格基準を変えると影響が大きい。
- humanoid contractを作るなら、骨名、parent、bone roll、rest poseを先に固定する。

### Blender Studio — Blender Fundamentals 4.5 LTS / Creating a Skeleton

https://studio.blender.org/training/blender-fundamentals-45-lts/blender_4-5_lts_rigging_skeleton/

**優先度: S / 無料**

Blender 5.x時代のUIで基本的な人型skeletonを作る教材。古い2.8 tutorialより先にこちらを見る。

### Blender Manual — Bone Relations

https://docs.blender.org/manual/en/latest/animation/armatures/bones/properties/relations.html

**優先度: A**

Parent、Connected、Inherit Rotation、Inherit Scaleを理解する。

人型では特に:

- pelvisからspine
- clavicleからupper arm
- thighからshin
- non-uniform scaleを含むcontrol rig

で継承設定が破綻しやすい。

### Blender Python API — EditBone

https://docs.blender.org/api/current/bpy.types.EditBone.html

**優先度: S（生成コードを書く場合）**

`head`, `tail`, `parent`, bone作成など、procedural skeletonの基礎。

`modeling-playground/scripts/rig_character.py` の `data.edit_bones.new(...)` と直接対応する。

### Blender Python API — PoseBone

https://docs.blender.org/api/current/bpy.types.PoseBone.html

**優先度: S（生成コードを書く場合）**

Pose時のlocation / quaternion / scale、constraints、custom properties、custom shape等。

生成時のrest boneと、animation時のpose boneを混同しないために読む。

---

## 3. Skinning / Weight Paint / Deformation

### Blender Manual — Skinning

https://docs.blender.org/manual/en/latest/animation/armatures/skinning/introduction.html

**優先度: S**

objectをboneへparentするだけのrigid attachmentと、Armature Modifierによるmesh deformationの違いを押さえる。

### Blender Manual — Armature Modifier

https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/armature.html

**優先度: S**

Vertex Group、Bone Envelope、Preserve Volumeを含むskin deformationの本体。

organic humanoidではsmooth weights、robotでは100% single-bone weightを使い分ける。

### Blender Manual — Weight Paint

https://docs.blender.org/manual/en/latest/sculpt_paint/weight_paint/index.html

**優先度: S**

特に以下を使う。

- Normalize All
- Mirror
- Clean
- Smooth
- Transfer Weights
- Limit Total

ゲーム向けでは「見た目が動く」だけでなく、**各vertexのweight sumが正規化されていること、bone influence数を制御すること**が重要。

`rig_character.py` が現在行っている `sum(weights) == 1` のassertは良い方向性。

### Blender Studio — Blender Fundamentals / Weight Painting

https://studio.blender.org/training/blender-fundamentals-45-lts/

**優先度: S / 無料**

FundamentalsのRigging章にWeight Paintingが含まれる。公式Manualを読む前後の実操作確認に向く。

### Blender Manual — Shape Keys

https://docs.blender.org/manual/en/5.2/animation/shape_keys/introduction.html

**優先度: A（organic character）**

Shape Keyは顔だけでなく、肩・肘・膝等のcorrective deformationにも使える。

用途:

- shoulder raise時の潰れ補正
- deep knee bendの膝裏補正
- elbow bend時の体積補正
- facial expression / phoneme

ただしゲーム用GLBでは、必要性とruntime costを見て使う。まずbone + weightで成立させ、必要箇所のみcorrective shapeへ進む。

---

## 4. IK / FK / Constraints / Control Rig

### Blender Manual — Bone Constraints

https://docs.blender.org/manual/en/latest/animation/armatures/posing/bone_constraints/introduction.html

**優先度: S**

Human rigのcontrol layerの基礎。

- IK
- Limit Rotation
- Copy Rotation
- Copy Transforms
- Child Of
- tracking constraints

### Blender Python API — KinematicConstraint

https://docs.blender.org/api/5.2/bpy.types.KinematicConstraint.html

**優先度: A（procedural rig）**

`chain_count`、pole target、solverの設定をPythonで生成する際に参照する。

### Blender Manual — Rigify

https://docs.blender.org/manual/en/latest/addons/rigify/index.html

**優先度: S**

Blender bundledの自動rig生成システム。

見る順:

1. Basic Usage
2. Bone Positioning Guide
3. Generated Rig Features / Limbs
4. Generated Rig Features / Spine
5. Creating Meta-rigs

Rigifyをそのままproduction dependencyにするかは別として、**control / mechanism / deform boneを分離する設計**の実例として非常に価値が高い。

### Blender Studio — Introduction to Rigging / Humane Rigging

https://studio.blender.org/training/humane-rigging/

**優先度: A / 有料**

古いBlender版の教材だが、UI操作よりも「アニメーターが扱いやすいrigとは何か」という設計思想を学ぶ資料として価値がある。

特に、rigを単なるbone hierarchyではなく**animator向けUI**として考える点が重要。

### Blender Studio — Blender Studio Rigging Tools / CloudRig

https://studio.blender.org/training/blender-studio-rigging-tools/

**優先度: A**

Blender Studioが実制作で使うgenerated rigの考え方。

含まれる主題:

- FK chain
- IK chain
- biped leg
- IK/FK spine
- aim
- parent switching
- action-driven controls
- pose shape keys

Rigifyをさらにproduction-orientedに拡張した構成を観察できる。

---

## 5. Animation / Action制作

### Blender Studio — Animation Fundamentals

https://studio.blender.org/training/animation-fundamentals/

**優先度: S**

人型Actionを「関節角度の列」ではなく、動作として成立させるための最重要教材。

特に:

- timing / spacing
- drag and follow-through
- walk cycle
- jump
- body mechanics
- weight shift
- pantomime

`modeling-playground` ではAttackやBoostが速さだけで誤魔化された動きにならないよう、anticipation → action → follow-through → recoveryの構造を設計する基準になる。

### Animation Fundamentals Rigs

https://studio.blender.org/training/animation-fundamentals/5d69ab4dea6789db11ee65d1/

**優先度: A / rig assetは無料**

教材で使うrigを実際に触れる。既存のMilo rigと比べると、control rigの操作性やbody mechanicsに必要なcontrol量を把握しやすい。

### Blender Fundamentals 4.5 LTS — 3D Animation

https://studio.blender.org/training/blender-fundamentals-45-lts/

**優先度: S / 無料**

2026年時点でBlender 5.2のAnimation UIに更新されている導入教材。

見る項目:

- Preparing for Animation
- Keyframes
- Graph Editor
- Action Editor
- Bones and Constraints

### Blender Manual — Action Editor

https://docs.blender.org/manual/en/5.2/editors/dope_sheet/modes/action.html

**優先度: S**

Actionはゲーム側のAnimationClipにほぼ対応する。

重要:

- `Idle`, `Walk`, `Attack` は別Actionにする。
- Blender 4.4以降のslotted actionsを前提にする。
- active Actionだけでなく、stash / NLAとの関係を理解する。

### Blender Manual — Graph Editor

https://docs.blender.org/manual/en/5.2/editors/graph_editor/introduction.html

**優先度: S**

pose-to-poseで形を作った後のspacing、ease、overshoot、holdの調整に使う。

モーションの「速さ」でなく「加減速」を整える場所。

### Blender Manual — Motion Paths

https://docs.blender.org/manual/en/latest/animation/motion_paths.html

**優先度: A**

手、足、頭、武器先端の軌跡を可視化して、Attackの弧や歩行のfoot trajectoryを確認する。

このリポジトリの自動テストで数値検証している「blade arc」「foot contact」を、Blender上で視覚的に確認するためにも使う。

### Blender Manual — NLA Editor

https://docs.blender.org/manual/en/5.2/editors/nla/introduction.html

**優先度: A**

Actionを再利用・layer・transitionする高レベル編集。

ゲーム向けGLBではNLAそのものをruntimeへ持ち込むのではなく、export対象Actionを管理するためにも使う。

---

## 6. Blender PythonでActionを生成する

### Blender Python API — keyframe_insert

https://docs.blender.org/api/current/bpy.types.bpy_struct.html

**優先度: S**

`keyframe_insert(data_path=..., frame=..., group=...)` が基本。

現在の `scripts/rig_character.py` の方式と一致する。

### Blender Python API — Action

https://docs.blender.org/api/current/bpy.types.Action.html

**優先度: S**

Blender 4.4+のAction Slotsを前提に読む。

古いサンプルで `action.fcurves` だけを直接操作するコードは、そのまま採用しない。

### Blender Python API — ActionSlot

https://docs.blender.org/api/5.2/bpy.types.ActionSlot.html

**優先度: A**

Actionが複数data-block向けanimationを持てる新しい仕組み。

`modeling-playground` のPython生成コードは、Blender 5.x前提なのでこのモデルへ寄せる。

### Blender Python API — FCurve

https://docs.blender.org/api/current/bpy.types.FCurve.html

**優先度: A**

keyframe interpolation、curve evaluation、modifier、sampling処理を自動化する場合に使う。

procedural motionを毎frame bakeする場合と、少数key + Bezierで表現する場合を使い分ける。

---

## 7. glTF / GLBへ持ち出す

### Blender Manual — glTF 2.0 exporter

https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html

**優先度: S**

BlenderのAction/NLAをglTF Animationへどう変換するかの公式資料。

重要事項:

- game用animation libraryはAction単位で管理できる。
- export対象ActionはactiveまたはNLAにstash/push downして関連付ける。
- constraintsやIKの「仕組み」ではなく、最終transformをsampling/bakeして出す考え方が基本。
- glTF標準で扱える主なanimationはnode TRS、skin、morph target。

### Khronos — glTF 2.0 Specification

https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

**優先度: A**

最終的にGLBに何が保存されているかを曖昧にしないための仕様。

特に読む節:

- Skins
- Animations

### Khronos glTF Tutorial — A Simple Skin

https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_019_SimpleSkin.md

**優先度: S**

`JOINTS_0`, `WEIGHTS_0`, inverse bind matrices、joint hierarchyの最小例。

### Khronos glTF Tutorial — Skins

https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_020_Skins.md

**優先度: S**

GLB再読込後のskin deformationをテストするコードを書くなら必読。

### Khronos glTF Tutorial — Animations

https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_007_Animations.md

**優先度: A**

animation sampler / channel / target nodeの関係を理解する。

---

## 8. Three.js runtime

### Three.js — SkinnedMesh

https://threejs.org/docs/pages/SkinnedMesh.html

**優先度: S**

GLB読込後に実際にskin deformationを行うmesh。

### Three.js — AnimationMixer

https://threejs.org/docs/pages/AnimationMixer.html

**優先度: S**

clip再生、cross-fade、pause、time scale等のruntime animation管理の基礎。

`runtime/animation-player.mjs` の設計を比較する公式referenceとして使う。

### Three.js — GLTFLoader

https://threejs.org/docs/pages/GLTFLoader.html

**優先度: S**

BlenderからexportしたGLBのskeleton / skin / AnimationClipの読み込み口。

---

## 9. 参考にするが、そのまま依存しないもの

### Mixamo

https://www.mixamo.com/

**用途:** humanoid auto-rig / motionの比較対象。

素早いbaselineには便利だが、このリポジトリはprocedural modeling / Blender Python / own runtimeの研究が中心なので、最終設計そのものをMixamo依存にはしない。

見るべき点は「標準化されたhumanoid skeletonへ既存motionを載せ替える」という発想。

### BlenRig

https://studio.blender.org/training/blenrig/

**用途:** 高機能character rigの構成例。

facial rig、mesh deform cage、corrective shape keys、weight paintingまで含むため、複雑なorganic characterへ進んだ段階で参照する。

---

## 10. このリポジトリで特に調べるべきテーマ

外部資料を読むだけでなく、以下は実験として残す。

1. **Shoulder deformation study**
   - arm down / 45° / 90° / 150°で肩の潰れを比較。
2. **Hip / knee deformation study**
   - standing / crouch / deep crouch / high kick。
3. **IK/FK matching**
   - switch時にvisual poseが飛ばないこと。
4. **Foot roll**
   - heel strike → flat → toe-off。
5. **Twist distribution**
   - forearm / upper arm / thighにtwist boneを入れた場合と入れない場合。
6. **Root motion vs in-place**
   - 同一Walk/Runを両方式でexportしてruntime差を確認。
7. **Action transition**
   - Idle → Walk → Run → Attack → Walkのcross-fade。
8. **Rigid humanoid vs organic humanoid**
   - RAVENの100% rigid weightとMiloのsmooth skinningを同じcontractで扱う。
9. **Corrective Shape Key**
   - shoulder / elbow / kneeの最小1箇所でGLB morph exportまで通す。
10. **Retargeting**
    - 共通bone contractでMilo向けActionを別人型へ流用できるか確認。

実装側の具体案は [playbook.md](playbook.md) にまとめる。