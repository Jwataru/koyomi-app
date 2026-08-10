// ロック画面上のTODO表示ブロックに関する共通定数・計算ロジック。
// 「プレビュー画面での位置調整UI」と「wallpaperEngineでの実際の壁紙描画」の
// 両方から参照し、見た目がズレないようにする。
//
// 配置は個々のTODOごとではなく「TODOブロック全体」を1つの単位として動かす。
// アンカーはブロック上端（yPercentはブロック上端の位置で、下方向に伸びる）。
import { Platform } from 'react-native';

// 'serif'/'sans' はOSに標準搭載されている日本語フォントを直接指定する
// （expo-font等での追加読み込みが不要で、必ず反映される）。
// iOSは「ヒラギノ明朝／ヒラギノ角ゴシック」、Androidは汎用ファミリー名の
// serif/sans-serifを使う（機種のCJKフォントにフォールバックする）。
export type TodoFontFamily = 'default' | 'serif' | 'sans';

export const FONT_FAMILY_VALUE: Record<TodoFontFamily, string | undefined> = {
  default: undefined,
  serif: Platform.OS === 'ios' ? 'Hiragino Mincho ProN' : 'serif',
  sans: Platform.OS === 'ios' ? 'Hiragino Sans' : 'sans-serif',
};
export const FONT_FAMILY_ORDER: TodoFontFamily[] = ['default', 'serif', 'sans'];
export const FONT_FAMILY_LABEL: Record<TodoFontFamily, string> = {
  default: '標準',
  serif: '明朝',
  sans: 'ゴシック',
};

// 文字サイズは画面幅に対する比率（0-1）で自由に指定できる。pt固定ではなく相対値にすることで
// 機種ごとの画面幅の差を吸収する。上限・下限は可読性が崩れない範囲に制限する。
export const MIN_FONT_SIZE_RATIO = 0.022;
export const MAX_FONT_SIZE_RATIO = 0.075;
export const DEFAULT_FONT_SIZE_RATIO = 0.04;

// TODOブロックの表示位置・サイズ・見た目の希望値。x/yは共に0-100（%）で、
// ロック画面全体（写真の切り抜きと同じ考え方）に対する相対値。
export type TodoLockScreenLayout = {
  xPercent: number; // ブロック中心のx位置（0-100）
  yPercent: number; // ブロック上端のy位置（0-100）
  fontSizeRatio: number; // 文字サイズ（画面幅に対する比率。MIN〜MAXの範囲で自由に調整）
  fontFamily: TodoFontFamily;
  textColor: string; // 文字色（#RRGGBB）
  panelEnabled: boolean; // 背面に半透明パネルを敷くかどうか
  panelColor: string; // パネルの色（#RRGGBB、不透明度は別で持つ）
  panelOpacity: number; // パネルの不透明度（0-1）
};

export const DEFAULT_TODO_LAYOUT: TodoLockScreenLayout = {
  xPercent: 50,
  yPercent: 46,
  fontSizeRatio: DEFAULT_FONT_SIZE_RATIO,
  fontFamily: 'default',
  textColor: '#FFFFFF',
  panelEnabled: false,
  panelColor: '#000000',
  panelOpacity: 0.35,
};

// ロック画面のうち「OS側が使う領域」を避けるための安全エリア（%）。
// 上部：時計・日付。下部：懐中電灯/カメラアイコンとウィジェット領域。
// この範囲内でだけドラッグできるようにする。
export const SAFE_AREA_TOP_PERCENT = 20;
export const SAFE_AREA_BOTTOM_PERCENT = 82;

// 文字色・パネル色それぞれのプリセットスウォッチ。
export const TEXT_COLOR_PRESETS = ['#FFFFFF', '#F3EFE7', '#0F1319', '#E3B873', '#D9744F'];
export const PANEL_COLOR_PRESETS = ['#000000', '#0F1319', '#FFFFFF', '#171C24', '#E3B873'];

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
    ...layout,
    xPercent: Math.max(0, Math.min(100, layout.xPercent)),
    yPercent: Math.max(SAFE_AREA_TOP_PERCENT, Math.min(maxY, layout.yPercent)),
    fontSizeRatio: Math.max(MIN_FONT_SIZE_RATIO, Math.min(MAX_FONT_SIZE_RATIO, layout.fontSizeRatio)),
    panelOpacity: Math.max(0, Math.min(1, layout.panelOpacity)),
  };
}

// #RRGGBB + 0-1の不透明度 -> "rgba(r,g,b,a)"。不正な値は素通しにせず黒扱いにする。
export function hexToRgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  const clean = m ? m[1] : '000000';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${r},${g},${b},${a})`;
}

// プレビュー編集中、実データが0件だと動かす対象が無く分かりづらいため、
// プレビュー専用のダミーTODOを表示する（保存対象にはしない）。
export const DUMMY_PREVIEW_TODOS: { id: string; text: string; dueDate: string | null }[] = [
  { id: 'dummy-1', text: 'レシートを整理する', dueDate: null },
  { id: 'dummy-2', text: '母に電話する', dueDate: null },
  { id: 'dummy-3', text: '常備薬を買い足す', dueDate: null },
];
