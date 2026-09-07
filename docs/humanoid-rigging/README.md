# Humanoid Rigging & Action Study

Status: active study notes  
Updated: 2026-09-07  
Target: Blender 5.x / Blender Python / glTF 2.0 / Three.js

人型キャラクターを「見た目だけのモデル」から、ゲーム内で自然に動く再利用可能なアセットへ引き上げるための資料群。

このリポジトリではすでに以下の実験がある。

- `scripts/rig_character.py` — Milo の18ボーン・スキニング・歩行Action生成
- `scripts/build_ik.py` — Milo のIK編集版
- `models/raven-*` — RAVEN の人型ロボット用骨格・アクション
- `runtime/` / `viewer/` — GLB再生、IK、AnimationMixer相当のruntime

今後は、これらを単発のモデル別実装から、人型全般へ再利用できる設計へ寄せる。

## Documents

- [resources.md](resources.md) — 公式ドキュメント・Blender Studio・glTF・Three.jsの厳選リソース集
- [playbook.md](playbook.md) — modeling-playgroundへ適用するための具体的な人型リグ／アクション設計指針
- [web-shooter-action-target.md](web-shooter-action-target.md) — Webスイング・壁移動・空中戦を成立させるためのゲーム固有要件

## Recommended learning order

1. **人型モデルの変形を前提にしたトポロジ**
   - 肩、股関節、肘、膝、手首、足首に十分なループを置く。
   - 「静止画で綺麗」より「曲げた時に体積を保てる」ことを優先する。
2. **Armature / Skinning / Weight Paint**
   - deform bone と control bone を分けて考える。
   - Automatic Weightsは開始点であり完成ではない。
3. **IK / FK / Constraints / Drivers**
   - 足を固定する移動、手を目標へ置く攻撃、視線・武器追従を作る。
4. **Action / Graph Editor / NLA**
   - Idle / Walk / Run / Jump / Attack 等を独立したActionとして管理する。
5. **Animation fundamentals**
   - timing、spacing、weight shift、anticipation、follow-throughを動作へ反映する。
6. **glTF / Three.js runtime**
   - Blender固有ConstraintはGLBへ直接保存されない前提で、必要な結果はbone transformへbakeする。
   - runtime IKが必要なものだけ独自contractとして保持する。
7. **自動検証**
   - 接地、ループ継ぎ目、ボーン階層、weight正規化、GLB再読込後の変形をテストする。

## Project goal

ゲーム上の目標は、**Webシューターでビル内外を高速移動しながら空中の敵と戦える人型**を成立させること。

そのための当面の完成形は、以下を満たす共通の **Humanoid Rig Contract** を作ること。

- 同じ骨名・階層をMilo、RAVEN、今後の人型モデルで共有できる。
- organic character と rigid robot の両方を扱える。
- IK/FK付き編集用 `.blend` と、baked animationを持つゲーム用 `.glb` を分離できる。
- 通常移動に加え、`SwingReach`, `SwingTuck`, `WallRun`, `AerialAim`, `AirKick`, `Landing` 等を個別Actionとして交換・再利用できる。
- in-place と root-motion の両方を明示的に扱える。
- Three.js側でclip cross-fade、one-shot、loop、root motionの扱いを統一できる。
- Blender Pythonで再生成可能で、生成後のGLBを自動QAできる。

ゲーム固有の優先順位は [web-shooter-action-target.md](web-shooter-action-target.md)、共通rig設計は [playbook.md](playbook.md) を参照。