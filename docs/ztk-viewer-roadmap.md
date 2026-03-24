# ZTK Viewer / Editor Roadmap

## 1. 目標の整理

このプロジェクトは、最終的には viewer / editor / builder まで育てるが、直近の主目標はもっと限定する。

最初に仕上げたいのは、次の確認ができるアプリケーションである。

- `ztk` ファイルを読み込める
- `ztk` テキストを貼り付けて適用できる
- shape の配置が意図どおりか確認できる
- link の親子関係が意図どおりか確認できる
- joint 接続が意図どおりか確認できる
- unsupported / unresolved / invalid な箇所がどこか把握できる

つまり最初の製品定義は「ZTK 構造確認アプリ」であり、汎用 editor ではない。

その上で段階的に次へ進む。

1. viewer: ZTK の構造確認と解釈確認
2. text-centered editor: テキスト編集に対する即時フィードバック
3. structure editor: inspector / gizmo / UI からの意味的編集
4. builder: viewer 上で shape や joint 構造を新規作成

## 2. 前提と責務分離

責務は次のように固定する。

- `submodules/ztk-ts`
  - parser / AST / semantic / validation / serializer の正本
- `submodules/roki-three`
  - runtime / FK / 描画
- viewer app
  - load, selection, inspection, diagnostics, editing UX

重要なのは、`three.js` 側の runtime object を正本にしないことである。
正本は常に `ztk-ts` の semantic model に置く。

補足:

- viewer 側だけで `roki-three` 未対応 joint / shape を無理に吸収しない
- geometry / FK parity はまず `roki-three` 直読比較で確認する
- C `roki` / `zeo` との厳密比較は coverage の節目で行う

## 3. 現在地

現状は次の状態まで来ている。

- `ztk-ts`
  - parser / AST / semantic resolver / semanticToAst / serializer layering がある
  - `preserve-source` / `normalize-semantic` / `materialize-runtime` がある
  - validation diagnostics と serialization diagnostics は分離済み
  - `.ztk` / `.obj` / `.stl` / `.ply` の built-in import materialization がある
  - `.dae` は semantic 上は upstream-known format として扱い、runtime では未対応
- viewer app
  - semantic -> `roki-three` adapter がある
  - React ベースの固定 layout がある
  - hierarchy / viewport click / inspector / joint input がある
  - link 中心 hierarchy と `Issues` 一覧がある
  - source highlight / source jump がある
  - shell state に serializer preview を持たせている
  - `preserve-source` / `normalize-semantic` / `materialize-runtime` の preview が見える

したがって、次の優先対象は viewer の使い勝手である。

## 4. 開発段階

## Phase 1. 構造確認 viewer を仕上げる

目的:
ZTK の shape 配置、link 構造、joint 接続、解釈結果を確認できるアプリにする

この phase で重要なのは「編集機能」より「確認能力」である。

実装済み:

- 固定 layout の React 化
- `Viewport` 主役の 1 画面構成
- `Load Sample` / `Open File` / `Apply Source`
- hierarchy と viewport の selection 同期
- link 中心 hierarchy
- shape 所属の展開表示
- `Issues` による問題一覧
- `Save / Export Preview` の折りたたみ表示
- source section highlight
- hierarchy / viewport からの source jump
- inspector による link / shape 情報表示
- revolute joint の degree 表示 / 入力
- joint `min` / `max` clip
- hierarchy の accordion + lock UX

次に詰める項目:

- load 導線の整理
  - reload
- selection 導線の強化
  - link / shape の stable ID 表示
  - 選択対象の参照元 semantic 情報表示
- inspection の強化
  - shape source の種類
    - concrete
    - mirror
    - import
- diagnostics 表示の整理
  - どの層の問題か UI で見分けやすくする
- 解釈確認の補助表示
  - link frame
  - joint axis
  - shape frame
  - unsupported node の可視化
- import / mirror / transform の確認補助
  - normalize と materialize の差が見えること
  - runtime unresolved の理由が分かること

この段階での完成像:

- 左上: `ZTK Source`
- 左下: `Save / Export Preview`
- 中央: `Viewport`
- 右上: `Hierarchy`
- 右下: `Inspector`

補足:

- `Save / Export Preview` は常時主役ではないので、基本は閉じた状態でよい
- serializer diagnostics を見たいときだけ開く補助 panel として扱う
- 問題の把握用には別に `Issues` 的な一覧を持つ
- `Viewport` は最も広い面積を確保する
- UI はすでに React 化済み
- ただし `viewer shell` / adapter / presenter の責務は維持する
- いきなり IDE 風 dock layout までやらず、固定 layout を基準に詰める

Hierarchy の表示方針:

- 主構造は link 中心にする
- shape は link に属する情報として見せる
- link と shape を常時同列に並べる構造表示は避ける
- shape は配下表示、折りたたみ表示、または補助ビューで扱う

補助ビューの方針:

- `Hierarchy` とは別に `Shapes` 一覧や `Optics` 一覧を持つ余地を残す
- shape / optic は複数 link から参照されうるため、参照一覧ビューとしての価値がある
- ただし通常は閉じた view または tab にして、主導線は link hierarchy に置く

React 化の現状:

- `main.tsx` の React UI 化は完了
- shell / adapter / presenter / test は維持したまま UI 層を差し替えている
- panel 開閉、tab、selection 同期、help modal は React 側で扱っている
- 将来の resize / dock は後段

完了条件:

- `ztk` の load と paste が安定して行える
- 形状配置、親子構造、joint 接続を目視確認できる
- unsupported / unresolved / invalid を見つけやすい
- 「この ZTK は意図どおり解釈されているか」を答えられる

## Phase 2. テキスト中心 editor

目的:
テキスト編集に対して、semantic / runtime のフィードバックを即時に返す

この phase では authoring の主役はまだテキストである。
viewer は編集支援と検証の装置として機能する。

優先項目:

- 入力ソースの再 parse / re-resolve を安定化
- parse error と validation error を分離表示
- semantic diagnostics と runtime diagnostics の分離表示
- 該当 tag / key / source position への対応付け
- preserve / normalize / materialize の出力差分確認
- save 方針の整理
  - preserve-source
  - normalize-semantic
  - materialize-runtime

重要:

- 編集中の不完全な document でも、可能な範囲で部分情報を表示する
- 「壊れたこと」だけでなく「どこが壊れたか」を返す

完了条件:

- テキストを書き換えると解釈結果が即時更新される
- 構造の不正や未解釈箇所が見つけやすい
- save/export の意味の違いを user が理解できる

## Phase 3. 構造編集 UI

目的:
semantic model を UI から直接編集できるようにする

ここで初めて inspector や gizmo が編集主体になる。

候補:

- inspector から link / shape の値を編集
- transform の数値編集
- joint parameter の意味的編集
- shape の mirror / import / concrete source 切り替え
- link の parent 接続変更
- shape の所属 link 変更

この phase で必要な前提:

- semantic model への安全な mutation API
- 編集結果を text へ戻す serializer policy の固定
- invalid state を UI 上でどう扱うかの方針

完了条件:

- UI 操作で semantic model を編集できる
- 編集結果が ZTK として安定出力できる
- invalid / unsupported 状態を UI 上で説明できる

## Phase 4. Builder

目的:
viewer 上で shape や joint 構造を新規作成できるようにする

候補:

- primitive shape の追加
- link の追加
- joint の追加
- parent-child 接続の新規作成
- optic / motor / mass property の追加
- viewer 上での簡易配置操作

この phase は最後でよい。
ここに入る前に、viewer と text-centered editor が十分使える必要がある。

完了条件:

- GUI だけで最小の chain / shape 構造を組める
- semantic model と ZTK 出力が破綻しない

## 5. 直近の優先順位

当面は次の順で進める。

1. `ztk-ts` の validation / diagnostics / serializer policy を固定する
2. viewer を「構造確認アプリ」として使える水準まで上げる
3. viewport overlay や inspection を強化して確認能力を上げる
4. text-centered editor としての即時フィードバックを入れる
5. その後に構造編集 UI を検討する

今は 2 が主戦場であり、React 化はすでにその基盤整備として完了している。
構造編集 UI を先走って増やさない。

## 6. viewer で次に詰める観点

viewer 側で今後具体化すべき観点は次のとおり。

- 何をもって「shape 配置が正しい」と判断しやすいか
- 何をもって「joint 接続が正しい」と判断しやすいか
- hierarchy / inspector / viewport / issues のどこに何を出すと確認しやすいか
- diagnostics をどこまで常時表示し、どこから drill-down にするか
- save/export preview を常時見せずにどうアクセスしやすくするか
- link hierarchy と shape / optic 一覧をどう切り分けるか
- 1 画面で使える layout をどこまで固定し、どこから可変にするか
- unsupported な要素を「見えないまま」にせずどう見せるか
- text editing を始めたとき、どの単位でフィードバックを返すか
- source highlight / source jump の次に、source position feedback をどこまで細かく返すか
- viewport 上で link frame / joint axis / unsupported をどう見せるか

次の議論は、この viewer 体験の具体化を中心に進める。
