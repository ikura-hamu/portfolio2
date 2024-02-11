---
title: 'ポートフォリオを新しくした'
description: ''
pubDate: '2024/2/11'
heroImage: '/blog-placeholder-2.jpg'
tags: ["astro", "フロントエンド"]
---

ポートフォリオを新しくしました。
https://github.com/ikura-hamu/portfolio2

## 目次

## ここが変わった

- ブログがついた
- かっこいい

## 使った技術

### [astro](https://astro.build/)

フロントエンドのフレームワークです。

> Astroは、ブログやマーケティング、eコマースなど、コンテンツ駆動のウェブサイトを作成するためのウェブフレームワークです。Astroは、新しいフロントエンドアーキテクチャを開拓し、他のフレームワークと比較してJavaScriptのオーバーヘッドと複雑さを低減することで知られています。高速でSEOに優れたウェブサイトが必要なら、Astroが最適です。
>
> - <cite>https://docs.astro.build/ja/concepts/why-astro/ </cite>

traPの先輩のmazreanさんがポートフォリオで使っていたのを見て、よさそうだったので使いました。
(mazreanさんのポートフォリオはこちら→ https://mazrean.com)

実際に使ってみて、コンテンツコレクションが便利だと感じました。
https://docs.astro.build/ja/guides/content-collections/

コンテンツコレクションは、markdownやyamlなどのドキュメントやデータを、TypeScriptの型の恩恵を受けながら管理して扱うことができる仕組みです。このブログの内容や[aboutページ](/about)の技術とかのやつはコンテンツコレクションで管理しています。

```ts
import {z} from 'astro:content'

export const skills = z.array(z.object({
  name: z.string(),
  level: z.number(),
  description: z.string(),
  icon: z.string(),
}))

```

こんな感じでスキーマを定義して、

```yaml
- go:
  name: Go
  level: 3
  description: 普段何か作るときはだいたいGoを使います
  icon: devicon:go
- python:
  name: Python
  level: 2
  description: 競プロや何かさくっと作るときはPythonを使います
  icon: devicon:python
# 省略
```

こんな感じで内容を書きます。これを`src/content/skill`とかに置いておきます。

```ts
import { getEntry } from "astro:content";

const allSkills = await getEntry("skill", "skills");
```

すると、こんな感じで取得出来て、良い感じに扱えます。便利ですね。

また、テンプレートも充実していて、何もしなくてもちゃんとスタイルのついた状態から始められるので、とても楽でした。
https://astro.build/themes/

### [tailwind css](https://tailwindcss.com/)

自分はスタイリング(というよりcss)があまり好きではないのですが、去年の年末の冬ハッカソンでNext.jsでフロントを書いたときにtailwindを使って、結構楽しかったので今回も使いました。astroのテンプレートは普通のCSSで書かれているので、すべてを移行したわけではなく普通のとtailwindがどっちも入っているのですが、それでも動いているので楽でいいです。

### [Vercel](https://vercel.com)

デプロイ先。特に理由は無いです。

## おわり

おわりです。自分専用のブログが欲しいと思っていてついに念願かなったわけですが、当面はtraPのブログに書く気がします。こっちには何を書くんだろう。
