/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  icon: 'https://github.com/expo.png',

  // 【重要】config.ios.entitlements から動的に読み取ると、
  // @bacons/apple-targets の静的プラグインが実行されるタイミングによっては
  // まだ値が確定しておらず undefined になることがある
  // （expo-notifications 等が使う entitlements mod は遅延実行のため）。
  // App Group のIDは固定値なので、直接書く。
  // app.json の ios.entitlements と同じ値にすること。
  entitlements: {
    'com.apple.security.application-groups': ['group.com.yourname.koyomi'],
  },
});
