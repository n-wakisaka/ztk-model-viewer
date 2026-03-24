# ZTK Structure Viewer

`ztk-model-viewer` は、ZTK を読み込んで shape 配置、link 構造、joint 接続、問題箇所を確認するための viewer です。

今の主用途は編集よりも確認です。`この ZTK が意図どおり解釈されているか` を見ることに向いています。

## 起動

submodule を含めて clone したあと、次を実行します。

```bash
pnpm install
pnpm dev
```

submodule をまだ取っていない場合は先に次を実行してください。

```bash
git submodule update --init --recursive
```

## 最初の使い方

1. `Load Sample` で sample を開くか、`Open File` で `.ztk` を読み込みます。
2. 中央の `Viewport` で shape の配置を確認します。
3. 右上の `Hierarchy` で link 構造を確認します。
4. 右下の `Inspector` で選択中の link / shape の情報を確認します。
5. 問題がある場合は `Issues` を見ます。
6. source を直接編集したい場合は `ZTK Source` を書き換えて `Apply Source` を押します。

## 画面構成

- 左上: `ZTK Source`
- 左下: `Save / Export Preview`
- 中央: `Viewport`
- 右上: `Hierarchy` / `Issues`
- 右下: `Inspector`

通常は `Viewport`、`Hierarchy`、`Inspector`、`Issues` を主に使います。`Save / Export Preview` は必要なときだけ開く想定です。

## 各パネルの見方

### ZTK Source

- 読み込んだ ZTK テキストを表示します
- 直接編集して `Apply Source` で再解釈できます
- 選択中の link / shape に対応する section を薄くハイライトします
- hierarchy や viewport から source の対応位置へジャンプできます

### Viewport

- shape 配置を確認します
- click で link / shape を選択します
- double click で対応する source section へジャンプします
- 何もないところをドラッグしても selection は外れません

### Hierarchy

- link 中心の構造を表示します
- link を click すると、その link に属する shape を展開します
- link / shape を double click すると対応する source section へジャンプします
- lock icon で特定の link を開いたままにできます

### Issues

- semantic
- runtime / adapter
- serializer
- unknown key / unknown section

をまとめて一覧します。

まず問題有無を把握したいときは `Save / Export Preview` より先に `Issues` を見るのが使いやすいです。

### Inspector

- 選択中の link / shape の詳細を表示します
- link の場合は joint 情報、親子関係、shape 一覧も表示します
- revolute joint は degree で表示・入力します
- semantic に `min` / `max` がある場合は joint 入力を clip します

### Save / Export Preview

必要なら開いて次を確認できます。

- `Preserve Source`
- `Normalize Semantic`
- `Materialize Runtime`

serializer diagnostics もここで確認できます。

## よく使う操作

- `Load Sample`
  - sample として `submodules/ztk-ts/test/fixtures/arm_2dof.ztk` を読み込みます
- `Open File`
  - 任意の `.ztk` を開きます
- `Apply Source`
  - `ZTK Source` の内容を parse / resolve し直します
- hierarchy / viewport の single click
  - 選択
- hierarchy / viewport の double click
  - source ジャンプ

## 確認しやすいポイント

- viewport で見た shape と source の section を対応付けたい
  - shape を click して inspector を見て、必要なら double click で source に飛びます
- link 構造と shape 所属を見たい
  - hierarchy で link を開きます
- 解釈できていない箇所を知りたい
  - `Issues` を見ます
- normalize 後や runtime materialize 後の出力を見たい
  - `Save / Export Preview` を開きます

## 現状の注意点

- 今の viewer は汎用 editor ではありません
- 主目的は構造確認と解釈確認です
- import / serializer の詳細方針は `ztk-ts` 側に依存します
- `.dae` は semantic 上は認識されますが、runtime materialization は未対応です

## 関連資料

- [docs/ztk-viewer-roadmap.md](docs/ztk-viewer-roadmap.md)
- [submodules/ztk-ts/docs/ztk-import-policy.md](submodules/ztk-ts/docs/ztk-import-policy.md)
- [submodules/ztk-ts/docs/ztk-serializer-policy.md](submodules/ztk-ts/docs/ztk-serializer-policy.md)
