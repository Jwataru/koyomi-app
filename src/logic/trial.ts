// 無料期間（初回起動から60日間）とロック画面自動連携のロック状態を判定するロジック。
//
// - 「無料期間」はロック画面自動連携（写真の壁紙化＋専用アルバム保存）にのみ適用される。
//   今日・カレンダー・TODOなど他の画面は期限後もそのまま使える。
// - 購入済みかどうかはローカルの proUnlocked フラグで判定する。実際の買い切りIAPは
//   services/iap.ts が担当し、購入・復元成功時に saveProUnlocked(true) を呼ぶ。
import { loadFirstLaunchAt, saveFirstLaunchAt, loadProUnlocked, saveProUnlocked } from '../data/storage';

export const TRIAL_DAYS = 60;
export const TRIAL_WARNING_DAYS_BEFORE = 7;

export type TrialStatus = {
  isPro: boolean;
  firstLaunchAt: string;
  daysElapsed: number;
  daysRemaining: number; // 0以下＝期限切れ（isProがfalseの場合）
  trialExpired: boolean;
  showWarning: boolean; // 残りTRIAL_WARNING_DAYS_BEFORE日以内、かつ未購入
};

/**
 * アプリ起動時に一度呼ぶ想定。初回起動日がまだ記録されていなければ「今」を記録する。
 * 記録済みならその値をそのまま返す（何度呼んでも安全）。
 */
export async function ensureFirstLaunchRecorded(): Promise<string> {
  const existing = await loadFirstLaunchAt();
  if (existing) return existing;
  const now = new Date().toISOString();
  await saveFirstLaunchAt(now);
  return now;
}

export async function getTrialStatus(): Promise<TrialStatus> {
  const [firstLaunchAt, isPro] = await Promise.all([ensureFirstLaunchRecorded(), loadProUnlocked()]);
  const elapsedMs = Date.now() - new Date(firstLaunchAt).getTime();
  const daysElapsed = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const daysRemaining = TRIAL_DAYS - daysElapsed;
  const trialExpired = !isPro && daysRemaining <= 0;
  const showWarning = !isPro && daysRemaining > 0 && daysRemaining <= TRIAL_WARNING_DAYS_BEFORE;
  return { isPro, firstLaunchAt, daysElapsed, daysRemaining, trialExpired, showWarning };
}

// ---- ここから下は動作確認（テスト）専用のヘルパー。 ----
// SettingsScreen 側で __DEV__ の時だけ表示するテストパネルから呼ばれる想定。

/** 購入済み/未購入の状態を強制的に切り替える。 */
export async function debugSetProUnlocked(value: boolean): Promise<void> {
  await saveProUnlocked(value);
}

/**
 * 「daysAgo日前に初回起動した」ことにして無料期間の起算日をずらす。
 * 例: debugSetFirstLaunchDaysAgo(65) → 60日の無料期間がすでに5日前に切れた状態を再現できる。
 * 例: debugSetFirstLaunchDaysAgo(0) → 「今日から60日間」の状態にリセットする。
 */
export async function debugSetFirstLaunchDaysAgo(daysAgo: number): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  await saveFirstLaunchAt(d.toISOString());
}
