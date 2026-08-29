# 未読菩薩 (Midoku Bosatsu)

複数のあやしいわーるど系掲示板を1画面に表示するアプリです。

## 特徴

- 設定ファイルで取得対象の掲示板を増減可能
- 自動未読リロード機能
- サムネイル画像表示
- NGワード機能
- ハイライト機能
- レス通知機能
- キーボードだけでもある程度操作できる
- ツリー表示対応
- 省メモリ設計

## スクリーンショット

![https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu1.png?raw=true](https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu1.png?raw=true)

![https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu2.png?raw=true](https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu2.png?raw=true)

## macOS版の配布

macOS版は `npm run tauri build` で生成します。`tauri.conf.json` では、証明書を用意できない環境でもApple Silicon上で未署名アプリが「壊れている」と判定されないよう、アドホック署名を有効にしています。

```bash
npm run tauri build -- --bundles app,dmg
```

現在のRelease workflowはmacOSのアドホック署名で動作し、Apple certificate / notarization系のSecretは使いません。これはCI上での現行の配布方法です。

将来、macOSをDeveloper ID Application証明書で署名して公証する運用に切り替える場合は、Apple Developerの証明書と公証用Secretを別途用意する必要があります。ただし、それは現時点では手動の将来手順であり、現在のCI動作ではありません。

## GitHub Releasesによる更新

このアプリはGitHub Releasesの `latest.json` から更新を確認します。アプリ起動時に一度だけ更新チェックを行い、更新がある場合だけインストール確認を表示します。利用者が承認したときだけダウンロードとインストールを行い、完了後は自動で再起動します。キャンセルした場合や更新チェック・ダウンロード・インストールに失敗した場合でも、現在のバージョンはそのまま使えます。

更新を公開する側は、Tauri updater用の署名鍵を最初に生成します。秘密鍵はリポジトリに入れず、ローカルの安全な場所かTauriの安全な鍵ディレクトリに保管してください。次の `/private/tmp` は鍵生成時だけ使う一時置き場であり、OSによって削除され得るため永続的な保管先には使いません。

```bash
npm run tauri signer generate -- -w /private/tmp/midoku-bosatsu-updater.key
```

生成後は秘密鍵を直ちにアクセス制限された永続的な秘密保管先へ移し、暗号化した安全なバックアップも作成してください。秘密鍵は絶対にコミットしないでください。秘密鍵を失うと、すでにインストール済みの利用者は今後の更新を受け取れなくなります。`tauri.conf.json` には生成物の `.pub` ファイルの中身だけを設定し、秘密鍵本体は含めません。

GitHub Actions では次の2つの Secret を設定します。

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Release workflow には `contents: write` 権限が必要です。タグ push で `app-v*` のリリースを作成し、`latest.json` と updater artifact を GitHub Releases に公開します。公開するタグは、`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` の3つの `version` と一致していなければなりません。matrix build中のReleaseはdraftのまま保持され、全platformのbuildが成功した後に単一のpublish jobが公開します。現在の版は `0.1.0` なので、公開時は次のタグ付けコマンドを使います。

```bash
git tag app-v0.1.0 && git push origin app-v0.1.0
```

更新の署名鍵を作り直したり、公開鍵を差し替えたりする場合は、既存の利用者が古い公開鍵で検証できなくなるため、更新経路に影響が出ます。鍵の保管場所と `.pub` の設定値は必ず一致させてください。
