// `expo run:ios` は毎回内部で `expo prebuild` を走らせて ios/ を作り直すため、
// Xcode上で手動設定した「StoreKit Configuration」（Product > Scheme > Edit Scheme）は
// 次のビルドで消えてしまう（ios/koyomi.storekit ごと削除され、
// koyomi.xcscheme の LaunchAction も生成テンプレートに戻る）。
//
// このプラグインは prebuild の一部として、
//   1. plugins/koyomi.storekit（＝正本。ios/配下ではないので消えない）を
//      生成後の ios/koyomi.storekit へコピー
//   2. 生成された Debug スキーム（ios/koyomi.xcodeproj/.../koyomi.xcscheme）の
//      LaunchAction に StoreKitConfigurationFileReference を追記
// を毎回自動でやり直す。
//
// 商品を追加・変更したいときは必ず plugins/koyomi.storekit を編集すること。
// ios/koyomi.storekit を直接編集しても次回ビルドで上書きされて消える。
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STOREKIT_FILENAME = 'koyomi.storekit';

function withStoreKitConfig(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName ?? config.name;

      // 1. .storekit ファイルを ios/ 直下へコピー
      const source = path.join(config.modRequest.projectRoot, 'plugins', STOREKIT_FILENAME);
      const dest = path.join(iosRoot, STOREKIT_FILENAME);
      if (!fs.existsSync(source)) {
        console.warn(`[withStoreKitConfig] ${source} が見つからないためスキップしました。`);
        return config;
      }
      fs.copyFileSync(source, dest);

      // 2. Debug用スキームに StoreKitConfigurationFileReference を追記
      const schemePath = path.join(
        iosRoot,
        `${projectName}.xcodeproj`,
        'xcshareddata',
        'xcschemes',
        `${projectName}.xcscheme`
      );
      if (!fs.existsSync(schemePath)) {
        console.warn(`[withStoreKitConfig] ${schemePath} が見つからないためスキップしました。`);
        return config;
      }

      let scheme = fs.readFileSync(schemePath, 'utf8');
      if (!scheme.includes('StoreKitConfigurationFileReference')) {
        const insertion =
          `      <StoreKitConfigurationFileReference\n` +
          `         identifier = "${STOREKIT_FILENAME}">\n` +
          `      </StoreKitConfigurationFileReference>\n` +
          `   </LaunchAction>`;
        scheme = scheme.replace('</LaunchAction>', insertion);
        fs.writeFileSync(schemePath, scheme, 'utf8');
      }

      return config;
    },
  ]);
}

module.exports = withStoreKitConfig;
