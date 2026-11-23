# Astro Starter Kit: Blog

```sh
npm create astro@latest -- --template blog
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/blog)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/blog)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/blog/devcontainer.json)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

![blog](https://github.com/withastro/astro/assets/2244813/ff10799f-a816-4703-b967-c78997e8323d)

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## 数式の書き方

記事本文と管理画面のプレビューは、KaTeXによる数式表示に対応しています。
文中の数式は `$...$`、独立した数式は別行の `$$` で囲みます。

```markdown
エネルギーは $E = mc^2$ で表せます。

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

コード内の `$` は数式として処理されません。本文中でドル記号をそのまま
表示したい場合は `\$` と書きます。対応するコマンドは
[KaTeXの対応構文一覧](https://katex.org/docs/supported.html)を参照してください。

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).

### Skills と関連グラフ

`src/content/skill/*.yml` の1ファイルが1要素です。ファイル名がIDとなり、
`/about/skills/<ID>/` に詳細ページを生成します。`name`（タイトル）、
`description`、`icon`（Iconify名）、`category` を指定してください。
`category: technology` は About の Skills 一覧にも表示し、`field` は関連分野として扱います。

関係も `relation` Content Collection で管理しています。
`src/content/relation/*.yml` に次の形式で追加します。

```yaml
source: go
target: backend
label: サーバー開発に使う
```

`source` と `target` には要素のIDを指定します。
Astro の `reference("skill")` で参照先を検証します。
関係は双方向にたどるため、逆方向の定義は不要です。`label` は関係の説明です。
詳細ページは直接の隣接要素と、最短距離2以内の要素間の全関係を表示します。
追加した要素と関係は About の全体グラフにも自動で反映されます。

グラフ探索の検証: `node --test tests/skillGraph.test.ts`
