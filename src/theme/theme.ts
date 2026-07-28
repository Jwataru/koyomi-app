// koyomi_prototype_5.html の :root { ... } をそのまま移植したデザイントークン。
// フォントは Zen Old Mincho / Zen Kaku Gothic New を使うため、
// expo-font 等で読み込む場合はこの名前をそのまま参照する。

export const colors = {
  bgDeep: '#0F1319',
  bgPanel: '#171C24',
  bgPanel2: '#1D232D',
  ink: '#F3EFE7',
  inkMuted: '#8F98A6',
  hairline: 'rgba(243,239,231,0.08)',

  l1: '#7FBFA0', // レベル1 安全期
  l1Soft: '#263B31',
  l2: '#E3B873', // レベル2 注意期
  l2Soft: '#362D1E',
  l3: '#D9744F', // レベル3 警戒期
  l3Soft: '#38251C',
  l4: '#E0596B', // レベル4 地雷期
  l4Soft: '#3B1E24',
} as const;

export type LevelKey = 1 | 2 | 3 | 4;

export const LEVELS: Record<
  LevelKey,
  { key: LevelKey; name: string; hex: string; soft: string; advice: string }
> = {
  1: { key: 1, name: '安全期', hex: colors.l1, soft: colors.l1Soft, advice: '通常運転でOK。特別なことは不要です。' },
  2: { key: 2, name: '注意期', hex: colors.l2, soft: colors.l2Soft, advice: '少し家事を先回りして巻き取っておくと◎。' },
  3: { key: 3, name: '警戒期', hex: colors.l3, soft: colors.l3Soft, advice: '甘いものや温かい飲み物を用意しておくと喜ばれるかも。' },
  4: { key: 4, name: '地雷期', hex: colors.l4, soft: colors.l4Soft, advice: '家事は全部先回りで済ませ、好物のお土産を用意しよう。' },
};

export const fonts = {
  serif: 'ZenOldMincho_500Medium', // 見出し用
  sans: 'ZenKakuGothicNew_400Regular', // 本文用
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 20,
};
