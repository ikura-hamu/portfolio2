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

### AI vs. AI: AI-Assisted Research into a Privilege Escalation Bug in the Google Pixel AI Coprocessor

- Androidのリモートコード実行
- PixelにはTPU載ってるらしい。へー

### Part 1: Why Frontier AI Is Rewriting Cyber Warfare: Preparing for AI That Can Serve as Both Sword and Shield / Part 2: China's Military Use of Artificial Intelligence

- AIで攻撃がめっちゃ増えてる
- 見つかってる脆弱性も増えてる
  - アクセス制御不備が目立つ

中国

- 中国は生成AI専用の規制がある。「社会主義核心価値観」に沿ったコンテンツの義務付けている
- ディープフェイク対策としてのラベル・透かしの義務化
- オープンソースAIの価値を強調
- いろんな分野へのAI活用の国家的な推進方針があり、科学技術など応用先の設定がある
- AIガバナンスの法律がある
- アメリカに依存しない自立したAI活用。チップからソフトウェアまでのサプライチェーン全体を作る。
- 一方でデータ保護を重視
- 世界の主導を目指す
- 智能化戦争
- DeepSeekのモデルを使ったツールを軍が作ったり使ったり
- 戦闘支援を行う車両やシミュレーション評価
- ロボットによる集団自律戦闘をできると主張している
- 完全にAIに任せるんじゃなくて最終的には人間が判断すると言っている
- AIは目標を達成するために最短ルートを探すため、味方を攻撃みたいなことがありえる
