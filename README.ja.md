# Logseq Graph Sieve プラグイン
<div align="center">

旧グラフのファイルから、プレーンテキストを取得するための支援ツール(プラグイン)です。

Logseqモード: 現在のファイルベースグラフを読み込み

フォルダモード: 旧グラフのフォルダを読み込み

</div>

English README: [README.md](./README.md)

## これは何か
Graph Sieve は以下を 1 画面に統合したページ探索支援ツールです。

- 現在グラフ / 任意フォルダ (読み取り専用) を切り替えるフォルダモード
- プロパティ・refs・embeds・空行・[[Page]] 括弧・ページ参照など詳細な除去/整形
- 常時隠すプロパティ / 任意文字列除去 / ジャーナル除外 / ブラケット剥がしなどの正規化支援

CardBox プラグインをベースに機能拡張した派生版で、内部構造と設定体系を再設計しています。

## 使い方
1. 起動方法:
   - ツールバーアイコン
1. 閉じる
   - `Esc` または背景クリックで閉じます。

1. 起動すると現行グラフでカードリスト表示。
   > 右側にあるボタンで、フォルダモードに切り替えます
3. カードクリックで右側プレビューで開く。(タブが開く)
4. タブ内で表示種別切替 / コピー / Logseq で開く / Logseqに新規ページ生成など操作。

## プレビュータブ種類
- Content: Logseq 風描画 (プロパティ/refs 除外反映)
- No Markdown: マークアップ除去済プレーンテキスト
- Raw 生マークダウンデータ。(Logseq特有文字列の除去後)

## テキスト整形オプション
| オプション | 目的 |
|------------|------|
| Hide properties | プロパティを本文表示から除去 |
| Always hide properties | カンマ区切りプロパティを非表示 |
| [[...]] 括弧を剥がす | [[Page Title]] → Page Title |
| Page refs を除去 | リンクにしない |
| クエリブロックを隠す | {{query ...}} を除去 |
| 文字列除去 (removeStrings) | 指定文字列を本文・コピーから除去 |

設定は localStorage に保存されます。

## 制限 / 注意
- フォルダモードは Logseq の階層/メタを完全再現しません。
- ホワイトボード / 作成途中一時ファイルは対象外。
- 一部書式が Logseq 本体と完全一致しない場合があります。

## クレジット
- 派生元: [CardBox](https://github.com/sosuisen/logseq-cardbox) (by [sosuisen](https://github.com/sosuisen)) を参考に再構築 [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://www.buymeacoffee.com/hidekaz)
- 利用ライブラリ: React, Dexie, Material UI, @logseq/libs

## 作者
Author: YU000jp [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://buymeacoffee.com/yu000japan)