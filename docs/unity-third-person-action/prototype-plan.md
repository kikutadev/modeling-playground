# Third-Person Action Vertical Slice Plan

Updated: 2026-09-07

目的は、三人称で重要な「移動・カメラ・全身animation・近接combat」が同時に気持ちよく成立するかを早期に検証すること。

## Phase 0 — Baseline

- Unity 6.3 LTS / URP
- Starter Assets Third Person Controller
- Input System
- Cinemachine 3
- Animation Rigging
- AI Navigation
- ProBuilder

Starter Assets sceneは比較用に残し、独自sceneで改造する。

## Phase 1 — Free locomotion

実装:
- walk/jog/sprint
- camera-relative movement
- jump/fall/land
- character turn
- camera orbit/collision

まずKenney protagonistまたはStarter Assets characterで検証する。

Exit:
- 30/60/120fpsで速度差がない
- camera方向急変時のcharacter turnが自然
- stair/slopeでcameraと足元が破綻しない

## Phase 2 — Lock-on

実装:
- candidate search
- lock/unlock
- left/right target switch
- strafe locomotion
- player/target camera framing

Exit:
- 3体の敵の間で意図したtargetへ切替可能
- targetが横切ってもcameraが不快にflipしない
- wall遮蔽の短時間で即解除しない

## Phase 3 — One melee attack

実装:
- Light1
- startup / active / recovery
- swept weapon hitbox
- hit reaction
- hit stop
- camera impulse
- impact SFX/VFX

最初はcomboを作らない。

Exit:
- 剣の見た目の軌跡とhit範囲が一致
- 高fps/低fpsでhit抜けしない
- 敵1体へ1 swingで意図した回数だけhit

## Phase 4 — Dodge

root-motion版とkinematic版を両方比較する。

実装:
- directional roll/dash
- i-frame
- stamina optional
- collision
- lock-on facing policy

Exit:
- input directionが予測可能
- wallで突き抜けない
- animationとinvulnerabilityが大きくずれない

## Phase 5 — Combo

Light1 -> Light2 -> Light3 を作る。

実装:
- input buffer
- queue window
- combo branch
- recovery/cancel

Exit:
- 連打でも入力抜けしない
- button mashだけでanimationが不自然に短縮されない
- 各hitのanticipation/action/recoveryが読める

## Phase 6 — Enemy duel

AI Navigationを使い1対1を成立させる。

Enemy:
- approach
- strafe
- telegraph
- attack
- recover
- hit/stagger
- death

Exit:
- playerが敵の予兆を読んで回避可能
- cameraとenemy spacingが安定
- attack中にNavMeshAgentがanimationを引きずらない

## Phase 7 — Small arena

Kenney Mini ArenaまたはProBuilderで、段差・壁・階段を含む小arenaを作る。

検証:
- camera collision
- lock-on occlusion
- stair combat
- edge/corner interaction
- dodge spacing

## Phase 8 — Traversal extension

ゲーム目標がWebシューター系ならここで追加する。

- grapple pull
- swing
- wall run
- air attack
- aerial target lock

地上combat/controllerを壊さないよう、movement stateを分離して追加する。

## Exit criteria

1. free locomotionが自然。
2. lock-on cameraで1対1を追える。
3. attackの距離・animation・hitboxが一致する。
4. dodgeが操作とanimationの両方で予測可能。
5. 3-hit comboが滑らかにつながる。
6. enemy telegraphを見て回避・反撃できる。
7. 狭いarenaでもcameraがゲームを邪魔しない。

この7条件を満たす前に大量の武器、skill tree、複雑なcombo tree、完成artへ広げない。