# First-Person Action Vertical Slice Plan

Updated: 2026-09-07

目的は「FPSの機能数を増やす」ことではなく、高速な一人称移動と空中戦が成立するかを最短で検証すること。

## Phase 0 — Unity baseline

- Unity 6.3 LTS
- URP project
- Starter Assets - Character Controllers | URP v2.0
- Input System
- Cinemachine 3
- Animation Rigging
- ProBuilder

この段階ではStarter AssetsのPlaygroundを改造しすぎない。baseline sceneを残し、独自sceneで比較可能にする。

## Phase 1 — Ground locomotion

実装:

- look
- walk
- sprint
- jump
- air control
- grounded detection
- slope / stair

QA:

- 30 / 60 / 120 fpsで体感が大きく変わらない
- wallへ斜め入力しても引っかからない
- stairでcameraが過剰に上下しない
- jump apexと着地が明確

## Phase 2 — Grapple pull

最初からswingを作らず、anchorへ引かれる単純なgrappleを先に作る。

実装:

- grapple surface layer
- camera-center raycast
- anchor marker
- pull acceleration
- cancel / release
- cooldown
- line renderer

QA:

- ceiling / wall / floorへの誤anchorを制御できる
- cornerで速度が爆発しない
- release時に不自然に停止しない

## Phase 3 — Swing

実装:

- rope length
- radial velocity correction
- tangential velocity preservation
- player steering
- minimum / maximum speed
- release boost tuning
- camera FOV response

ここではSpringJointを唯一の正解にしない。CharacterController系のkinematic modelとRigidbody experimentを比較する。

QA:

- 低速からspeedを作れる
- apexで操作不能にならない
- release方向を予測できる
- building cornerでropeが破綻しない
- camera motion sicknessを抑えられる

## Phase 4 — Combat dummy

Kenney Blaster KitのFBXを仮武器として使用。

実装:

- hitscan fire
- crosshair
- recoil
- hit marker
- target HP
- destroy / fragment presentation

ここではreloadやinventoryをまだ作らない。

QA:

- 高速移動中でも照準の責任範囲が理解できる
- recoilがcamera controlを壊さない
- hit feedbackが移動中でも読める

## Phase 5 — First-person arms / viewmodel

既存の `docs/humanoid-rigging/` と接続する。

実装:

- viewmodel専用camera/layer
- weapon socket
- arm rig
- Two Bone IK
- aim pose
- fire recoil animation
- grapple hand pose

Animation clipとprocedural IKの責務を分ける。

## Phase 6 — Air enemy

最初のenemyは地上NavMesh enemyではなく、ゲームのコア検証になる空中敵を優先する。

状態:

- approach
- orbit / strafe
- telegraph
- attack
- evade
- recover

movement:

- acceleration-based 3D steering
- preferred range
- obstacle probe
- vertical offset

QA:

- playerが移動しても追従がワープに見えない
- 高速移動中に敵を見失いすぎない
- attack予兆がcamera外からでも理不尽にならない

## Phase 7 — Building interior graybox

ProBuilderで以下だけを作る。

- lobby / atrium
- stairwell
- 2–3 floor vertical void
- corridor
- windows / open wall
- rooftop exit

検証:

- grapple anchor密度
- swing clearance
- indoor camera speed
- line-of-sight
- enemy size / distance
- combat readability

## Exit criteria

vertical sliceは以下が同時に成立したら次へ進む。

1. 地上移動からgrappleへ違和感なく移行できる。
2. swing releaseで狙った方向へ飛べる。
3. 空中移動しながら敵を追跡し射撃できる。
4. ビル内部でもcameraと速度が破綻しない。
5. 武器／腕が壁へ大きくclipしてゲーム感を損なわない。
6. 1つの小さなarenaを繰り返し遊んでmovement自体が面白い。

この条件を満たす前に、skill tree、loot、複数武器、複雑なenemy roster、完成アートへ広げない。
