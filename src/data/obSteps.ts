// koyomi_prototype_5.html の OB_STEPS をそのまま移植したステップ定義。
// UIロジック（Onboarding.tsx）とテキスト内容を分離してあるので、文言だけ直したい場合はここを編集する。

export type ObStepKind = 'intro' | 'photoPermission' | 'shortcutAdd' | 'timePicker' | 'batteryToggle' | 'done';

export type ObStep = {
  icon: string;
  title: string; // "<br>" を含む場合は改行として扱う
  desc: string;
  kind: ObStepKind;
};

export const OB_STEPS: Record<'ios' | 'android', ObStep[]> = {
  ios: [
    {
      icon: '◐',
      title: 'ロック画面と\n連携しませんか',
      desc: 'koyomiの指標を、毎日見るロック画面に自動で表示できます。iOSでは「ショートカット」アプリと連携して反映します。',
      kind: 'intro',
    },
    {
      icon: '▣',
      title: '専用アルバムへの\n保存を許可',
      desc: '生成した画像を「koyomi壁紙」という専用アルバムに保存します。他の写真にはアクセスしません。',
      kind: 'photoPermission',
    },
    {
      icon: '⇩',
      title: 'ショートカットを\n追加',
      desc: 'koyomiが用意した「koyomi壁紙を反映」ショートカットを、標準のショートカットアプリに1タップで追加します。',
      kind: 'shortcutAdd',
    },
    {
      icon: '⟳',
      title: '更新時刻を\n選択',
      desc: '毎日この時刻に、ロック画面の壁紙を自動で更新します。あとから変更もできます。',
      kind: 'timePicker',
    },
    {
      icon: '✓',
      title: '設定が\n完了しました',
      desc: '設定した時刻に、koyomiの指標がロック画面へ自動で反映されます。',
      kind: 'done',
    },
  ],
  android: [
    {
      icon: '◐',
      title: 'ロック画面と\n連携しませんか',
      desc: 'koyomiの指標を、毎日見るロック画面に自動で表示できます。Androidでは外部アプリの追加は不要で、koyomiが直接ロック画面を更新します。',
      kind: 'intro',
    },
    {
      icon: '⟳',
      title: '更新時刻を\n選択',
      desc: '毎日この時刻に、ロック画面の壁紙を自動で更新します。あとから変更もできます。',
      kind: 'timePicker',
    },
    {
      icon: '⚙',
      title: 'バッテリー最適化の\n除外（推奨）',
      desc: '端末の節電機能により、指定時刻の更新が遅れることがあります。安定して動かすには、koyomiを「最適化の対象外」に設定してください。',
      kind: 'batteryToggle',
    },
    {
      icon: '✓',
      title: '設定が\n完了しました',
      desc: '設定した時刻に、koyomiの指標がロック画面へ自動で反映されます。',
      kind: 'done',
    },
  ],
};
