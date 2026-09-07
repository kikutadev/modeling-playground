# Unity First-Person Action Playbook

Updated: 2026-09-07

## 1. Runtime architecture

最初から巨大な `PlayerController` 1クラスへ集約しない。最低でも以下へ分ける。

```text
PlayerRoot
├─ CharacterController
├─ PlayerMotor
├─ PlayerLook
├─ PlayerInputFacade
├─ PlayerCombat
├─ PlayerHealth
├─ WorldModel
└─ ViewModelRoot
   ├─ ViewModelAnimator
   ├─ WeaponMount
   └─ CurrentWeapon
```

責務:

- `PlayerMotor`: velocity、grounding、slope、step、jump、sprint、crouch
- `PlayerLook`: yaw/pitch、sensitivity、camera orientation
- `PlayerInputFacade`: Input System を gameplay command へ変換
- `PlayerCombat`: 現在武器、fire/reload/aim command の仲介
- `PlayerHealth`: damage / death
- `ViewModelRoot`: 一人称の腕・武器だけ

Camera や Animator から gameplay state を逆算しない。gameplay state が camera / animation へ presentation state を渡す。

## 2. Movement

### Baseline

Starter Assets の FirstPerson Controller を動作基準にする。ただし、ゲーム固有機能はそのファイルへ直接積み上げず、`PlayerMotor` 相当へ整理する。

最初に固定する値:

- walk speed
- sprint speed
- acceleration
- deceleration
- air acceleration
- jump height
- gravity
- slope limit
- step offset
- capsule height / radius
- standing / crouching eye height

### Frame-rate independence

- velocity は units / second
- acceleration は units / second^2
- damping は `1 - exp(-k * dt)` 型など frame-rate に依存しない補間を使う
- recoil recovery も `Lerp(current, target, fixedFraction)` を毎 frame 使わない

30 / 60 / 120 / 240 fps で走行距離、jump apex、recoil recovery が大きく変わらないことをテストする。

## 3. Look / camera

Player body yaw と camera pitch を分離する。

```text
PlayerRoot (yaw)
└─ CameraPivot (pitch)
   ├─ GameplayCamera
   └─ ViewModelRoot
```

pitch clamp は camera pivot にだけ適用する。

### Camera feedback layers

1. raw mouse / stick look
2. recoil offset
3. movement bob
4. landing impulse
5. damage impulse
6. cinematic transition

を概念上分ける。

最終 camera transform を各 feature が直接上書きすると競合するため、offset accumulation か Cinemachine extension / modifier に寄せる。

## 4. Weapon model

武器の static definition と runtime state を分離する。

### WeaponDefinition

ScriptableObject 候補:

- id
- display name
- fire mode
- rounds per minute
- damage
- range
- projectile speed
- spread
- recoil pattern parameters
- magazine size
- reserve ammo type
- reload duration
- ADS FOV / zoom
- viewmodel prefab
- world model prefab
- muzzle VFX
- impact profile
- fire SFX

### WeaponRuntime

instance state:

- ammo in magazine
- cooldown remaining
- reload progress
- aim weight
- recoil accumulator
- trigger state

武器 prefab 自体を「データベース」にしない。

## 5. Hitscan

最初の一丁は hitscan でよい。

flow:

1. input pressed / held
2. fire cadence gate
3. camera center から aim ray
4. spread を適用
5. physics raycast
6. hit surface / damageable を判定
7. damage command
8. impact effect
9. muzzle / sound
10. recoil application

重要なのは、**画面中央から狙う ray と muzzle visual を分ける**こと。

カメラ ray の hit point を求め、その点へ muzzle tracer を飛ばす。近距離壁では muzzle が壁の反対側から出ないよう、muzzle → target の obstruction も必要に応じて確認する。

## 6. Projectile

rocket / grenade / slow plasma 等では projectile prefab を使う。

持たせる値:

- initial velocity
- gravity scale
- lifetime
- collision radius
- direct damage
- splash radius
- splash falloff
- owner / faction

毎弾 Instantiate/Destroy で問題が出る量になったら object pool を導入する。最初から全 gameplay object を pooling framework へ寄せない。

## 7. Viewmodel animation

最低 clip:

- Idle
- Fire
- Reload
- Equip
- Unequip
- Aim transition または runtime pose
- Melee / Bash（必要なら）

### Viewmodel principles

- weapon sway は locomotion animation と別 layer
- fire recoil は短い one-shot + procedural offset
- reload は hand contact が重要なので clip 主体
- ADS は sight alignment が重要なので runtime marker を使う
- left hand は Animation Rigging で `GripLeft` に合わせる

### Additive layer

発砲反動、breathing、sway のような小さな offset は additive layer 候補。

ただし reload 中に additive recoil が破綻するなら layer weight を state に応じて落とす。

## 8. World model animation

最低 clip:

- Idle
- Walk / Run
- Jump / Fall / Land
- Fire
- Reload
- Hit
- Death

一人称 viewmodel の clip と完全一致させる必要はない。同期すべきなのは gameplay event の時間軸。

例:

- magazine detach
- magazine attach
- chamber / bolt action
- actual ammo refill

ammo を「reload clip が終わったから満タン」にするより、明示的な gameplay timing / event state で扱う。

## 9. Weapon sockets

Blender / Unity 共通で marker name を固定する。

推奨:

```text
WeaponRoot
├─ GripRight
├─ GripLeft
├─ Muzzle
├─ Sight
├─ Eject
└─ FxOrigin
```

character side:

```text
RightHand
└─ WeaponSocket
```

武器モデルごとに手側の animation を作り直すのではなく、weapon marker と runtime IK で差分を吸収する。

## 10. Enemy architecture

最初の enemy:

```text
EnemyRoot
├─ NavMeshAgent
├─ EnemyBrain
├─ EnemyCombat
├─ EnemyHealth
├─ HitboxRoot
└─ Model / Animator
```

state:

```text
Idle -> Alert -> Chase -> Attack
                  ^       |
                  |       v
                 Reposition

Any -> Hurt
Any -> Dead
```

NavMeshAgent が damage / animation / health まで知る構造にしない。

## 11. Hitbox / damage

render mesh collider へ直接 damage 判定を依存しない。

Humanoid enemy なら:

- head
- torso
- upper limbs
- lower limbs

程度の primitive hitbox から始める。

`DamageInfo` の候補:

- amount
- source
- instigator
- hit point
- hit normal
- body region
- damage type
- impulse

headshot multiplier 等は target 側 profile が決定する。

## 12. Level metrics

最初の greybox arena では全寸法をメートルで記録する。

チェック:

- doorway で camera が引っかからない
- stair で Step Offset が破綻しない
- sprint 中に corridor が狭すぎない
- jump で意図せず shortcut できない
- enemy NavMeshAgent radius と corridor width が整合する
- engagement distance が weapon range と合う
- cover が eye height / crouch height と合う

美術 model はこれを壊さないように後から当てる。

## 13. VFX

最低限の feedback:

- muzzle flash
- tracer（必要な武器のみ）
- impact spark / dust
- hit marker
- enemy hurt flash / animation
- death effect

「撃った」「当たった」「倒した」の3段階が視覚・音で区別できることが重要。

## 14. Audio

layer を分ける。

### Player-local

- viewmodel mechanics
- reload
- dry fire
- UI

### World-spatial

- muzzle report
- enemy weapon
- impact
- explosion
- footsteps

自分の銃声を local 1本だけにすると空間感が弱くなるため、必要なら近接 mechanical layer と world report layer を分ける。

## 15. Blender -> Unity asset contract

`modeling-playground` 側の人型研究と接続する際は以下を固定する。

### Character

- scale: meter
- consistent rest pose
- bone names
- humanoid avatar mapping policy
- root bone
- hips bone
- twist bone policy
- deform / control bone separation

### Action

- clip name
- loop / one-shot
- in-place / root motion
- frame rate
- expected duration
- contact timing

### Weapon

- grip markers
- muzzle marker
- sight marker
- local forward axis
- scale

control rig の制約自体を Unity へ運ぶのではなく、基本 animation は bake。装備差や aim 等の runtime 補正を Unity Animation Rigging で行う。

## 16. QA gate

### Player

- 30/60/120/240 fps で移動速度が同等
- slope / stair / narrow corridor で stuck しない
- jump apex / landing が安定
- mouse sensitivity が framerate に依存しない
- pause / focus loss 後に cursor lock が復帰

### Weapon

- fire rate が framerate に依存しない
- semi-auto が1入力で複数発しない
- full-auto の cadence が一定
- reload 中の fire / swap policy が明示
- muzzle が壁越しに発砲表示されない
- ADS の sight が画面中心へ収束
- recoil recovery が framerate に依存しない

### Enemy

- NavMesh 外へ spawn しない
- target 喪失時の遷移が定義済み
- dead 後に attack / navigation が止まる
- hitbox が animation から大きく外れない

### Animation

- Idle -> Fire -> Idle が跳ねない
- Move -> Fire の upper-body blend が破綻しない
- Reload -> Swap / Hit 等 interrupt policy がある
- left-hand IK が weapon switch で瞬間移動しない
- viewmodel が near plane / wall に激しく clipping しない

### Asset / license

- source URL が残っている
- license が確認済み
- Asset Store raw package を誤って commit していない
- unused high-resolution texture を build に含めていない

## 17. 最初の vertical slice

完成条件を以下に限定する。

- 1 arena
- 1 player locomotion set
- 1 weapon
- 1 enemy type
- 1 pickup or ammo replenish mechanism
- damage / death / restart
- muzzle / impact / hit / death feedback
- stable mouse look
- stable 60+ fps target environment

この slice が気持ちよくなってから武器・敵・マップ・能力を増やす。
