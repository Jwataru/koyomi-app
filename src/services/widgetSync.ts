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
    const storage = new ExtensionStorage(WIDGET_APP_GROUP);
    const items: WidgetTodoItem[] = snapshot.items.slice(0, WIDGET_MAX_ITEMS).map((t) => ({
      id: t.id,
      text: t.text,
      dueDate: t.dueDate ?? '',
    }));
    storage.set('todos', JSON.stringify(items));
    storage.set('updatedAt', snapshot.updatedAt);
    ExtensionStorage.reloadWidget();
  } catch (e) {
    // ウィジェットのXcodeターゲットをまだ組み込んでいない開発中は、ここで静かに失敗する
    // （@bacons/apple-targets 自体が入っていない場合も含む）。アプリ本体の動作には影響させない。
    console.warn('[widgetSync] ウィジェットへの同期に失敗しました（未セットアップの可能性）', e);
  }
}
