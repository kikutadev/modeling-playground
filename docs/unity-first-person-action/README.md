# Unity First-Person Action Study

Status: active study notes  
Updated: 2026-09-07  
Target: Unity 6.3 LTS / URP / desktop first-person action

`modeling-playground` で制作している人型モデル、リグ、武器、アニメーションを Unity の一人称アクションへ接続するための資料群。

今回のゲーム目標は、通常のFPSよりも**移動そのものの比重が高い一人称アクション**を想定する。

- WASD / mouse look
- jump / air control
- sprint / dash
- grapple / web pull / swing
- building interior traversal
- ranged attack
- airborne enemies
- first-person weapon / arm animation
- hit reaction / camera impulse

## 推奨スタック

新規のシングルプレイヤー一人称アクションでは、まず以下を基準にする。

1. **Unity 6.3 LTS + URP**
2. **Starter Assets - Character Controllers | URP v2.0** を地上移動のbaselineとして利用
3. **Input System** で入力をAction化
4. **Cinemachine 3** はcamera impulse / shake / scripted camera用途に利用
5. **Animation Rigging** で一人称腕、武器保持、aim補正、IKを実装
6. **ProBuilder** でビル内部を含むgrayboxを高速に作る
7. **AI Navigation** は地上敵に利用し、飛行敵は3D steeringを別実装
8. 一人称 viewmodel と world model を分離する
9. Blender側のcontrol rigはUnityへ直接持ち込まず、基本Actionをbakeし、runtime補正だけUnity側で行う

Entities向けCharacter Controllerは、単体の一人称プレイヤーを作る初期段階では採用しない。DOTS / Entitiesをゲーム全体で採用する理由が生じた段階で再評価する。

## Starter Assetsの位置づけ

Starter Assetsは「完成した高速アクションコントローラ」ではなく、入力・カメラ・CharacterControllerのreference implementationとして扱う。

特に grapple / web swing を追加する場合、通常移動の `CharacterController.Move` と物理的な牽引・振り子運動を一つのUpdateへ継ぎ足すと、速度保存・衝突・着地判定・camera responseが崩れやすい。

Player Movementは少なくとも次のstateへ分離する。

- Grounded
- Airborne
- GrapplePull
- Swing
- Dash
- Knockback

各stateが最終的なvelocityを決め、衝突解決層へ渡す構造にする。

## CharacterController と Rigidbody

### CharacterControllerを使う部分

- 通常歩行
- 階段
- slope
- predictableなjump / air control
- プレイヤー操作に対する即応性

### Rigidbodyを検討する部分

- 完全な振り子物理を要求するweb swing実験
- projectile
- ragdoll
- knockback対象
- physics prop

Web swingは `SpringJoint` 固定で始めず、kinematicなrope constraint / acceleration modelとRigidbody実験を比較する。

## Grapple / Web Swing の最低構成

### Anchor acquisition

`Physics.Raycast` または SphereCast で、有効なsurface layerのanchorを取得する。

### Pull

anchor方向の加速度と、現在速度を壊しすぎない接線方向速度を分ける。

### Swing

rope lengthをconstraintとして扱い、anchor方向への過剰なradial velocityを除去しつつ、接線方向速度を保存する。

ゲームとして気持ちよくする場合、厳密な物理再現より以下を優先する。

- 入力方向へのair steering
- minimum swing speed
- apex付近の失速補助
- release時のvelocity preservation
- camera FOV / roll / impulse

web lineの描画はLine Renderer等のpresentationとsimulationを分離する。

## First-person viewmodel

world modelとviewmodelを分離する。

**World model**

- 他者・shadow・hitbox向け
- locomotion / jump / hit / deathを優先

**Viewmodel**

- 一人称カメラ専用
- clipping回避と画面上の見栄えを優先
- sway / recoil / ADS / reloadを独立制御

武器Prefabは以下のmarkerを持つ。

```text
WeaponRoot
├─ GripRight
├─ GripLeft
├─ Muzzle
├─ Sight
├─ Eject
└─ FxOrigin
```

base animationの上へAnimation Riggingで手・武器の最終poseを補正する。

## Level graybox

ビル内部・吹き抜け・屋上・窓・梁など、移動ルートがゲーム性そのものになるため、完成アートを置く前にProBuilderでgrayboxする。

検証すべき寸法:

- door width / height
- corridor width
- floor-to-floor height
- grapple anchor spacing
- jumpable gap
- swing clearance
- enemy engagement distance

grayboxが成立した後、`third_party/unity-fps/kenney-factory-kit/` のFactory Kitをvisual replacementとして使う。

## Enemy

### Ground enemy

AI Navigationをbaselineにする。

### Air enemy

NavMeshへ無理に載せず、別の3D steering controllerにする。

最低限:

- target position prediction
- preferred distance
- obstacle avoidance ray / sphere cast
- acceleration / max speed
- attack telegraph
- recovery window

## Documents

- [resources.md](resources.md) — Unity公式・学習用・外部リファレンス
- [assets.md](assets.md) — ローカルに入れたアセット、ライセンス、用途
- [playbook.md](playbook.md) — runtime責務、viewmodel、武器、敵、animation、QA
- [prototype-plan.md](prototype-plan.md) — 最初のvertical sliceの実装順

## Local assets

`third_party/unity-fps/` に再配布可能なCC0素材を整理している。

- `kenney-blaster-kit/` — FBX武器・アタッチメント・ターゲット
- `kenney-factory-kit/` — FBX工場/倉庫/キャットウォーク/ドア/床/設備
- `kenney-crosshair-pack/` — 64×64 light crosshair 200点 + tilesheet
- `kenney-impact-sounds/` — 足音・金属・木・ガラス等のimpact/foley
- `kenney-sci-fi-sounds/` — laser / thruster / engine / force field / explosion
- `kenney-fps-assets/` — Kenney Starter Kit FPS由来の小規模なGLB/OGG/PNG素材

詳細は [assets.md](assets.md) と `third_party/unity-fps/README.md` を参照。

## ライセンス方針

Unity公式Starter AssetsはAsset StoreのEULA対象なので、このリポジトリへ再配布しない。Unity Editor側から取得する。

リポジトリへvendorする外部素材は、原則としてCC0または明確に再配布可能なライセンスに限定し、source URL / version / archive hash / retained subsetをmanifestへ残す。