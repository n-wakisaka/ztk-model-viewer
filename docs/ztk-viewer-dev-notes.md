# ZTK Viewer Development Notes

## 1. 何を作っているか

この repo が直近で作ろうとしているのは、汎用 editor ではなく `ZTK 構造確認アプリ` です。

最初に答えたい問いは次です。

- この ZTK は読めるか
- shape 配置は意図どおりか
- link の親子関係は意図どおりか
- joint 接続は意図どおりか
- unsupported / unresolved / invalid はどこか

そのため、現段階では編集機能を広げるより、確認能力と解釈の可視化を優先します。

## 2. 責務分離

責務は次のように固定します。

- `submodules/ztk-ts`
  - parser / AST / semantic / validation / serializer の正本
- `submodules/roki-three`
  - runtime / FK / 描画
- viewer app
  - load / selection / inspection / diagnostics / editing UX

重要なのは、viewer 側の runtime object を正本にしないことです。正本は常に `ztk-ts` の semantic model に置きます。

補足:

- viewer 側だけで `roki-three` 未対応 joint / shape を吸収しない
- geometry / FK parity はまず `roki-three` 直読比較を優先する
- C `roki` / `zeo` との厳密比較は coverage の節目で行う

## 3. 現在の viewer の位置づけ

現在の viewer は次を確認するためのアプリです。

- source
- hierarchy
- viewport
- inspector
- issues
- serializer preview

つまり、`source を読み、semantic に解釈し、runtime で見える形にして、その結果を相互に追えること` が今の中心です。

## 4. UI の現状構成

現状の固定 layout は次です。

- 左上: `ZTK Source`
- 左下: `Save / Export Preview`
- 中央: `Viewport`
- 右上: `Hierarchy` / `Issues`
- 右下: `Inspector`

意図は次のとおりです。

- `Viewport` を主役にする
- `Source` と `Hierarchy` と `Inspector` で解釈結果を追えるようにする
- `Issues` は preview を開かなくても問題把握できるようにする
- `Save / Export Preview` は補助パネルとして扱う

## 5. 実装構造

viewer の実装は大きく 4 層です。

### adapter

- `src/adapter/semantic-to-roki-three.ts`

`ztk-ts` の semantic document を `roki-three` runtime へ橋渡しします。

### view-model

- `src/view-model/semantic-viewer-shell.ts`
- `src/view-model/semantic-view-model.ts`
- `src/view-model/semantic-view-selection.ts`

ここで shell state、selection、hierarchy、joint control などを組みます。

`semantic-viewer-shell.ts` は viewer 全体の状態をまとめる入口で、

- parse / resolve
- serializer preview
- adapter 実行
- diagnostics 集約
- selection 更新
- joint 更新

を扱います。

### presenter

- `src/app/semantic-viewer-presenter.ts`

shell state を UI 表示向けの model に整形します。

ここでは主に次を作ります。

- inspector model
- issues model
- serialization preview model
- source highlight model

### React UI

- `src/app/main.tsx`
- `src/app/viewer.css`

React UI は固定 layout、panel state、viewport interaction、source jump などを受け持ちます。

## 6. 現在の主な機能

今の viewer には次があります。

- `.ztk` file open
- sample load
- source edit + apply
- viewport selection
- hierarchy selection
- inspector 表示
- link 中心 hierarchy
- shape 所属表示
- issues 集約表示
- serializer preview
- source section highlight
- source jump
- revolute joint の degree 表示 / 入力
- joint min / max clip

## 7. hierarchy の現在方針

hierarchy は link 中心です。

- 主構造は link tree
- shape は link に属するものとして表示
- shape を常時 link と同列に並べない

また、今は次の UX を持っています。

- 基本は accordion
- lock icon を押した link は開きっぱなし
- viewport で shape を選ぶと、その shape を持つ link を開く
- hierarchy / viewport の double click で source に飛ぶ

## 8. source との対応付け

viewer の重要な価値の一つは、source と表示結果が対応していることです。

今は次のようにしています。

- 選択中の semantic node に対応する source section を薄くハイライト
- hierarchy / viewport の double click で source 位置へジャンプ
- source 自体は自動で大きく動かしすぎず、必要時だけ jump させる

source highlight は、重ね文字ではなく行背景だけを薄く塗る方式にしています。これは文字の滲みや scroll ずれを避けるためです。

## 9. diagnostics の現在方針

問題表示は `Issues` と `Save / Export Preview` に分けています。

- `Issues`
  - semantic
  - runtime / adapter
  - serializer
  - unknown key / unknown section
- `Save / Export Preview`
  - preserve / normalize / materialize の出力
  - layer ごとの diagnostics

この分離により、まず問題の有無を `Issues` で見て、必要なら serializer preview を開く流れにしています。

## 10. joint control の現在方針

revolute joint は viewer 上では degree 表示にしています。

- 表示は degree
- input も degree
- runtime 適用時だけ radian に変換
- semantic に `min` / `max` があれば clip

viewer 上の扱いを人間向けに寄せつつ、runtime object 側の表現は変えない方針です。

## 11. React 化の考え方

React 化は UI 層だけに留めています。

- shell / adapter / presenter は維持
- `main.tsx` で panel state と interaction を扱う
- fixed layout から始める

panel の開閉、tab、selection 同期、help modal、source jump などが増えたので、この段階での React 化は妥当と考えています。

## 12. 今の制約

今は次をまだやっていません。

- IDE 風の dock / resize / panel rearrangement
- 本格的な text-centered incremental editing
- semantic model への GUI mutation
- shape / joint の新規作成 UI
- `.dae` の runtime materialization

このあたりは roadmap 上の後段です。

## 13. 次に見るべきファイル

新しく viewer を触るときは、まず次を見ると入りやすいです。

- [main.tsx](../src/app/main.tsx)
- [semantic-viewer-presenter.ts](../src/app/semantic-viewer-presenter.ts)
- [semantic-viewer-shell.ts](../src/view-model/semantic-viewer-shell.ts)
- [semantic-view-model.ts](../src/view-model/semantic-view-model.ts)
- [ztk-viewer-roadmap.md](./ztk-viewer-roadmap.md)
