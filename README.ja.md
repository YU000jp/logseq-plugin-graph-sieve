# Logseq Graph Sieve プラグイン
<div align="center">

ファイルベースグラフの `pages` および `journals` フォルダから、プレーンテキストを取得・整理するための支援ツール（プラグイン）です。

</div>

English README: [README.md](./README.md)

## これは何か
Graph Sieve は、シンプルな表示手段をもつ、ページ探索支援ツールです。

- ページ内容をシンプルな表示で閲覧可能
1. 本文に含まれるプロパティ・ページ参照・クエリ・レンダラー・[[Page]] 括弧などの除去/整形
   1. 常時隠すプロパティ指定・任意文字列除去・タスク変換・マクロ除去 などの正規化支援

CardBox プラグインをベースに機能拡張した派生版で、内部構造と設定体系を再設計しています。

## 使い方
1. 起動方法
   - Logseq のツールバーアイコンから起動
     > デフォルトでは非表示の場合があります
2. フォルダを選ぶ
   - 画面の「Folder Mode」ボタンから、対象グラフのフォルダ（中に `pages` を含む）を選択
   - ダイアログではグラフのルートフォルダ選択を求められます（`pages` が必須）
3. カード操作
   - 空ページは一覧に表示されません
   - カーソルで選択し Enter またはクリックでページを開き、右側プレビューにタブで表示
4. タブ内の操作
   - 表示種別の切替（Content / No Markdown / RAW）
   - 内容のコピー、タブの一括クローズ など

## プレビュータブ種類
- Content: Logseq 風の整形表示（プロパティ/refs 除外の反映）
- No Markdown: マークアップ除去済みのプレーンテキスト
- RAW: 加工後の生マークダウンデータ

## テキスト整形 / 表示オプション
主なオプション（設定は localStorage に保存されます）:

- Hide properties（本文からプロパティを隠す）
- Always hide properties（カンマ区切りで指定したプロパティを常時非表示）
- Strip [[ ]] brackets（[[Page Title]] → Page Title）
- Enable page links（ページリンクを有効化）
- Hide page refs（ページ参照を非表示）
- Hide queries（{{query ...}} を非表示）
- Hide renderers（{{renderer ...}} などのレンダラーを非表示）
- Remove macros（非クエリ系のカスタムマクロを除去）
- Normalize tasks（TODO/DOING/DONE… を Markdown チェックボックスへ正規化）
- Remove strings（指定文字列を本文・コピーから除去）

## 制限 / 注意
- フォルダモードは Logseq の階層やメタデータを完全に再現するものではありません。
- ホワイトボードや作成途中の一時ファイルは対象外です。
- 一部書式は Logseq 本体の描画と完全一致しない場合があります。

## クレジット
- 派生元: [CardBox](https://github.com/sosuisen/logseq-cardbox)（by [sosuisen](https://github.com/sosuisen)）を参考に再構築 [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://www.buymeacoffee.com/hidekaz)
- 利用ライブラリ: React, Dexie, Material UI, @logseq/libs

## 作者
Author: YU000jp [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://buymeacoffee.com/yu000japan)
