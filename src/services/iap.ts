// 有料版（買い切り／Non-Consumable）購入まわりの薄いラッパー。
// expo-iap の useIAP フックを、このアプリの「isPro」状態
// （AsyncStorageの proUnlocked。判定は src/logic/trial.ts）に橋渡しする。
//
// - Expo Go では動作しない（ネイティブモジュールのため）。Xcodeでビルドして確認する。
// - App Store Connect未登録でも、Xcodeの「StoreKit Configuration File」を使った
//   ローカルテストで購入フローを一通り確認できる（README参照）。
// - ここでの API（useIAP / requestProducts / requestPurchase / finishTransaction など）は
//   expo-iap の開発が活発で変わりやすいので、動かない場合はインストールした
//   バージョンの型定義（node_modules/expo-iap/build/*.d.ts）で名前を確認すること。
import { useCallback, useEffect } from 'react';
import { useIAP, type Purchase } from 'expo-iap';
import { saveProUnlocked } from '../data/storage';
import { cancelTrialNotifications } from './notifications';

// App Store Connect側で作る商品ID（買い切り/Non-Consumable）。
// 実際に商品を作成するときは、この文字列と完全に一致させること。
export const PRO_PRODUCT_ID = 'com.yourname.koyomi.pro';

export function usePurchasePro() {
  const {
    connected,
    products,
    requestProducts,
    requestPurchase,
    currentPurchase,
    currentPurchaseError,
    finishTransaction,
    getAvailablePurchases,
    availablePurchases,
  } = useIAP();

  // 接続できたら商品情報（価格表示など）を取得しておく。
  useEffect(() => {
    if (connected) {
      requestProducts({ skus: [PRO_PRODUCT_ID], type: 'inapp' });
    }
  }, [connected, requestProducts]);

  // 購入成立時の後処理（初回購入・復元どちらの経路でも呼ばれる）。
  const grantPro = useCallback(
    async (purchase: Purchase) => {
      await saveProUnlocked(true);
      await cancelTrialNotifications();
      await finishTransaction({ purchase, isConsumable: false });
    },
    [finishTransaction]
  );

  useEffect(() => {
    if (currentPurchase && currentPurchase.productId === PRO_PRODUCT_ID) {
      void grantPro(currentPurchase);
    }
  }, [currentPurchase, grantPro]);

  const buyPro = useCallback(async () => {
    await requestPurchase({ request: { sku: PRO_PRODUCT_ID, skus: [PRO_PRODUCT_ID] }, type: 'inapp' });
  }, [requestPurchase]);

  // 「購入を復元」ボタン用。機種変更・再インストール後に必須（Appleの審査要件でもある）。
  const restorePro = useCallback(async () => {
    await getAvailablePurchases();
  }, [getAvailablePurchases]);

  useEffect(() => {
    const restored = availablePurchases.find((p) => p.productId === PRO_PRODUCT_ID);
    if (restored) {
      void grantPro(restored);
    }
  }, [availablePurchases, grantPro]);

  const proProduct = products.find((p) => p.id === PRO_PRODUCT_ID);

  return {
    connected,
    proProduct, // proProduct?.displayPrice を購入ボタンの価格表示に使う想定
    buyPro,
    restorePro,
    purchaseError: currentPurchaseError,
  };
}
