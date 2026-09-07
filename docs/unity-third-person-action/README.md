# Unity Third-Person Action Study

Status: active study notes
Updated: 2026-09-07
Target: Unity 6.3 LTS / URP / third-person action

`modeling-playground` の人型リグ・アクション研究を、Unity の三人称アクションへ接続するための資料群。

## 結論

新規の三人称アクションでは以下を baseline にする。

1. Unity 6.3 LTS + URP
2. Starter Assets - Character Controllers | URP v2.0 の Third Person Controller を locomotion baseline に利用
3. Input System
4. Cinemachine 3.1 系
5. Animator / Blend Tree / Avatar Mask / Root Motion
6. Animation Rigging 1.4
7. AI Navigation 2.0
8. ProBuilder で combat / traversal graybox

一人称版と最大の違いは、プレイヤー自身の全身が常時見えること。入力レスポンスだけでなく、重心移動、足の接地、旋回、攻撃の溜め・発生・振り抜き・復帰、カメラとの構図がゲームフィールを直接決める。

## 一人称版との設計差

### Camera

一人称:
- camera ≒ player look
- clipping を避けるため viewmodel を分離

三人称:
- camera と character facing を分離
- free orbit / movement-relative / aim / lock-on を切り替える
- wall collision / de-occlusion / shoulder switching が必要
- player と target を同時に画面へ入れる lock-on composition が重要

### Animation

一人称:
- 腕・武器の viewmodel が主役

三人称:
- full-body locomotion と body mechanics が主役
- root motion の採否が gameplay に直結
- melee attack / dodge / finisher は in-place より root motion が有効な場合が多い
- exploration locomotion は code-driven/in-place の方が操作性を出しやすい

このため、最初から `全部root motion` または `全部in-place` に固定せず、action category ごとに明示する。

## 推奨 root motion policy

### In-place / code-driven

- idle
- walk / jog / sprint
- camera-relative free movement
- air control
- simple strafe

理由: 入力に対する速度・方向変更を gameplay code が支配しやすい。

### Root-motion candidate

- dodge / roll
- committed melee attack
- lunge
- finisher
- vault / mantle
- contextual traversal

理由: 足運びと移動距離を animation と一致させやすい。

ただし collision / target distance / cancel rule を animation 任せにしない。

## Camera modes

最低でも以下を分離する。

- FreeExplore
- Aim
- LockOn
- Cinematic / Finisher

`CharacterFacing` は camera mode ごとに変える。

FreeExplore:
- movement direction を向く

Aim:
- camera forward を基準に上半身を向ける

LockOn:
- target direction を基準に strafe locomotion

## Combat model

三人称近接アクションでは、Animator state だけを combat state の authority にしない。

Gameplay 側に以下を持つ。

- attack id
- startup
- active window
- recovery
- movement policy
- turn policy
- cancel windows
- stamina / resource cost
- hitbox definition
- hit reaction

Animator は presentation を担当し、gameplay timeline と同期する。

## Lock-on

最低構成:

1. target candidate search
2. camera-space score
3. line-of-sight
4. distance limit
5. current target stickiness
6. target switch input
7. lock loss policy

lock-on 中は player/target の両方を frame に収め、敵が真後ろへ回った時のcamera flipを抑える。

## Assets

ローカルに以下を追加している。

- `third_party/unity-third-person/kenney-protagonists/`
  - CC0
  - humanoid FBX + idle/run/jump FBX + skins
  - Unity Humanoid import / retarget smoke test用
- `third_party/unity-third-person/kenney-mini-arena/`
  - CC0
  - arena / stairs / walls / sword / spear / soldier FBX
  - melee combat graybox用
- `third_party/unity-third-person/kenney-rpg-audio/`
  - CC0
  - footsteps / draw weapon / cloth / doors 等

さらに外部候補として、KayKit Character Animations と Quaternius Universal Animation Library を優先する。どちらも CC0 で、combat / dodge / 8-direction locomotion / root motion の検証に向く。

## Documents

- [resources.md](resources.md) — Unity公式・外部リソース
- [playbook.md](playbook.md) — camera / movement / combat / animation / lock-on / QA
- [prototype-plan.md](prototype-plan.md) — vertical slice実装順
- [assets.md](assets.md) — 同梱アセットとライセンス

一人称側の共通資料は `../unity-first-person-action/`、人型asset authoringは `../humanoid-rigging/` を参照する。