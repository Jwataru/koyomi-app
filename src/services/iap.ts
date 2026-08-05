// 有料版（買い切り／Non-Consumable）購入まわりの薄いラッパー。
// expo-iap の useIAP フックを、このアプリの「isPro」状態
// （AsyncStorageの proUnlocked。判定は src/logic/trial.ts）に橋渡しする。
//
// - Expo Go では動作しない（ネイティブモジュールのため）。Xcodeでビルドして確認する。
// - App Store Connect未登録でも、Xcodeの「StoreKit Configuration File」を使った
//   ローカルテストで購入フローを一通り確認できる（README参照）。
// - ここでの API（useIAP の戻り値のプロパティ名）は expo-iap の開発が活発で
//   バージョンごとに変わりやすい（例: requestProducts/fetchProducts/getProducts が
//   混在している）。そのため主要な呼び出しは複数の候補名を実行時に探して
//   最初に見つかったものを使う、というやや防御的な書き方にしている。
import { useCallback, useEffect } from 'react';
import { useIAP, type Purchase } from 'expo-iap';
import { saveProUnlocked } from '../data/storage';
import { cancelTrialNotifications } from './notifications';

// App Store Connect側で作る商品ID（買い切り/Non-Consumable）。
// 実際に商品を作成するときは、この文字列と完全に一致させること。
export const PRO_PRODUCT_ID = 'com.yourname.koyomi.pro';

export function usePurchasePro(options?: { onUnlocked?: () => void }) {
  // 型定義がバージョンでブレるため any で受け、使うものだけ都度取り出す。
  const iap = useIAP() as any;
  const {
    connected,
    products = [],
    currentPurchase,
    currentPurchaseError,
    finishTransaction,
    availablePurchases = [],
  } = iap;

  // バージョンによって関数名が違うので、存在するものを優先順で採用する。
  const fetchProductsFn = iap.requestProducts ?? iap.fetchProducts ?? iap.getProducts;
  const requestPurchaseFn = iap.requestPurchase ?? iap.purchaseProduct;
  const restorePurchasesFn = iap.getAvailablePurchases ?? iap.restorePurchases;

  // 接続できたら商品情報（価格表示など）を取得しておく。
  useEffect(() => {
    if (connected && fetchProductsFn) {
      fetchProductsFn({ skus: [PRO_PRODUCT_ID], type: 'inapp' });
    }
  }, [connected, fetchProductsFn]);

  // 購入成立時の後処理（初回購入・復元どちらの経路でも呼ばれる）。
  const grantPro = useCallback(
    async (purchase: Purchase) => {
      await saveProUnlocked(true);
      await cancelTrialNotifications();
      await finishTransaction?.({ purchase, isConsumable: false });
      options?.onUnlocked?.();
    },
    [finishTransaction, options]
  );

  useEffect(() => {
    if (currentPurchase && currentPurchase.productId === PRO_PRODUCT_ID) {
      void grantPro(currentPurchase);
    }
  }, [currentPurchase, grantPro]);

  const buyPro = useCallback(async () => {
    if (!requestPurchaseFn) throw new Error('購入機能が利用できません（expo-iapのAPIが見つかりません）。');
    await requestPurchaseFn({ request: { sku: PRO_PRODUCT_ID, skus: [PRO_PRODUCT_ID] }, type: 'inapp' });
  }, [requestPurchaseFn]);

  // 「購入を復元」ボタン用。機種変更・再インストール後に必須（Appleの審査要件でもある）。
  const restorePro = useCallback(async () => {
    if (!restorePurchasesFn) throw new Error('復元機能が利用できません（expo-iapのAPIが見つかりません）。');
    await restorePurchasesFn();
  }, [restorePurchasesFn]);

  useEffect(() => {
    const restored = availablePurchases.find((p: Purchase) => p.productId === PRO_PRODUCT_ID);
    if (restored) {
      void grantPro(restored);
    }
  }, [availablePurchases, grantPro]);

  const proProduct = products.find((p: any) => p.id === PRO_PRODUCT_ID);

  return {
    connected,
    proProduct, // proProduct?.displayPrice を購入ボタンの価格表示に使う想定
    buyPro,
    restorePro,
    purchaseError: currentPurchaseError,
  };
}
