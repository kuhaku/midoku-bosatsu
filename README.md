# 未読菩薩 (Midoku Bosatsu)

複数のあやしいわーるど系掲示板を1画面に表示するアプリです。

## 特徴

- 自動未読リロード機能
- 設定ファイルで取得対象の掲示板を増減可能
- 画像サムネイル表示
- NGワード機能
- ハイライト機能
- レス通知機能
- キーボードだけでもある程度操作できる
- ツリー表示対応
- 省メモリ設計
- クロスプラットフォーム (Windows, macOS, Linux)
- アプリの自動アップデート対応 (WindowsポータブルZIP版は除く)
- 観賞用自動モード (自動で新しい投稿を次々に表示するやつ)

## スクリーンショット

![https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu1.png?raw=true](https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu1.png?raw=true)

![https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu2.png?raw=true](https://github.com/kuhaku/midoku-bosatsu/blob/main/midoku-bosatsu2.png?raw=true)

## ダウンロード・実行に必要な手順

未読菩薩配布ページはこちら: https://github.com/kuhaku/midoku-bosatsu/releases

"draft" とついてないものを推奨します。

### Windows

- ファイル名に `windows` とついてるやつ

> [!WARNING]
> インストーラーを使いたくない用にZIP版を用意してますが、Windowsの仕様でアプリの自動アップデート機能はZIP版では使えません。

### macOS

- Apple silicon: ファイル名に `darwin_aarch64` とついてるやつ
- Intel: ファイル名に `darwin_x64` とついてるやつ

> [!IMPORTANT]
> Apple税を払ってないのでApple Developer証明書がありません(;´Д`)
> なので、アプリを実行するには以下の手順が必要となります。

#### ターミナルでやる場合

以下を実行

```sh
xattr -cr /Applications/midoku-bosatsu.app
```

#### GUIでやる場合

1. アプリ (`.app` ファイル) をダブルクリックします (警告が出ますがゴミ箱に捨てないでください)
2. macOSの `システム設定.app` を開きます
3. `システム設定.app` の左側のナビの「プライバシーとセキュリティ」を選択し、「このまま開く」で許可します

### Linux

- ファイル名に `linux` とついてるやつ (環境に合ったものを選んでください)

おすすめは `.AppImage` 形式のファイルに実行権限をつける方法です。

```sh
chmod 755 midoku-bosatsu*.AppImage
```
