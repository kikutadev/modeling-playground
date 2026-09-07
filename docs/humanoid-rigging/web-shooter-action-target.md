# Web Shooter Action Target — Humanoid Rig / Animation Requirements

Updated: 2026-09-07  
Target: Blender 5.x → GLB → Three.js runtime

## 1. Game target

現時点のモデリング／リグ研究の目的は、一般的な「歩ける人型キャラクター」ではない。

**スパイダーマンライクなWebシューターで、ビルの内外を高速に移動しながら、空中の敵と戦うアクションゲーム**を成立させることを目標とする。

必要な動作は大きく次の6系統へ分かれる。

1. Web swing / grapple traversal
2. Airborne steering / tuck / extension
3. Wall contact / wall run / wall jump
4. Aerial aiming / web shooting
5. Aerial melee / dodge
6. Landing / recovery / immediate re-launch

このため、通常のwalk/run animationを先に磨くより、極端な肩・股関節可動域、片手固定IK、空中でのbody line、animation blendingを先に検証する。

---

## 2. Rigに必要な能力

### 2.1 Rootとcenter of massを分ける

`Root`はゲーム世界でのキャラクター移動を表す。

`Hips`はvisualな重心・骨盤運動を表す。

Web swing中の実際の軌道はphysics/controllerが所有し、animation clipがRoot位置を勝手に決めないことを基本とする。

用途:

- `Root`: capsule/controller/world transform
- `Hips`: tuck、伸展、反動、着地衝撃、counter rotation

### 2.2 Clavicle必須

片腕を頭上まで伸ばすWeb swingでは、上腕だけを回すrigは肩がほぼ確実に破綻する。

最低限:

- `Clavicle.L/R`
- `UpperArm.L/R`
- `Forearm.L/R`
- `Hand.L/R`

Production topologyでは150°前後のarm raiseを変形テストする。

### 2.3 腕IK/FK

必要なモードは両方。

**IK**

- Web anchorへ手を固定する
- 壁へ手を置く
- 特定の敵／オブジェクトへ手を伸ばす

**FK**

- 空中の自由な腕振り
- punch / kickのcounter motion
- release後のfollow-through

Production rigではIK/FK snapを必須とする。

Blender 5.2 RigifyはlimbについてIK/FK switching、snapping、IK parent switchingを標準で提供するため、control-rig設計のリファレンスとして使う。

Reference:

- https://docs.blender.org/manual/en/5.2/addons/rigify/rig_features.html

### 2.4 IK Parent Switching

Web swingでは、手のIK targetの基準座標を状態に応じて変える必要がある。

例:

```text
free air
Hand IK parent = Root / World

web attached
Hand IK parent = WebAnchor

wall contact
Hand IK parent = WallContact

release
Hand IK parent = Root / World
```

切替時に手が飛ばないよう、world transformを保ったparent switching / snappingが必要。

### 2.5 Pole targets

肘・膝の方向を制御する。

特に必要なのは:

- 片手頭上Web swing時の肘
- tuck時の膝
- wall contact時の膝
- landing時の膝

Classic pole targetまたは同等のbend-direction controlを持つ。

Blender IK constraintのPole Targetは、IK chainのroll、つまり肘・膝の向きを決めるために使える。

Reference:

- https://docs.blender.org/manual/en/5.2/animation/constraints/tracking/ik_solver.html

### 2.6 Toe / heel

通常走行以上にwall run、wall jump、landingで必要。

- `Foot.L/R`
- `Toe.L/R`
- heel / toe pivot control

足首だけで接地を表現しない。

### 2.7 Twist distribution

Production rigで追加する。

候補:

- UpperArmTwist.L/R
- ForearmTwist.L/R
- ThighTwist.L/R

Web swingは腕の軸方向rotationが大きいため、forearmだけへtwistを集中させない。

---

## 3. Animationをphysicsから分離する

Web swingの軌道そのものをBlender clipとして固定しない。

### Physics / gameplay owns

- character world position
- velocity
- rope/web length
- anchor position
- gravity
- collision
- wall normal
- enemy target position

### Animation owns

- body extension / compression
- shoulder reach
- leg tuck / spread
- anticipation / follow-through
- silhouette
- landing compression
- attack motion

### Procedural layer owns

- hand → web anchor IK
- feet / hand → wall contact IK
- head / chest → aim target
- small pelvis alignment to velocity
- weapon/web emitter orientation

この分離により、建物の高さ・anchor距離・速度が変わっても同じbase animationを使える。

---

## 4. Runtime animation architecture

単一の巨大なstate animationへ全てを焼き込まない。

想定する層:

```text
World/controller transform
    ↓
Base locomotion pose
    ↓
Traversal pose
    ↓
Upper-body aim / shoot layer
    ↓
Attack / reaction layer
    ↓
Procedural IK / look-at
    ↓
Final skeleton
```

Three.jsの`AnimationAction`はweight、crossFade、timeScale、normal/additive blend modeを持つため、clip transitionの基盤には使える。

References:

- https://threejs.org/docs/pages/AnimationAction.html
- https://threejs.org/manual/en/animation-system.html

ただし「上半身だけclipを適用するbone mask」はThree.jsの`AnimationAction`単体の高水準APIとして自動提供されるものではない。必要ならclip trackをbone単位で分離／filterするruntime層を作る。

---

## 5. 最初に検証するAction

`humanoid-deform-study` では以下を持つ。

### Neutral

rest基準。

確認:

- bind pose
-左右差
- ground level

### SwingReach

片腕をanchor方向へ伸ばし、胴体と脚を長く使う。

重点:

- clavicle
- shoulder raise
- lat/armpit volume
- torso extension

### SwingTuck

swingの圧縮位相。

重点:

- hip flexion
- deep knee bend
- pelvis/abdomen compression
- shoulder + elbow extreme range

### WallRun

壁面移動の非対称pose。

重点:

- torso side lean
- alternating legs
- hand reach
- foot contact orientation

### AerialAim

空中姿勢を維持したまま片腕で照準。

重点:

- chest twist
- head target tracking
- upper/lower-body separation

### AirKick

空中近接。

重点:

- one-leg extension
- opposite-leg tuck
- pelvis counter rotation
- readable silhouette

### Landing

深い着地。

重点:

- deep crouch
- hip / knee deformation
- torso compression
- immediate transition back to traversal

---

## 6. Production animation setの分割案

### Ground

- Idle
- Run
- Sprint
- Stop
- Turn
- JumpStart
- JumpRise

### Air

- AirNeutral
- AirRise
- AirFall
- AirSteerLeft/Right
- AirTuck
- AirExtend

### Web traversal

- WebAttach
- SwingNeutral
- SwingTuck
- SwingExtend
- SwingRelease
- WebZipStart
- WebZipTravel
- WebZipEnd

### Wall

- WallPlant
- WallRun
- WallRunTurn
- WallJump
- WallRelease

### Combat

- AirAim
- WebShot
- AirPunch1/2
- AirKick1/2
- LaunchEnemy
- AirDodge
- HitAir
- HitGround

### Landing

- SoftLand
- HardLand
- RollLand
- LandToRun

最初から全Actionを作らない。まずrange poseとtransitionの成立を検証し、ゲームcontrollerの試作と並行して必要clipを確定する。

---

## 7. Sockets / runtime contract

最低限:

```text
Hand.L      -> web-left
Hand.R      -> web-right
Head        -> aim
Hips        -> center-mass
Foot.L      -> foot-left
Foot.R      -> foot-right
```

後で追加候補:

```text
Chest       -> chest-aim
Forearm.L/R -> web-device
Toe.L/R     -> precise wall contact
```

web lineはanimation meshへ直接焼き込まない。

`WebAnchor(world)` と `HandSocket(world)` をruntimeで結ぶ。

---

## 8. Retargeting

最終キャラクターを差し替えられるよう、bone semanticsを固定する。

Three.jsには`SkeletonUtils.retarget()` / `retargetClip()`があるため、同一rigでないassetからclipを移す選択肢もある。

Reference:

- https://threejs.org/docs/pages/module-SkeletonUtils.html

ただしproductionでは「retargetできるからbone namingは自由」とはしない。最初からこのrepoのhumanoid contractを固定し、retargetは外部motion取り込み用の変換層として扱う。

---

## 9. QA gate

各production characterは最低限以下を通す。

### Geometry / skin

- shoulder 150° raiseで破綻しない
- elbow 130°で潰れすぎない
- hip 90°以上でpelvisとの境界が破綻しない
- deep crouchで膝裏が反転しない
- forearm twistでcandy-wrapper deformationが目立たない

### Rig

- arm IK/FK snapでpose jumpがない
- leg IK/FK snapでpose jumpがない
- web anchor parent switchingでhand world positionが飛ばない
- pole変更で肘膝を意図した向きへ制御できる
- unreachable IK targetで骨が無制限にstretchしない

### Runtime

- GLB再読込可能
- 全Action名がcontractと一致
- clip transition時にNaN/巨大scaleなし
- hand socketがweb lineと一致
- wall contact中のfoot/hand driftを許容値内に保つ
- physics rootとanimation hipsを二重適用しない

---

## 10. 現在の実装ステップ

1. `humanoid-deform-study` — range/deformation study
2. arm/leg IK control rig
3. IK parent switching study
4. runtime WebAnchor → Hand IK
5. base swing controllerとの統合
6. upper-body aim layer
7. production character topologyへ移植

歩行animationの完成度を上げる作業は、この系列の後でもよい。ゲームのコア体験に直接必要なのはまず空中・壁・Web anchor周りである。
