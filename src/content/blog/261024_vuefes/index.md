---
title: Vue Fes Japan 2026 参加記
pubDate: 2026-10-24T01:29:23.519Z
---

## セッション

### キーノート

- tsrs
- content mapper
- なんでもはやくなるじゃん
- void zeroがお金を気にしなくてよくなったのはいいね
- voidはCloudflareアカウントいらないんだ。
- SSGもあるんだ
- tool design has a second audience
- 速いのが正義

### AstroとRustで考えるフロントエンドツールチェーンの今

- 最初GoだったのはesbuildがGo
- LinterとかフォーマッタとかLanguage toolが処理するのに、いろんな変換とかエッジケースの対応をたくさんしないといけない。
- Goに強い開発者が抜けて行った
- Rustのツールチェーンの発展
- oxc parserを使って.astroをASTにして、コード生成
- 誤ったHTMLの補正を行わなくなった
- コンパイルするだけじゃなくてlinterとかlanguage toolの対応大変だ
- Rustでできたtoolchainを活用してはやくなった

### Vite Task’s Cache Magic

- vp run、モノレポで便利
- エージェントは何回もコマンドを実行するのでキャッシュで速くするの大事
- 入力が同じだったら実行しない
- キャッシュヒットして実行しなくても出力はするんだ。パイプとかでこまるからそれはそうか
- 入力になるファイルを知るのが難しい。普通は人間がそれを指定する
- ファイルアクセスとかを監視する
- remote cacheも重要。（in development）Cloudflare workerで提供してくれるのいいね
-
