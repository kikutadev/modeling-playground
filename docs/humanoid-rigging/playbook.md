# Humanoid Rigging Playbook for modeling-playground

Updated: 2026-09-07  
Target: Blender 5.x → GLB → Three.js runtime

この文書は、外部資料の内容を `modeling-playground` の実装方針へ落としたもの。

目的は、モデルごとに毎回違う骨格・違うAction生成を作るのではなく、**人型なら共通化できる部分をcontract化し、organic characterとrigid robotの両方で使えるようにすること**。

---

## 1. まず分離するもの

人型制作では、次の4層を混ぜない。

### 1.1 Geometry

見た目のmesh。

- organic body
- clothes
- hair
- armor
- weapon

### 1.2 Deform skeleton

最終的にGLBへ出し、vertexを変形させるbone。

例:

- `DEF-Hips`
- `DEF-Spine`
- `DEF-UpperArm.L`
- `DEF-Forearm.L`

### 1.3 Control rig

Blenderでアニメーターまたは生成コードが操作するbone / target / constraint。

例:

- `CTRL-Root`
- `CTRL-Hips`
- `CTRL-HandIK.L`
- `CTRL-FootIK.L`
- `CTRL-KneePole.L`

原則としてcontrol boneは直接meshをdeformしない。

### 1.4 Runtime contract

GLB外で必要なゲーム固有情報。

例:

- animation mode: loop / once
- root motion mode
- IK metadata
- weapon socket
- hit volumes
- event timing

既存の `extras.ikRig` や `.asset.json` の考え方はここへ置く。

---

## 2. 推奨Humanoid bone hierarchy

最初の共通contractは、指・顔を除いたゲーム向け中規模rigにする。

```text
Root
└─ Hips
   ├─ Spine
   │  └─ Chest
   │     ├─ Neck
   │     │  └─ Head
   │     ├─ Clavicle.L
   │     │  └─ UpperArm.L
   │     │     └─ Forearm.L
   │     │        └─ Hand.L
   │     └─ Clavicle.R
   │        └─ UpperArm.R
   │           └─ Forearm.R
   │              └─ Hand.R
   ├─ Thigh.L
   │  └─ Shin.L
   │     └─ Foot.L
   │        └─ Toe.L
   └─ Thigh.R
      └─ Shin.R
         └─ Foot.R
            └─ Toe.R
```

### 2.1 現在のMiloとの差分

`scripts/rig_character.py` の18 boneは実験としては十分だが、共通humanoid contractには以下を追加したい。

- `Clavicle.L/R`
- `Toe.L/R`
- 必要なら `UpperArmTwist.L/R`
- 必要なら `ForearmTwist.L/R`
- 必要なら `ThighTwist.L/R`

肩と足運びを自然にするには、clavicleとtoeの価値が高い。

### 2.2 RootとHipsを分ける

`Root`:

- world-space locomotion
- root motion
- model全体の移動

`Hips`:

- body mechanics
- 上下動
- sway
- yaw
- weight shift

この分離により、in-place animationでも腰の動きを消さずに済む。

---

## 3. Rest pose

### 3.1 推奨

A-poseを基本にする。

理由:

- shoulder deformationをT-poseより自然な中間状態で作りやすい。
- upper armの極端な90°外転をrestにしない。
- 腕を下げるanimationで肩が潰れにくい。

ただしretarget先がT-pose前提なら変換層を持つ。

### 3.2 固定すべきもの

Action制作前に以下をcontract化する。

- unit: meter
- up axis: Blender Z-up / glTF Y-up変換はexporterに任せる
- forward direction
- bone names
- parent hierarchy
- bone roll
- left/right naming
- rest pose
- root origin
- foot sole height

既存のMiloコードのように座標値を直接Pythonへ埋める場合、これらをmodel-specific constantではなくrig definitionへ寄せる。

---

## 4. Modeling requirements for deformation

人型meshはrigging後に直すのではなく、曲げることを前提に作る。

### 4.1 Elbow / knee

最低限:

- joint中心の前後にloopを置く。
- bend側だけに密度を寄せすぎない。
- 90°以上曲げた時に外側の面が不足しないようにする。

テストpose:

- 0°
- 45°
- 90°
- 130°

### 4.2 Shoulder

人型で最も破綻しやすい。

必要な考え方:

- armだけでなくclavicleを動かす。
- deltoid周辺へ放射状にedge flowを逃がす。
- arm raiseで脇が潰れすぎない。
- chestとの境界を一直線のloopにしない。

テストpose:

- arm down
- 45° raise
- 90° T
- 150° overhead
- forward reach

### 4.3 Hip

- leg loopだけでなくpelvis / gluteへ流れをつなぐ。
- deep crouchで前側が潰れ、臀部が消えないようにする。

テストpose:

- standing
- 90° hip flexion
- deep crouch
- side kick
- forward lunge

### 4.4 Wrist / ankle

大きく曲げるモデルなら1関節1loopでは不足しやすい。

robotではmesh deformationよりpart separationを優先する。

---

## 5. Organic characterとrigid robotを同じcontractで扱う

### Organic

- 1 vertexあたり複数bone influence
- smooth weights
- Preserve Volumeを検討
- twist boneを必要に応じて利用
- corrective Shape Keyを局所利用

### Rigid robot

- armor panelは原則1 bone 100%
- jointの内部機構のみ別boneまたはmechanism object
- 金属板をsmooth skinningで曲げない
- socket connectionを明示する

RAVENで既に行っている「各頂点を1本のboneへ100%」は正しい方針。

共通化すべきなのはweight方式ではなく、**skeleton semanticsとAction semantics**。

---

## 6. IK / FK design

### 6.1 Legs

最低限:

- `CTRL-FootIK.L/R`
- `CTRL-KneePole.L/R`
- thigh → shin の2-bone IK
- foot orientation follow

追加:

- heel pivot
- ball/toe pivot
- foot roll property

### 6.2 Arms

最低限:

- `CTRL-HandIK.L/R`
- `CTRL-ElbowPole.L/R`
- upper arm → forearm の2-bone IK

攻撃では:

- sword handをIK targetで誘導する方式
- FKで大きなarcを描く方式

の両方を使えるようにする。

### 6.3 IK/FK switch

最終的には0..1のcustom propertyでblendできる設計が望ましいが、まずは0/1切替でよい。

必須条件:

- FK → IK切替時に手足が飛ばない。
- IK → FK切替時に見た目のposeを維持する。

つまり「switch」だけでなく「match」が必要。

既存Milo IK版の次の研究テーマにする。

---

## 7. Twist bones

forearm、upper arm、thighでは長軸回転を1本のboneだけへ集中させるとcandy-wrapper deformationが出やすい。

追加候補:

```text
UpperArm.L
└─ UpperArmTwist.L
   └─ Forearm.L
      └─ ForearmTwist.L
         └─ Hand.L
```

ただし最初から全モデルへ必須化しない。

比較実験:

1. no twist
2. 1 twist bone
3. 2 distributed twist bones

を同じmeshで比較し、必要性を決める。

robotには原則不要。

---

## 8. Corrective deformation

bone + weightだけで不十分な箇所に限定して使う。

優先順:

1. shoulder raise
2. elbow deep bend
3. knee deep bend
4. hip flexion

BlenderではRelative Shape Keyを使い、driverでjoint angleへ連動させる方式を研究する。

ゲーム側へ出す場合:

- GLB morph targetに出ること
- animationまたはruntime制御が必要か
- vertex count / morph countが許容か

を確認する。

---

## 9. Action architecture

ゲーム用animationは1つの長いtimelineへ並べず、Action単位にする。

### Core locomotion

- `Idle`
- `Walk`
- `Run`
- `Sprint` optional
- `JumpStart`
- `JumpLoop`
- `JumpLand`
- `Fall` optional

### Combat

- `AttackLight1`
- `AttackLight2`
- `AttackHeavy`
- `HitFront`
- `HitBack` optional
- `Guard` optional
- `Death`

### Robot specific

- `BoostStart`
- `BoostLoop`
- `BoostEnd`
- `FirePrimary`
- `MissileLaunch`

### Rule

1 Action = 1 runtime semantic unit。

`Walk+Attack`のような組み合わせは、必要ならruntime blendまたはupper-body additiveへ進む。

---

## 10. Actionの中身をどう作るか

### 10.1 Pose structure

攻撃なら最低でも:

1. anticipation
2. contact / peak action
3. follow-through
4. recovery

歩行なら:

1. contact
2. down
3. passing
4. up
5. opposite contact

を最初にkey poseとして置く。

毎frameの角度を先に決めない。

### 10.2 Python生成の場合

今の `rig_character.py` は毎frameIKを解いて60/30fps相当でbakeする方式。

これは:

- procedural locomotion
- deterministic tests
- GLB互換性

には強い。

一方、手付け的な攻撃actionは:

- sparse key poses
- quaternion interpolation
- Graph Editor調整

の方が編集しやすい。

したがって共通pipelineは両方許容する。

### 10.3 Interpolation

- baked solver結果: LINEAR samplingでよい。
- authored animation: BEZIER / AUTO CLAMPEDを基本にする。
- contact / hold: interpolationとhandleを意識して足滑りを抑える。

---

## 11. Root motion

### In-place

Rootは原点付近。
ゲームコードがcharacter controllerを移動する。

向くもの:

- responsive TPS
- speedをruntimeで変えたい
- network sync

### Root-motion

Root bone自体が前進する。

向くもの:

- attack lunge
- cinematic movement
- motionそのものの距離が重要

### modeling-playgroundでの方針

両方を明示的に扱う。

例:

- `Walk`: in-place
- `WalkAdvance`: root-motion test
- `AttackHeavy`: root-motionあり
- `Idle`: none

metadataに `motion: in-place | root-motion | none` を持たせる。

STRIXの `Walk` / `Advance` が既に良い比較例になっている。

---

## 12. Foot contact

人型walkで最も目立つ破綻はfoot sliding。

自動QA項目:

- stance phase中のfoot world X/Y移動量
- soleのfloor penetration
- foot lift minimum
- loop seamでfoot transform連続

視覚QA:

- Motion Path
- moving ground
- side view
- heel/toe contact marker

既存 `sprite-walk` とMilo walkの検証を3D humanoid contractへ統合したい。

---

## 13. Upper body mechanics

人型の自然さは手足だけでは出ない。

歩行:

- pelvis yaw
- chest counter-rotation
- slight lateral sway
- head stabilization

attack:

- foot placement
- pelvis rotation
- chest rotation
- clavicle
- shoulder
- elbow
- wrist

の順で力が伝わる。

腕だけ振るactionは避ける。

RAVENのslashにも、腰→胸→肩→腕→bladeのphase offsetを明示的に入れる。

---

## 14. Blender 5.x Action handling

このリポジトリはBlender 5.x前提なので、古いAction APIだけを前提にしない。

注意点:

- Action Slotsがある。
- `keyframe_insert()`に任せるとAction/slot生成をBlender側へ委譲できる。
- FCurveを直接辿る場合はlayer / strip / channelbag構造を考慮する。

現行 `rig_character.py` の:

```python
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                ...
```

という対応は、Blender 5.xのlayered Actionを意識できている。

今後も2.x系APIへ戻さない。

---

## 15. Blender rigとGLB rigを分ける

`.blend`:

- IK constraints
- control bones
- pole targets
- drivers
- custom shapes
- animator-friendly UI

`.glb`:

- deform skeleton
- skin weights
- baked bone transforms
- morph targets if needed
- named animation clips

原則としてゲーム用GLBへBlender内部mechanismを持ち込もうとしない。

必要なruntime IKだけは `extras` / asset contractで別定義する。

Milo IK版で既にこの考え方を採っているため、人型共通contractへ昇格させる。

---

## 16. GLB export checklist

- scale applied
- mesh / armature transform sane
- unit meter
- deform bonesだけで成立する
- weight normalized
- influence countを確認
- Action names固定
- export対象Actionがactiveまたはstashed
- animation sampling有効
- shape keysを使う場合はmorph export確認
- custom metadataを使う場合はextras export
- export後にGLBを再import / Three.js loadして確認

Blender内で動いたことを合格条件にしない。

---

## 17. Runtime animation contract案

将来の `.asset.json` / `extras` では、少なくとも以下を表現する。

```json
{
  "rig": {
    "type": "humanoid-v1",
    "root": "Root",
    "hips": "Hips",
    "leftFoot": "Foot.L",
    "rightFoot": "Foot.R",
    "leftHand": "Hand.L",
    "rightHand": "Hand.R"
  },
  "animations": {
    "Idle": {
      "mode": "loop",
      "motion": "none"
    },
    "Walk": {
      "mode": "loop",
      "motion": "in-place"
    },
    "AttackHeavy": {
      "mode": "once",
      "motion": "root-motion",
      "events": [
        { "time": 0.46, "type": "hit-start" },
        { "time": 0.62, "type": "hit-end" }
      ]
    }
  }
}
```

これは確定仕様ではなく、既存RAVEN/STRIX metadataを人型へ一般化する出発点。

---

## 18. Cross-fade policy

runtimeで最低限:

- Idle ↔ Walk: 0.15–0.25s
- Walk ↔ Run: 0.15–0.25s
- locomotion → Attack: 短め
- Attack → locomotion: recoveryに合わせる
- Death: fadeせずone-shot

時間値はmodel-specificにできるようにする。

重要なのは「Action単体の見た目」だけでなく、**実際のゲームで前後のActionとつながった時に自然か**をQAすること。

---

## 19. Required deformation test poses

新しいhumanoid assetは、animation制作前に以下のpose sheetを自動生成する。

### Arms

- arms down
- T pose
- overhead
- elbow 90°
- elbow 130°
- forearm twist
- hand forward reach

### Legs

- standing
- knee 90°
- deep crouch
- forward lunge
- side raise
- toe-off

### Torso

- forward bend
- backward bend
- side bend
- twist left/right

### Combined

- walk contact
- walk passing
- run contact
- attack windup
- attack follow-through

front / side / back / quarterでrenderして比較する。

---

## 20. Automated QA

人型rigを生成したら以下をtestする。

### Skeleton

- required bone names
- unique names
- expected parents
- no zero-length bones
- finite transforms

### Skin

- every deforming vertex has influence
- sum(weights) ≈ 1
- max influence count within contract
- invalid group namesなし

### Animation

- required clips exist
- expected duration range
- no NaN / Inf
- loop clipのfirst/last pose差
- root motion distance
- foot penetration
- hand/blade trajectory

### GLB reload

- Blender生成直後ではなく、GLBを再読込して同じ検査
- Three.js側でもclip names / bone names / SkinnedMeshを確認

既存RAVEN/STRIXの「export後のGLBを再読込して検証する」方針を標準化する。

---

## 21. 次にこのrepoで作るべき研究asset

優先順位:

### 1. `humanoid-deform-study`

単色の人型素体。

- clean topology
- clavicle / toeあり
- smooth skin
- test posesのみ

見た目より肩・股関節の変形を研究する。

### 2. `humanoid-rig-study`

同じ素体へ:

- FK
- leg IK
- arm IK
- IK/FK switch
- foot roll

を追加。

### 3. `humanoid-action-study`

- Idle
- Walk
- Run
- Jump
- Light Attack
- Heavy Attack

を作り、Action transition galleryを作る。

### 4. Miloへ移植

study rigが安定してからMiloへ戻す。

### 5. RAVENへsemantic contractだけ移植

RAVENはrigid weightingを維持しつつ、bone/action namingとruntime contractをそろえる。

---

## 22. 判断基準

人型リグが「できた」と判断する条件は、boneが動くことではない。

次を満たして初めてproductionに近づく。

- 大きく曲げてもsilhouetteとvolumeが不自然に崩れない。
- 足が滑らない。
- 肩と骨盤が動作に参加する。
- Action間のtransitionが自然。
- IK/FKが編集可能。
- BlenderだけでなくGLB再生でも同じに見える。
- animationとrigが別モデルへ再利用できる。
- Python再生成と自動QAが可能。

この基準でMilo、Suzu、RAVENの順に再評価する。