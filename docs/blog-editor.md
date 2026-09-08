# ブログエディタ

管理画面は `/admin/editor`。Astroの公開ページは静的生成のまま、管理画面と `/api/editor/*` だけをVercelのサーバー処理にする。

## 記事の保存

- 新規記事は `src/content/blog/<slug>/index.md`。
- 既存記事は移動しない。読み込んだパスにそのまま保存する。
- 編集開始時にmainのコミットから `blog/<slug>-<識別子>` を作成する。
- 入力中はIndexedDBに自動保存。「ブランチに保存」でGitHub Contents APIを使ってコミットする。
- SHAが一致しなければ競合画面に切り替える。自動的な上書きやforce pushは行わない。
- mainへの書き込み・記事以外のパスへの書き込みをAPI側で拒否する。
- 公開はGitHub上でPRを作り、mainへマージする。
- このリポジトリは公開されているため、作業ブランチの原稿もGitHub上で公開される。

端末内の原稿一覧から続きの編集ができる。別端末ではGitHubのブランチを選択する。通信断・認証切れのときも画面内の原稿を保持し、`.mdをダウンロード`で取り出せる。オフラインでの初回起動・再読み込みは対象外。ブラウザーのデータ削除によってIndexedDBは失われるため、端末内保存はGitHubへの保存の代わりにはならない。

## 初回の認証設定（管理者による作業）

このエディタ用のGitHub Appを作成し、`ikura-hamu/portfolio2`だけにインストールする。ChatGPTのGitHub接続とは別のアプリ登録が必要。

1. GitHubのDeveloper settingsでGitHub Appを新規登録する。
2. Homepage URLを `https://ikura-hamu.work`、Callback URLを `https://ikura-hamu.work/api/editor/auth/callback` に設定する。別のホストで検証する場合はそのホストを使う。
3. Repository permissionsのContentsをRead and writeにする。MetadataはGitHubの必須権限。Pull requests権限は不要。
4. Webhookは無効にする。Device flowも不要。ユーザー認証はstate・PKCE付きのWeb application flowを使用する。
5. App ID、Client ID、Client secret、秘密鍵、インストール先のInstallation IDを取得する。
6. `.env.example`の各項目をVercelの環境変数に設定する。秘密鍵・Client secretをGitやチャットに貼り付けない。

| 変数                         | 設定値                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| `EDITOR_ORIGIN`              | 管理画面のオリジン。例: `https://ikura-hamu.work`。末尾スラッシュなし |
| `EDITOR_GITHUB_USER_ID`      | 本人の数値ID `104292023`                                              |
| `EDITOR_SESSION_SECRET`      | 暗号学的乱数で作った32文字以上の値                                    |
| `GITHUB_APP_ID`              | App ID                                                                |
| `GITHUB_APP_CLIENT_ID`       | Client ID                                                             |
| `GITHUB_APP_CLIENT_SECRET`   | Client secret                                                         |
| `GITHUB_APP_INSTALLATION_ID` | portfolio2を選択したインストールのID                                  |
| `GITHUB_APP_PRIVATE_KEY`     | PEM形式の秘密鍵。改行を `\n` として入力してもよい                     |

環境変数未設定時は管理画面が503となり、認証を省略して開くことはない。ローカル実行の場合は `.env` に設定する。ただしサーバーコードは `process.env` を読むため、起動プロセスにも読み込ませる（例: `node --env-file=.env node_modules/astro/astro.js dev`）。ローカル用のoriginは `http://localhost:4321` とし、GitHub Appにも同じホストのCallback URLを登録する。

GitHub OAuthトークンはユーザーIDの確認にだけ使用し、ブラウザーには渡さない。セッションCookieは署名・HttpOnly・SameSite付きで8時間有効。GitHubへの書き込みはサーバー上で発行するインストールトークンを使用する。ログアウトでCookieを削除する。端末内原稿は残す。

## プレビュー

改行と目次の設定を本番と揃え、HTMLをサニタイズする。既存の相対画像とpublic画像は選択したブランチから読み込む。リンクカード・外部埋め込みスクリプト・コードの色付けは簡易プレビューでは再現しない。画像アップロードは初期版の対象外。

## 検証

- `pnpm test:editor`: 保存先制限、SHA競合、再送、セッション検証、既存Markdownの保持、プレビューのサニタイズ。
- `pnpm exec astro check --noSync`: 外部リンクカードの取得を行わず型を確認する。
- `pnpm build`: 記事を含む全体ビルド。既存リンクカードが外部サイトにアクセスするため、この環境では検証を保留している。CIでは通常のビルドを実行する。

認証設定後に、本人以外のログイン拒否、新規作成、既存記事の編集、GitHubへの保存、別端末での競合、通信切断・復帰を確認する。iPhone Safari・Android Chromeの実機で日本語変換、選択、Undo、キーボード表示時のカーソル位置、画面回転を確認する。これらの実機・実アカウント検証は未実施。
