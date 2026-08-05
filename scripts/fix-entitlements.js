// `npx expo prebuild` のたびに ios/koyomi/koyomi.entitlements へ
// "aps-environment"（プッシュ通知用のエンタイトルメント）が自動で追加され直してしまう
// （expo-notifications が自動リンクされたモジュールとして要求するため。
//  app.json 側の config plugin で打ち消そうとしても、prebuild内部のマージ順序の都合で
//  効かないことがある）。
//
// このアプリはローカルのスケジュール通知のみでリモートpush通知は使っておらず、
// "aps-environment" は個人チーム（Apple Developer Program未登録）ではビルド不能の
// 原因になるため、prebuild実行後に毎回このスクリプトで確実に取り除く。
//
// 使い方: `npx expo prebuild --platform ios` の直後に
//         `node scripts/fix-entitlements.js` を実行する
//         （package.json の "prebuild:ios" スクリプトに組み込み済み）。
const fs = require('fs');
const path = require('path');

const ENTITLEMENTS_PATH = path.join(__dirname, '..', 'ios', 'koyomi', 'koyomi.entitlements');

function main() {
  if (!fs.existsSync(ENTITLEMENTS_PATH)) {
    console.log(`[fix-entitlements] ${ENTITLEMENTS_PATH} が見つかりません（ios/未生成？）。スキップします。`);
    return;
  }

  const original = fs.readFileSync(ENTITLEMENTS_PATH, 'utf8');

  // <key>aps-environment</key> とその直後の <string>...</string> をまとめて除去する。
  const stripped = original.replace(
    /\s*<key>aps-environment<\/key>\s*<string>[^<]*<\/string>/,
    ''
  );

  if (stripped === original) {
    console.log('[fix-entitlements] aps-environment は含まれていませんでした（すでにクリーン）。');
    return;
  }

  fs.writeFileSync(ENTITLEMENTS_PATH, stripped, 'utf8');
  console.log('[fix-entitlements] aps-environment を entitlements から削除しました。');
}

main();
