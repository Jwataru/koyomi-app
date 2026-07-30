// koyomi_prototype_5.html 内の calcLevel / isPeriodDay / dayDiff ロジックを
// そのまま忠実に移植したもの。ここは数値計算だけなので UI フレームワークに依存せず、
// 単体テストがそのまま書ける形にしてある。

import { LevelKey } from '../theme/theme';

/** "YYYY-MM-DD" 文字列を Date に変換（プロトタイプの toDate と同じ） */
export function toDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 時刻部分を切り捨て、その日の午前0時にした Date を返す */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 2つの日付の日数差（プロトタイプの dayDiff と同じ）。
 * 呼び出し側が「現在時刻を含む Date」（new Date() など）を渡しても、
 * 時刻部分によって差が四捨五入でズレて日付を1日取り違えることがないよう、
 * 比較前に必ず両方とも午前0時に正規化する。
 */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 対象日のレベル(1〜4)を計算する。
 * プロトタイプの calcLevel をそのまま移植：
 *  - 生理期間中（mod <= 4）は常にレベル1
 *  - 次の生理まで3日以内 → レベル4（地雷期）
 *  - 次の生理まで7日以内 → レベル3（警戒期）
 *  - 次の生理まで12日以内 → レベル2（注意期）
 *  - それ以外 → レベル1（安全期）
 */
export function calcLevel(target: Date, nextPeriod: Date, cycleLen: number): LevelKey {
  const diff = dayDiff(target, nextPeriod);
  let mod = diff % cycleLen;
  if (mod < 0) mod += cycleLen;
  if (mod <= 4) return 1;
  const daysUntilNext = cycleLen - mod;
  if (daysUntilNext <= 3) return 4;
  if (daysUntilNext <= 7) return 3;
  if (daysUntilNext <= 12) return 2;
  return 1;
}

/** 対象日が生理期間中かどうか（プロトタイプの isPeriodDay と同じ） */
export function isPeriodDay(target: Date, nextPeriod: Date, cycleLen: number): boolean {
  const diff = dayDiff(target, nextPeriod);
  let mod = diff % cycleLen;
  if (mod < 0) mod += cycleLen;
  return mod <= 4;
}

/** 次の生理予定日までの残り日数（ステータス表示用のヘルパー。プロトタイプのUI組み立て部分から切り出した） */
export function daysUntilNextPeriod(target: Date, nextPeriod: Date, cycleLen: number): number {
  const diff = dayDiff(target, nextPeriod);
  let mod = diff % cycleLen;
  if (mod < 0) mod += cycleLen;
  return cycleLen - mod;
}
