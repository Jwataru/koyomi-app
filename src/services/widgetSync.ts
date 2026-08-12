// ロック画面ウィジェット（iOS WidgetKit）へTODOを渡すための橋渡し。
//
// ウィジェット本体はReact Nativeのプロセス外（Widget Extension）で動くSwiftコードのため、
// JSから直接値を渡すことはできない。App Group + NSUserDefaults を介してデータを共有し、
// 書き込んだ後にウィジェットへ再描画（タイムラインの再読み込み）を要求する、という流れになる。
// 実体は @bacons/apple-targets が提供する ExtensionStorage ネイティブモジュール。
//
// @bacons/apple-targets は iOS のネイティブ拡張が前提のパッケージで、Xcode側で
// Widget Extensionターゲットをセットアップするまでは使えない（Androidにも存在しない）。
// そのためここでは動的requireにし、未セットアップ環境やAndroidでは静かに何もしないようにする。
import { Platform } from 'react-native';
import { LockScreenTodosSnapshot } from '../data/storage';

// app.json の ios.entitlements と、ウィジェットターゲット（targets/todo-widget/expo-target.config.js）
// 側の entitlements、どちらも同じ値にしておく必要がある。
export const WIDGET_APP_GROUP = 'group.com.yourname.koyomi';

// ロック画面ウィジェットは表示領域が小さいため、件数を絞って渡す。
const WIDGET_MAX_ITEMS = 4;

export type WidgetTodoItem = { id: string; text: string; dueDate: string };

/**
 * 現在の「ロック画面に反映済み」TODOスナップショットを、ウィジェットが読める場所に書き出し、
 * ウィジェットの再描画を要求する。iOS以外・ネイティブ未セットアップ環境では何もしない。
 */
export async function syncTodosToWidget(snapshot: LockScreenTodosSnapshot): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExtensionStorage } = require('@bacons/apple-targets');

    // @bacons/apple-targets はネイティブモジュールが見つからない場合、例外を投げずに
    // 「何もしない空関数」へ静かにフォールバックする（ライブラリ内部の仕様）。
    // そのため通常のtry/catchではネイティブ未リンクを検知できない。
    // ここで明示的にネイティブモジュールの存在を確認し、無ければ警告を出す。
    // @ts-expect-error - global.expo はExpo Modulesが実行時に生やすグローバル
    const nativeLinked = !!(typeof expo !== 'undefined' && expo?.modules?.ExtensionStorage);
    if (!nativeLinked) {
      console.warn(
        '[widgetSync] ネイティブモジュール ExtensionStorage が見つかりません。' +
          'このバイナリには @bacons/apple-targets のネイティブコードがリンクされていない可能性が高いです。' +
          '（Expo Goで起動している／prebuild後に実機へ再ビルドしていない、等が典型的な原因）' +
          '書き込みは静かに無視され、ウィジェットは常に空表示のままになります。'
      );
    }

    const storage = new ExtensionStorage(WIDGET_APP_GROUP);
    const items: WidgetTodoItem[] = snapshot.items.slice(0, WIDGET_MAX_ITEMS).map((t) => ({
      id: t.id,
      text: t.text,
      dueDate: t.dueDate ?? '',
    }));
    const json = JSON.stringify(items);
    storage.set('todos', json);
    storage.set('updatedAt', snapshot.updatedAt);
    ExtensionStorage.reloadWidget();

    // 書き込み直後に読み戻して、実際にApp Group共有ストレージへ届いているか確認する。
    const readBack = storage.get('todos');
    console.log('[widgetSync] 同期完了:', {
      appGroup: WIDGET_APP_GROUP,
      wroteItems: items.length,
      wroteJson: json,
      readBackFromStorage: readBack,
    });
  } catch (e) {
    // ウィジェットのXcodeターゲットをまだ組み込んでいない開発中は、ここで静かに失敗する
    // （@bacons/apple-targets 自体が入っていない場合も含む）。アプリ本体の動作には影響させない。
    console.warn('[widgetSync] ウィジェットへの同期に失敗しました（未セットアップの可能性）', e);
  }
}
