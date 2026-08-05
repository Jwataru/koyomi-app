// 無料期間の終了が近いことを知らせるローカル通知。
//
// - サーバーを使わない完全ローカルのスケジュール通知（expo-notifications）なので、
//   Expo Go でもそのまま動作する（push通知と違い、開発ビルドは不要）。
// - 「残り7日」「残り1日」「当日（終了）」の3本を、初回起動日（firstLaunchAt）を基準に
//   一度にまとめてスケジュールする。
// - 同じ内容で何度呼んでも安全なように、呼ぶたびに「前回スケジュールした分」を
//   先にキャンセルしてから新しく積み直す（IDはAsyncStorageに覚えておく）。
import * as Notifications from 'expo-notifications';
import { loadTrialNotificationIds, saveTrialNotificationIds } from '../data/storage';
import { TRIAL_DAYS } from '../logic/trial';

const DAY_MS = 1000 * 60 * 60 * 24;

// アプリがフォアグラウンドにいる間に通知を受け取った場合の表示挙動。
// これを設定しておかないと、アプリを開いている間は通知が画面に出ない。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

async function scheduleAt(date: Date, title: string, body: string): Promise<string | null> {
  // 過去日時になってしまった場合は登録しない（iOSでは即時発火してしまう可能性があるため）。
  if (date.getTime() <= Date.now()) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

/**
 * 無料期間の起算日（firstLaunchAt）をもとに、「残り7日」「残り1日」「当日」の
 * 3通知を（再）スケジュールする。すでに予約済みの分があれば先にキャンセルする。
 * 通知の許可が下りていない場合は何もしない。
 */
export async function scheduleTrialNotifications(firstLaunchAt: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await cancelTrialNotifications();

  const base = new Date(firstLaunchAt).getTime();
  const ids: string[] = [];

  const sevenDaysBefore = await scheduleAt(
    new Date(base + (TRIAL_DAYS - 7) * DAY_MS),
    'koyomiの無料期間があと7日で終了します',
    '終了後はロック画面の自動切り替えが停止します。「設定」タブから買い切り版に切り替えられます。'
  );
  if (sevenDaysBefore) ids.push(sevenDaysBefore);

  const oneDayBefore = await scheduleAt(
    new Date(base + (TRIAL_DAYS - 1) * DAY_MS),
    'koyomiの無料期間は明日までです',
    '明日を過ぎるとロック画面の自動切り替えが停止します。'
  );
  if (oneDayBefore) ids.push(oneDayBefore);

  const onExpiry = await scheduleAt(
    new Date(base + TRIAL_DAYS * DAY_MS),
    'koyomiの無料期間が終了しました',
    'ロック画面の自動切り替えが停止しています。「設定」タブから買い切り版に切り替えるとすぐに再開できます。'
  );
  if (onExpiry) ids.push(onExpiry);

  await saveTrialNotificationIds(ids);
}

/** 購入済みになったときなど、予定していた予告通知が不要になった場合に呼ぶ。 */
export async function cancelTrialNotifications(): Promise<void> {
  const ids = await loadTrialNotificationIds();
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  await saveTrialNotificationIds([]);
}

// ---- ここから下は動作確認（テスト）専用のヘルパー ----

/**
 * 指定秒後に届くテスト通知を1件送る。無料期間の通知スケジュールとは独立しており、
 * IDの記録・上書き管理の対象外（気軽に何度でも撃てる）。
 * 通知の許可が下りていない場合はfalseを返す。
 */
export async function sendTestNotification(afterSeconds = 5): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'koyomi テスト通知',
      body: `${afterSeconds}秒後に届くように予約したテスト通知です。`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: afterSeconds, repeats: false },
  });
  return true;
}

/** 現在スケジュールされている全通知（トライアル分＋テスト分）の一覧。デバッグ表示用。 */
export async function listScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
