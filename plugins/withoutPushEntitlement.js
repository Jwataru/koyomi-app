// expo-notifications のプラグインは、`expo prebuild`（`expo run:ios` 実行時にも
// 自動で走る）のたびに ios/koyomi/koyomi.entitlements へ "aps-environment"
// （プッシュ通知用のエンタイトルメント）を無条件で追加し直す。
//
// このアプリはローカルのスケジュール通知のみを使っており、リモートpush通知は
// 使っていない。かつ、"aps-environment" は Apple Developer Program未登録の
// 個人チーム（Personal Team）ではビルドできない原因になるため、
// 同期のたびにこのプラグインで取り除く。
//
// app.json の plugins 配列で、必ず "expo-notifications" より後ろに置くこと
// （後に実行されたmodが最終的な内容を決めるため）。
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
