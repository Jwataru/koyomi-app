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
  // onError: fetchProducts等の失敗を握りつぶさずログに出す（¥ー表示のまま原因不明になるのを防ぐ）。
  const iap = useIAP({
    onError: (error) => {
      if (__DEV__) {
        console.warn('[iap] エラー:', error?.message ?? error);
      }
    },
  }) as any;
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
      fetchProductsFn({ skus: [PRO_PRODUCT_ID], type: 'in-app' }).catch((e: any) => {
        if (__DEV__) {
          console.warn('[iap] 商品情報の取得に失敗しました:', e?.message ?? e);
        }
      });
    }
  }, [connected, fetchProductsFn]);

  // 接続はできたのに商品が1件も取得できない＝典型的には
  //「StoreKit Configuration が実機/シミュレータに反映されていない」状態（README参照）。
  // 開発時に気づけるよう warn を出す（本番では何もしない）。
  useEffect(() => {
    if (__DEV__ && connected && products.length === 0) {
      console.warn(
        '[iap] connected=true ですが products が空です。' +
          ' Xcodeで ios/koyomi.xcworkspace を開き、Product > Scheme > Edit Scheme > Run > Options の' +
          ' 「StoreKit Configuration」が koyomi.storekit になっているか、' +
          ' 一度Xcodeから直接Run（Cmd+R）したかを確認してください' +
          '（`expo run:ios` 等CLI経由の起動だとStoreKit設定が反映されないことがあります）。'
      );
    }
  }, [connected, products.length]);

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

  const proProduct = products.find((p: any) => p.id === PRO_PRODUCT_ID);

  const buyPro = useCallback(async () => {
    if (!requestPurchaseFn) throw new Error('購入機能が利用できません（expo-iapのAPIが見つかりません）。');
    // products にまだ載っていない商品を購入しようとすると、ネイティブ側は
    // 「SKU not found」という分かりにくいエラーを返す。ここで先に検知して、
    // 原因（StoreKit Configurationが反映されていない等）が分かるメッセージに変える。
    if (!proProduct) {
      throw new Error(
        '商品情報を取得できていません。StoreKit Configuration（koyomi.storekit）が' +
          '有効な状態でビルドされているか確認してください。'
      );
    }
    // iOS/Androidでリクエストの形が異なる（OpenIAP仕様）。
    // apple.sku は単一の文字列、google.skus は配列を渡す。
    await requestPurchaseFn({
      request: {
        apple: { sku: PRO_PRODUCT_ID },
        google: { skus: [PRO_PRODUCT_ID] },
      },
      type: 'in-app',
    });
  }, [requestPurchaseFn, proProduct]);

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

  return {
    connected,
    proProduct, // proProduct?.displayPrice を購入ボタンの価格表示に使う想定
    buyPro,
    restorePro,
    purchaseError: currentPurchaseError,
  };
}
