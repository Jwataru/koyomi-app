// データはすべて端末内に閉じて保存する（インターネット上のサーバーには一切送らない）。
// - 数値・文字列などの設定/イベントデータ → AsyncStorage（端末内のみ）
// - アップロードした画像そのもの → FileSystem.documentDirectory 配下にコピーして保存
//
// これは koyomi の「アップロード画像等はユーザー端末内のローカルアプリ領域にのみ保存する」
// という要望をそのまま反映した設計。

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { LevelKey } from '../theme/theme';

const KEYS = {
  cycleSettings: 'koyomi:cycleSettings',
  events: 'koyomi:events',
  photoMeta: 'koyomi:photoMeta',
  onboarding: 'koyomi:onboarding',
  wallpaperSaved: 'koyomi:wallpaperSaved',
  wallpaperLastApplied: 'koyomi:wallpaperLastApplied',
  todos: 'koyomi:todos',
  lockScreenTodos: 'koyomi:lockScreenTodos',
  firstLaunchAt: 'koyomi:firstLaunchAt',
  proUnlocked: 'koyomi:proUnlocked',
  trialNotificationIds: 'koyomi:trialNotificationIds',
} as const;

export type CycleSettings = {
  nextPeriodDate: string; // "YYYY-MM-DD"
  cycleLen: number;
};

export type EventMap = Record<string, string[]>; // dateKey -> event titles

export type PhotoMeta = {
  uri: string | null; // FileSystem.documentDirectory 配下のローカルURI。
  // すでにロック画面と同じ縦横比で切り抜き済みの画像なので、表示位置の調整値は持たない。
};

export type PhotoMetaMap = Record<LevelKey, PhotoMeta>;

export type OnboardingState = {
  platform: 'ios' | 'android' | null;
  time?: string; // "HH:MM"（廃止済み。過去バージョンで保存された値との互換のためだけに残している）
  done: boolean;
};

// 「使用する写真を更新」ボタンで最後にアルバムへ保存した内容のスナップショット。
// これと現在の photoMeta を比較して、保存済みかどうか（＝ボタンをグレーアウトするか）を判定する。
export type WallpaperSavedSnapshot = { uri: string | null };
export type WallpaperSavedMap = Partial<Record<LevelKey, WallpaperSavedSnapshot>>;

// Todayタブに追加したTODOリスト用。
// checkedAt が null のものは未完了、値が入っているものはチェック済み（チェックした日時のISO文字列）。
// dueDate は "YYYY-MM-DD"（未設定は null）。showOnLockScreen はロック画面に表示したいかどうかの希望フラグで、
// 実際にロック画面へ反映されているかどうかは別途 lockScreenTodos（反映スナップショット）で管理する。
export type TodoItem = {
  id: string;
  text: string;
  checkedAt: string | null;
  createdAt: string;
  dueDate: string | null;
  showOnLockScreen: boolean;
};

// 「ロック画面に反映」ボタンを押した時点のスナップショット。
// TodoItem 側（現在の希望状態）とこれを比較することで、各TODOが「反映済みか／未反映か」を判定できる。
// ※ この時点ではまだ壁紙エンジン（wallpaperEngine）には接続しておらず、
//   このスナップショットを保存するところまでが実装範囲。実際にロック画面の見た目へ
//   反映する処理は今後 wallpaperEngine 側に組み込む。
export type LockScreenTodoSnapshotItem = {
  id: string;
  text: string;
  dueDate: string | null;
};
export type LockScreenTodosSnapshot = {
  updatedAt: string;
  items: LockScreenTodoSnapshotItem[];
};

const DEFAULT_CYCLE: CycleSettings = { nextPeriodDate: '', cycleLen: 28 };
const DEFAULT_PHOTO_META: PhotoMetaMap = {
  1: { uri: null },
  2: { uri: null },
  3: { uri: null },
  4: { uri: null },
};
const DEFAULT_ONBOARDING: OnboardingState = { platform: null, time: '07:00', done: false };

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const loadCycleSettings = () => getJSON(KEYS.cycleSettings, DEFAULT_CYCLE);
export const saveCycleSettings = (v: CycleSettings) => setJSON(KEYS.cycleSettings, v);

export const loadEvents = () => getJSON(KEYS.events, {} as EventMap);
export const saveEvents = (v: EventMap) => setJSON(KEYS.events, v);

export const loadPhotoMeta = () => getJSON(KEYS.photoMeta, DEFAULT_PHOTO_META);
export const savePhotoMeta = (v: PhotoMetaMap) => setJSON(KEYS.photoMeta, v);

export const loadOnboarding = () => getJSON(KEYS.onboarding, DEFAULT_ONBOARDING);
export const saveOnboarding = (v: OnboardingState) => setJSON(KEYS.onboarding, v);

export const loadWallpaperSaved = () => getJSON(KEYS.wallpaperSaved, {} as WallpaperSavedMap);
export const saveWallpaperSaved = (v: WallpaperSavedMap) => setJSON(KEYS.wallpaperSaved, v);

// 過去バージョン（dueDate / showOnLockScreen 追加前）に保存されたデータとの互換のため、
// 読み込み時に欠けているフィールドをデフォルト値で補う。
export async function loadTodos(): Promise<TodoItem[]> {
  const raw = await getJSON(KEYS.todos, [] as TodoItem[]);
  return raw.map((t) => ({
    ...t,
    dueDate: t.dueDate ?? null,
    showOnLockScreen: t.showOnLockScreen ?? false,
  }));
}
export const saveTodos = (v: TodoItem[]) => setJSON(KEYS.todos, v);

export const loadLockScreenTodos = () =>
  getJSON(KEYS.lockScreenTodos, null as LockScreenTodosSnapshot | null);
export const saveLockScreenTodos = (v: LockScreenTodosSnapshot) => setJSON(KEYS.lockScreenTodos, v);

// 無料期間の起算日（ISO文字列）。アプリの初回起動時に一度だけ書き込む。
export const loadFirstLaunchAt = () => getJSON(KEYS.firstLaunchAt, null as string | null);
export const saveFirstLaunchAt = (v: string) => setJSON(KEYS.firstLaunchAt, v);

// 買い切り版を購入済みかどうか。実際の課金処理は未実装のため、現状は常にfalseで、
// テスト用のデバッグ操作からのみtrueにできる。
export const loadProUnlocked = () => getJSON(KEYS.proUnlocked, false as boolean);
export const saveProUnlocked = (v: boolean) => setJSON(KEYS.proUnlocked, v);

// 無料期間の予告通知として現在スケジュール中の通知ID一覧。
// 再スケジュール時に「まず今の予約をキャンセルしてから新しく積み直す」ために使う。
export const loadTrialNotificationIds = () => getJSON(KEYS.trialNotificationIds, [] as string[]);
export const saveTrialNotificationIds = (v: string[]) => setJSON(KEYS.trialNotificationIds, v);

// 「今、アルバムの中で一番新しい（＝ショートカットの『最新の写真』が拾う）のはどのレベルの
// どの写真か」を覚えておくためのもの。ここが今回のリクエストと一致していれば、
// 実質的に何も変わっていないので Photos への無駄な書き込みをスキップする
// （※ 古い写真の削除はしない。削除は確認ダイアログが必ず出てしまい紛らわしいため撤去した）。
export type WallpaperLastApplied = { level: LevelKey; uri: string | null } | null;
export const loadWallpaperLastApplied = () => getJSON<WallpaperLastApplied>(KEYS.wallpaperLastApplied, null);
export const saveWallpaperLastApplied = (v: WallpaperLastApplied) => setJSON(KEYS.wallpaperLastApplied, v);

/**
 * ユーザーが選んだ画像（file://... の一時URI）を、アプリ専用の永続ディレクトリに
 * コピーして保存する。ここで保存した画像は、他アプリやクラウドと共有されない。
 */
export async function persistPhoto(level: LevelKey, sourceUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}koyomi-photos/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}level-${level}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  // キャッシュを避けるため毎回ユニークなクエリを付与
  return `${dest}?t=${Date.now()}`;
}
