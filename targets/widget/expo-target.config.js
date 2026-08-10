// @bacons/apple-targets 用のウィジェットターゲット設定。
// `npx expo prebuild -p ios --clean` を実行すると、この内容をもとに
// Xcode の Widget Extension ターゲットが生成・同期される。
//
// 事前に `npx create-target widget` でこのフォルダの雛形を作った場合は、
// 生成された expo-target.config.js をこの内容で上書きしてください。

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'todo-widget',
  displayName: 'koyomi TODO',

  // ロック画面ウィジェットは基本的にシステムのアクセントカラーで単色描画されるが、
  // ウィジェット編集ギャラリー等での見た目に使われる
  colors: {
    $accent: '#7FBFA0',
  },

  frameworks: ['SwiftUI', 'WidgetKit'],

  // ロック画面ウィジェット（accessory系ファミリー）は iOS16以降
  deploymentTarget: '16.0',

  // アプリ本体と同じ App Group を使い、TODOデータを共有する
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
