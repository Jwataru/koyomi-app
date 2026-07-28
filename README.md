# koyomi（React Native / Expo版）

`koyomi_prototype_5.html` の見た目とロジックをもとに、React Native (Expo) プロジェクトとして
最初の骨組みを作成したものです。まだ npm install / 実機ビルドは行っていないので、
ここから Claude Code（またはお使いの開発環境）で続きを進めてください。

## 今できていること

- 周期計算ロジック（`src/logic/cycle.ts`）：プロトタイプの `calcLevel` / `isPeriodDay` を
  そのまま忠実に移植済み
- データ永続化（`src/data/storage.ts`）：設定・メモ・オンボーディング状態は AsyncStorage、
  写真は `FileSystem.documentDirectory` 配下にコピー保存 → すべて端末内のみに閉じる設計
- 画面5つ：
  - 「今日」：ステータスカード表示
  - 「カレンダー」：月表示＋日別メモ
  - 「プレビュー」：ロック画面風モックアップでレベル1〜4を切り替えて確認（`src/screens/PreviewScreen.tsx`）
  - 「設定」：周期・画像設定・ロック画面連携の起動導線
  - 「オンボーディング」（モーダル）：iOS/Android別のステップフロー、更新時刻選択、
    Androidのバッテリー最適化除外トグルまでプロトタイプの内容を移植済み（`src/screens/OnboardingScreen.tsx`）
- デザイントークン（色・レベル定義）は `src/theme/theme.ts` にプロトタイプの CSS 変数をそのまま移植
- 画像選択時は `expo-image-picker` の `allowsEditing` により、選択時点でOS標準のトリミングUIが使える
  （HTML版の自作クロップUIの代替として、まずはこれで範囲指定トリミングの要件をカバーしている）

## まだできていないこと（次にやること）

1. **プロジェクトの初期化**：`npm install` を実行して依存パッケージを取得
   （このサンドボックスはネットに繋がっていないため、ここでは実行できていません）
2. **フォントの読み込み**：Zen Old Mincho / Zen Kaku Gothic New を `expo-font` +
   `expo-google-fonts` 経由で読み込む設定（`theme.ts` の `fonts` は名前だけ用意した状態）
3. **ロック画面連携の実処理（一番技術検証が要る部分）**
   - 今のオンボーディング画面はUIとステート保存のみで、実際の壁紙反映処理は未実装
   - iOS: 生成した画像を専用アルバムに保存する処理までは `expo-media-library` で可能。
     そこから先の「ショートカット経由でロック画面に反映」は、App Intents や
     ショートカット連携用のネイティブコードが別途必要（Expo単体では完結しない見込み）
   - Android: `WallpaperManager` を呼び出すネイティブモジュールの実装と、
     指定時刻に自動実行するための `expo-background-task` / WorkManager 連携が必要
4. **壁紙用の合成画像生成**：レベル・時刻・写真を1枚の画像として書き出す処理
   （`react-native-view-shot` などでプレビュー画面をキャプチャする案が考えられる）
5. **範囲指定クロップのカスタムUI**：OS標準のトリミングで不十分な場合、
   HTML版のような自由な範囲選択UIを別途実装する

## 開発の始め方

```bash
npm install
npx expo start
```

Expo Goアプリ（iOS/Android）でQRコードを読み込むか、シミュレータ/エミュレータで確認できます。
ロック画面連携（上記4）に着手する段階では、Expo Goでは検証できないため
`npx expo prebuild` でネイティブプロジェクトを生成し、Xcode / Android Studioでの
ビルドに切り替える必要があります。
