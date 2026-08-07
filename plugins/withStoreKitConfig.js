// `expo run:ios` は毎回内部で `expo prebuild` を走らせて ios/ を作り直すため、
// Xcode上で手動設定した「StoreKit Configuration」（Product > Scheme > Edit Scheme）は
// 次のビルドで消えてしまう（ios/koyomi.storekit ごと削除される）。
//
// このプラグインは prebuild の一部として、
//   plugins/koyomi.storekit（＝正本。ios/配下ではないので消えない）を
//   生成後の ios/koyomi.storekit へコピーするだけを行う。
//
// 【重要】以前はスキームファイル（.xcscheme）のXMLに
// StoreKitConfigurationFileReference を自動で書き込んでいたが、
// Xcodeがその参照パスをどう解決するかの仕様が非公開で、
// 相対パスだと参照が壊れ（赤字表示）、絶対パスだとXcode自体がクラッシュする
// （内部の `![self isAbsolutePath]` assertionに引っかかる）ことが分かったため、
// このプラグインでの自動書き込みは廃止した。
//
// StoreKit Configuration の選択は、`expo prebuild` のたびに
// Xcodeの Product > Scheme > Edit Scheme > Run > Options から
// 手動で一度選び直すこと（Xcode自身に書かせれば確実に正しいパスになる）。
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

      // .storekit ファイルを ios/ 直下へコピー
      const source = path.join(config.modRequest.projectRoot, 'plugins', STOREKIT_FILENAME);
      const dest = path.join(iosRoot, STOREKIT_FILENAME);
      if (!fs.existsSync(source)) {
        console.warn(`[withStoreKitConfig] ${source} が見つからないためスキップしました。`);
        return config;
      }
      fs.copyFileSync(source, dest);

      console.log(
        '[withStoreKitConfig] koyomi.storekit を ios/ にコピーしました。' +
          ' Xcodeで Product > Scheme > Edit Scheme > Run > Options を開き、' +
          ' StoreKit Configuration に koyomi.storekit を手動で選択してください。'
      );

      return config;
    },
  ]);
}

module.exports = withStoreKitConfig;
