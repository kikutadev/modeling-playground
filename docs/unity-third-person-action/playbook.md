# Unity Third-Person Action Playbook

Updated: 2026-09-07

## 1. Runtime architecture

```text
PlayerRoot
├─ CharacterController
├─ PlayerInputFacade
├─ PlayerMotor
├─ PlayerFacing
├─ PlayerActionController
├─ PlayerTargeting
├─ PlayerCombat
├─ PlayerHealth
├─ ModelRoot
│  ├─ Animator
│  └─ RigBuilder
└─ CameraTarget

CameraRig
├─ ExploreCamera
├─ AimCamera
├─ LockOnCamera
└─ FinisherCamera
```

責務を分ける。

- `PlayerMotor`: grounded/airborne velocity、jump、sprint、collision
- `PlayerFacing`: movement/camera/targetのどれへ向くか
- `PlayerActionController`: dodge/attack/hit等のaction state
- `PlayerTargeting`: candidate search、lock、switch、line of sight
- `PlayerCombat`: attack definition、hitbox、damage
- `Animator`: visual pose / transition

Animator parameterをgameplay stateの唯一のsource of truthにしない。

## 2. Locomotion

### Free movement

camera-relative inputをworld directionへ変換し、characterはmovement directionへ旋回。

最低parameter:
- planar speed
- move x/z
- grounded
- vertical velocity
- turn speed

### Lock-on locomotion

character forwardをtargetへ向けたまま、入力をstrafe directionへ変換する。

Blend Treeは最低でも:
- forward
- backward
- left
- right

可能なら8-directionを用意する。前進clipを無理に反転して全方向を作るとfoot slideが目立つ。

## 3. Rotation

rotation policyをactionごとに持たせる。

- `Free`: input directionへ旋回可能
- `Target`: lock targetへ追従
- `Limited`: startup中のみ一定角度まで補正
- `Locked`: animation開始方向を維持

近接攻撃中に毎frame targetへ完全追従すると、モーションが敵へ吸い付いて不自然になる。攻撃開始時のsoft correctionと、その後のturn limitを分ける。

## 4. Root motion policy

探索移動はin-place + code-drivenを基本にする。

root motion候補:
- roll
- dash
- committed attack
- lunge
- finisher
- vault / mantle

root motionを使うactionでも、collisionとaction cancelはgameplay codeがauthorityを持つ。

評価項目:
- authored travel distance
- obstacle collision
- slope
- target overshoot
- hit stop中のdelta
- animation speed変更時のtravel distance

## 5. Attack definition

1つの攻撃をScriptableObject相当のデータとして持つ。

```text
AttackDefinition
- id
- clip / state id
- startup seconds
- active windows[]
- recovery seconds
- root-motion policy
- rotation policy
- max correction angle
- cancel windows[]
- stamina cost
- hitboxes[]
- damage profile
- hit stop
- camera impulse
- VFX/SFX cues
```

AnimationClipのnormalized timeだけにcombat timingを埋め込まない。clip差し替え時にgameplay timingをレビューできる形にする。

## 6. Combo

入力bufferとcombo branchを分離する。

例:

```text
Light1 -> Light2 -> Light3
   └----> HeavyFinisher
```

必要な概念:
- input buffer window
- queue acceptance window
- cancel window
- branch condition
- recovery

「ボタンを押した瞬間に次attackへ遷移」ではなく、現在actionの許可windowでqueueを消費する。

## 7. Hitbox / hurtbox

render mesh colliderへ依存しない。

weapon側:
- blade base
- blade tip
- swept segment/capsule

character側:
- head
- torso
- limbs

高速な剣ではframeごとの単純Overlapだけでなく、前frame→現frameのsweepを使い抜けを防ぐ。

同じattackで同じtargetへ複数回hitしないよう、active window単位のhit registryを持つ。

## 8. Hit reaction / hit stop

feedbackを分ける。

- victim reaction animation
- attacker hit stop
- victim hit stop
- camera impulse
- controller rumble
- VFX
- SFX
- knockback

hit stopをTime.timeScale全体だけで実装するとUI/particle/audio等を巻き込みやすいため、必要範囲を限定できる設計を検討する。

## 9. Dodge

dodgeは単なる無敵移動ではなく以下を定義する。

- input direction
- facing policy
- distance
- duration
- invulnerability window
- cancel rule
- stamina
- collision handling

root motion版とkinematic版を比較し、見た目と操作性のどちらが重要か決める。

## 10. Lock-on targeting

candidate score例:

```text
score =
  screenCenterWeight
+ distanceWeight
+ facingWeight
+ currentTargetStickiness
- occlusionPenalty
```

単純なnearest enemyだけにしない。

切替はscreen-space left/rightを基準にすると直感的。

lock解除条件:
- death
- range exceeded
- long occlusion
- manual unlock

短時間遮蔽だけで即解除しない。

## 11. Camera

### Explore

- orbit input
- camera-relative movement
- soft recenter optional
- collision/deocclusion

### Aim

- shoulder offset
- tighter FOV
- camera forward aim
- upper-body rig

### LockOn

- player + target framing
- target distanceに応じたdistance/FOV adjustment
- rapid flip suppression

### Camera collision

壁とのcollision解決をplayer collisionと分離する。

狭い室内でcameraがplayer内部へ入りすぎる場合は:
- camera radius
- minimum distance
- fade/dither of player model
- shoulder offset reduction

を段階的に使う。

## 12. Animation layers

例:

```text
Base Layer
- Locomotion
- Jump
- Full-body actions

UpperBody Layer
- Aim
- Shooting
- light additive reaction

Additive Layer
- breathing
- recoil
- small procedural offsets
```

Avatar Maskで必要な部位だけ重ねる。

full-body meleeをupper-body layerへ無理に載せない。

## 13. Animation Rigging

runtime補正に限定する。

用途:
- left hand weapon grip
- head look
- upper-body aim
- hand contact
- foot correction

base animationのbody mechanicsをIKで作り直さない。

## 14. Enemy

melee enemyの最低state:

```text
Idle
Alert
Approach
Strafe/Reposition
Telegraph
Attack
Recover
Hit
Guard/Stagger (optional)
Dead
```

NavMeshAgentのdesired velocityをanimation parameterへ渡すが、attack中はnavigationとaction movementのauthorityを明示的に切り替える。

## 15. Target matching / contextual action

finisher、vault、door interaction等では、animation開始前にtarget transformを決め、必要ならposition/rotationを補正する。

characterをanimationの途中でtargetへ強く吸着させるより:
1. pre-align
2. animation
3. minor runtime correction

の順を優先する。

## 16. QA gate

### Locomotion
- 8方向のfoot slideが許容範囲
- 30/60/120fpsで速度差がない
- camera direction急変時にcharacterが不自然にsnapしない
- slope/stairで足が極端に浮かない

### Camera
- wallでcameraが貫通しない
- 狭い廊下で振動しない
- lock-on targetが左右を横切ってもcameraが180°flipしにくい
- player/targetの視認性を保つ

### Combat
- startup/active/recoveryが視認できる
- attack rangeと見た目のblade arcが一致
- 1 swing 1 targetあたり意図したhit数
- dodge invulnerabilityと見た目が大きく乖離しない
- hit stop後にroot motionが跳ねない

### Animation
- locomotion -> attack -> locomotionの接続で足が大きく滑らない
- combo間に姿勢が瞬間移動しない
- left/right turnが自然
- root motion clipのstart/end orientationが仕様通り
- retarget後に肩/手首/膝が破綻しない

## 17. modeling-playgroundとの接続

Blender側では以下を共通contract化する。

- rest pose
- root / hips
- forward axis
- meters
- humanoid bone naming/mapping
- weapon socket
- clip name
- in-place/root-motion flag
- contact / active window metadata

`docs/humanoid-rigging/` の変形・リグ研究を、三人称では実際のfull-body action品質のauthorityとして使う。