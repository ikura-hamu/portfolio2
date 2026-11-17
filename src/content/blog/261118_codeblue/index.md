---
title: CODE BLUE 2026
pubDate: 2026-11-17T01:27:35.343Z
---

### [Pwn2Own Berlin 2026 $20,000] Agent2Shell: Your AI Coding Agent Already Ran the Attacker's Code

- gitのconfigの設定(filterとか)を通してCodex Desktop にコード実行させられる(させられた)。
- 「このフォルダを信頼する」大事
- 「ChatGPTで開く」でElectronの起動オプションとかから
- AI会社はLLMをほぼ無尽蔵に使えるのに脆弱性を埋め込んでしまうのを考えると、LLM時代のサイバーセキュリティは防御側に不利すぎる
- Claude Codeは、non ttyのときにフォルダ確認しない。-pのドキュメントには書かれてるが、パイプとかもこの挙動でドキュメントにない。hook実行とかができる
- 「信頼する」があっても人間がダメだったらだめじゃん
