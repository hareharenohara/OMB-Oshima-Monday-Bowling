# OMB - PWA化 デプロイ手順（GitHub → Cloudflare Pages）

## このフォルダの中身

```
index.html        本体（マニフェスト読込・SW登録を追加済み）
manifest.json      PWAマニフェスト
sw.js               Service Worker（アプリ外殻のみキャッシュ、Supabase通信はキャッシュしない）
_headers            Cloudflare Pages用キャッシュ設定（sw.js等を常に最新取得させる）
icons/              各サイズのアイコン（添付ロゴから生成済み）
```

## 1. GitHubリポジトリを作る

1. GitHubで新しいリポジトリを作成（例: `omb-app`）。Public/Privateどちらでも可。
2. このフォルダの中身（`index.html` `manifest.json` `sw.js` `_headers` `icons/`）を
   リポジトリの**ルート直下**にそのままコミット＆プッシュする。
   ```
   git init
   git add .
   git commit -m "PWA対応版を追加"
   git branch -M main
   git remote add origin https://github.com/<あなたのアカウント>/omb-app.git
   git push -u origin main
   ```

## 2. Cloudflare Pagesに接続する

1. Cloudflareダッシュボード →「Workers & Pages」→「アプリケーションを作成」→「Pages」→「Gitに接続」
2. 先ほどのGitHubリポジトリを選択して連携を許可
3. ビルド設定は以下でOK（ビルド不要な静的サイトのため）
   - フレームワークプリセット: `None`
   - ビルドコマンド: 空欄のまま
   - ビルド出力ディレクトリ: `/`（ルートのまま）
4. 「保存してデプロイ」を押すと、`https://omb-app.pages.dev` のようなURLが発行される
5. 独自ドメインを使いたい場合は、Pagesプロジェクトの「カスタムドメイン」から追加可能

## 3. Supabaseの設定確認

- SUPABASE_URL / SUPABASE_ANON_KEY は `index.html` に既に埋め込まれているので追加設定不要
- Supabase側の「Authentication」→「URL Configuration」に、Cloudflare Pagesの発行URL
  （`https://omb-app.pages.dev` など）を許可リストに追加しておくと安全

## 4. 動作確認

- スマホでCloudflare PagesのURLを開く
- Android(Chrome): 自動的に「ホーム画面に追加」の案内が出る場合がある。出ない場合はメニューから「ホーム画面に追加」
- iPhone(Safari): 共有ボタン →「ホーム画面に追加」
- ホーム画面のアイコンから起動すると、ブラウザのアドレスバーなしでアプリのように開く

## 5. 更新時の注意

- コードを修正して`main`ブランチにpushすると、Cloudflare Pagesが自動で再デプロイする
- `sw.js`はキャッシュ戦略上「ネットワーク優先」なので、通常はpush後すぐに新しいindex.htmlが反映される
- キャッシュの世代を明示的に切り替えたい場合は、`sw.js`内の`CACHE_VERSION`の値
  （例: `omb-cache-v1` → `omb-cache-v2`）を変更してからpushする
