# koyomi（React Native / Expo版）

`koyomi_prototype_5.html` の見た目とロジックをもとにした周期トラッキング＋ロック画面連携アプリ。
`npm install` ／ `expo prebuild` は完了済みで、`ios/` にネイティブプロジェクトも生成されており、
Expo Go・実機ビルドどちらでも動かせる状態です。

## 今できていること

- 周期計算ロジック（`src/logic/cycle.ts`）：プロトタイプの `calcLevel` / `isPeriodDay` を
  そのまま忠実に移植済み
- データ永続化（`src/data/storage.ts`）：設定・メモ・オンボーディング状態・TODOは AsyncStorage、
  写真は `FileSystem.documentDirectory` 配下にコピー保存 → すべて端末内のみに閉じる設計
- 画面5つ：
  - 「今日」：ステータスカード表示＋TODOリスト（チェックすると「チェック済み一覧」モーダルへ移動、
    チェック時刻の降順表示・個別削除・一括削除に対応）
  - 「カレンダー」：TimeTreeスタイルの週行グリッド、日別メモ・生理日フラグをカラーピルで表示、
    3件超は「＋N件」で折りたたみ
  - 「プレビュー」：ロック画面風モックアップでレベル1〜4を切り替えて確認（`src/screens/PreviewScreen.tsx`）
  - 「設定」：周期・画像設定・ロック画面連携の起動導線。ネイティブ日付ピッカーやデバウンス保存など実装済み
  - 「オンボーディング」（モーダル）：iOS/Android別のステップフロー、専用アルバムへの保存許可、
    「koyomi」ショートカットの追加案内、更新時刻選択、（Android向け）バッテリー最適化除外トグルまで
    プロトタイプの内容を移植済み（`src/screens/OnboardingScreen.tsx`）
- デザイントークン（色・レベル定義）は `src/theme/theme.ts` にプロトタイプの CSS 変数をそのまま移植
- 写真の切り抜き・位置調整（`src/components/CropModal.tsx`）：OS標準クロップは使わず、
  ロック画面と同じ縦横比の枠内でその場でズーム・位置調整をして確定する自前UI。
  以後の表示位置再調整は不要
- 写真の並べ替え：グリップハンドル（サムネ右下の6点アイコン）だけが `PanResponder` を持ち、
  タップでの写真選び直しとドラッグでの並べ替えのジェスチャーが競合しないよう分離済み
- **ロック画面連携（iOS）**：`src/services/wallpaperEngine.tsx` が中核。
  1. 画面外に常駐させたキャンバスをそのレベルの見た目で描画し、`react-native-view-shot` でキャプチャ
  2. `expo-media-library` で「koyomi壁紙」という専用アルバムに保存
  3. iOS標準の「ショートカット」アプリに追加してもらった「koyomi」ショートカット
     （オンボーディングで追加案内、手順画像は `src/assets/automation-guide/`）を
     `shortcuts://run-shortcut?name=koyomi` で実行し、実際のロック画面まで反映
  4. `koyomi://update-wallpaper` のディープリンクを開くと上記1〜3が自動で走る
     （ショートカット側の時刻トリガー・オートメーションから呼び出す想定）
  - Android向けの `WallpaperManager` 連携は未実装（後述、現状は方針としてiOS優先のため保留）
- アプリアイコン：`assets/icon.png`（およびiOSネイティブ側の
  `ios/koyomi/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`）に、
  レベル4色のリング＋「koyomi」ロゴのアイコンを設定済み

## まだできていないこと（次にやること）

1. **フォントの読み込み**：Zen Old Mincho / Zen Kaku Gothic New を `expo-font` +
   `expo-google-fonts` 経由で読み込む設定（`theme.ts` の `fonts` は名前だけ用意した状態で、
   package.jsonにはまだ両パッケージとも入っていない）
2. **EAS Build でのビルド確立**：ショートカット連携・ディープリンク・バックグラウンド動作は
   Expo Go の制約を受けやすいため、実機での本格検証には dev client またはスタンドアロンビルドが必要
3. **Android版のロック画面連携**：`WallpaperManager` を呼ぶネイティブモジュールの実装と、
   指定時刻に自動実行するための `expo-background-task` / WorkManager 連携（現状 iOS優先で保留中）
4. **Apple Developer Program登録・EAS Build設定・実機配布**：ストア提出に向けた開発者アカウント周り
5. **プライバシーポリシー整備・ストア提出準備**

## 開発の始め方

```bash
npm install
npx expo start
```

Expo Goアプリ（iOS）でQRコードを読み込むか、シミュレータで確認できます。
ロック画面連携（ショートカット実行・ディープリンク）を含めて検証する場合は、
`npx expo run:ios` で `ios/` のネイティブプロジェクトをビルドしてください
（既に `expo prebuild` 済みのため `ios/` フォルダはこのリポジトリに含まれています）。
