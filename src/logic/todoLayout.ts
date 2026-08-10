// ロック画面上のTODO表示ブロックに関する共通定数・計算ロジック。
// 「プレビュー画面での位置調整UI」と「wallpaperEngineでの実際の壁紙描画」の
// 両方から参照し、見た目がズレないようにする。
//
// 配置は個々のTODOごとではなく「TODOブロック全体」を1つの単位として動かす。
// アンカーはブロック上端（yPercentはブロック上端の位置で、下方向に伸びる）。

export type TodoFontScale = 'small' | 'medium' | 'large';

// TODOブロックの表示位置・サイズの希望値。x/yは共に0-100（%）で、
// ロック画面全体（写真の切り抜きと同じ考え方）に対する相対値。
export type TodoLockScreenLayout = {
  xPercent: number; // ブロック中心のx位置（0-100）
  yPercent: number; // ブロック上端のy位置（0-100）
  fontScale: TodoFontScale;
};

export const DEFAULT_TODO_LAYOUT: TodoLockScreenLayout = {
  xPercent: 50,
  yPercent: 46,
  fontScale: 'medium',
};

// ロック画面のうち「OS側が使う領域」を避けるための安全エリア（%）。
// 上部：時計・日付。下部：懐中電灯/カメラアイコンとウィジェット領域。
// この範囲内でだけドラッグできるようにする。
export const SAFE_AREA_TOP_PERCENT = 20;
export const SAFE_AREA_BOTTOM_PERCENT = 82;

// 文字サイズプリセット（画面幅に対する比率）。pt固定ではなく相対値にすることで
// 機種ごとの画面幅の差を吸収する。
export const FONT_SCALE_RATIO: Record<TodoFontScale, number> = {
  small: 0.032,
  medium: 0.04,
  large: 0.05,
};

export const FONT_SCALE_ORDER: TodoFontScale[] = ['small', 'medium', 'large'];
export const FONT_SCALE_LABEL: Record<TodoFontScale, string> = {
  small: '小',
  medium: '中',
  large: '大',
};

// 表示しきれない分を省略するための最大高さ（行数換算）。
// 件数ではなく行数（折り返し込み）で区切ることで、長文TODOが混ざっても崩れにくくする。
// 幸いTODOは締め切りが近い順に並んでいるため、あふれた分は自動的に締め切りが遠いものから
// 弾かれる形になる。
export const MAX_TODO_LINES = 6;

// ブロックの左右幅（画面幅に対する比率）。あまり広げすぎると誤タップ領域と被るため固定気味に。
export const TODO_BLOCK_WIDTH_RATIO = 0.78;

export function clampTodoLayout(
  layout: TodoLockScreenLayout,
  // ブロックの実測高さ（画面全体に対する%）。渡した場合、下端が安全エリアからはみ出さないよう
  // 上限をさらに引き下げる（アンカーが上端固定のため）。
  blockHeightPercent = 0
): TodoLockScreenLayout {
  const maxY = Math.max(SAFE_AREA_TOP_PERCENT, SAFE_AREA_BOTTOM_PERCENT - blockHeightPercent);
  return {
    xPercent: Math.max(0, Math.min(100, layout.xPercent)),
    yPercent: Math.max(SAFE_AREA_TOP_PERCENT, Math.min(maxY, layout.yPercent)),
    fontScale: layout.fontScale,
  };
}

// プレビュー編集中、実データが0件だと動かす対象が無く分かりづらいため、
// プレビュー専用のダミーTODOを表示する（保存対象にはしない）。
export const DUMMY_PREVIEW_TODOS: { id: string; text: string; dueDate: string | null }[] = [
  { id: 'dummy-1', text: 'レシートを整理する', dueDate: null },
  { id: 'dummy-2', text: '母に電話する', dueDate: null },
  { id: 'dummy-3', text: '常備薬を買い足す', dueDate: null },
];
