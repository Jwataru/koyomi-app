import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Platform,
  ScrollView,
  Linking,
  ActivityIndicator,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { colors } from '../theme/theme';
import { loadOnboarding, saveOnboarding, OnboardingState } from '../data/storage';
import {
  regenerateAndApplyWallpaper,
  WALLPAPER_SHORTCUT_NAME,
  WALLPAPER_ALBUM_NAME,
} from '../services/wallpaperEngine';

// Shortcutsアプリで「共有」→「iCloudリンクをコピー」して取得したリンクをそのまま設定する。
// iCloudの共有リンクはHTMLページ（ユニバーサルリンク）であり、生の.shortcutファイルではないため
// shortcuts://import-shortcut?url=... でラップして渡すと「ファイルのフォーマットが正しくありません」になる。
// 直接開くと、OSがユニバーサルリンクとしてShortcutsアプリの「ショートカットを入手」画面へルーティングする。
// リリース時はShortcutsアプリで配信用コピーを更新→共有→リンクを取得し、この値を差し替える。
// .shortcutファイル自体の履歴・バックアップはGitHub（shortcuts/koyomi.shortcut）で別途管理する。
const SHORTCUT_ADD_URL = 'https://www.icloud.com/shortcuts/6199dd6a3078494f94ede0697ad2d01d';

// オートメーション作成手順のスクリーンショット。
// 実機のShortcutsアプリを操作しながら各ステップのスクショを撮り、
// src/assets/automation-guide/ 配下に同じファイル名で配置してください。
// （Apple純正UIのスクリーンショットのため、コード側では用意できません）
const AUTOMATION_GUIDE_STEPS = [
  {
    image: require('../assets/automation-guide/step-1.png'),
    text: 'ショートカットアプリを開き、「オートメーション」タブを選ぶ',
  },
  {
    image: require('../assets/automation-guide/step-2.png'),
    text: '「新規オートメーション」を選ぶ',
  },
  {
    image: require('../assets/automation-guide/step-3.png'),
    text: '「時刻」を選ぶ',
  },
    {
    image: require('../assets/automation-guide/step-4.png'),
    text: '「0:00」「毎日」「すぐに実行」を選び、「次へ」',
  },
  {
    image: require('../assets/automation-guide/step-5.png'),
    text: `「${WALLPAPER_SHORTCUT_NAME}」を選ぶ`,
  },
  {
    image: require('../assets/automation-guide/step-6.png'),
    text: `オートメーション一覧に「${WALLPAPER_SHORTCUT_NAME}」を確認できたら完了`,
  },
];

type Platform_ = 'ios' | 'android';

type Step = {
  icon: string;
  title: string;
  desc: string;
};

// koyomi_prototype_5.html の OB_STEPS をそのまま移植したコンテンツ。
// iOS はショートカット経由、Android は直接APIで反映という説明の違いを踏襲している。
const OB_STEPS: Record<Platform_, Step[]> = {
  ios: [
    {
      icon: '▣',
      title: '写真への保存を許可',
      desc: `koyomiが生成した壁紙画像は「${WALLPAPER_ALBUM_NAME}」という専用アルバムに保存されます。このアルバムはまだ作られておらず、実際に作られるのは最初に壁紙を保存したタイミングです。まずは写真への操作を許可してください。`,
    },
    {
      icon: '⇩',
      title: 'ショートカットを追加',
      desc: `koyomiが用意した「${WALLPAPER_SHORTCUT_NAME}」ショートカットを、下のボタンからショートカットアプリに追加してください。`,
    },
    {
      icon: '⚑',
      title: 'オートメーションを作成',
      desc:
        '毎日自動で切り替わるようにするには、最初に一度だけにショートカットアプリ側で「オートメーション」を作成する必要があります。下の手順どおりに設定してください。',
    },
    {
      icon: '✓',
      title: '設定が完了しました',
      desc: 'オートメーションが正しく作成できていれば、設定した時刻にkoyomiの指標がロック画面へ自動で反映されます。',
    },
  ],
  android: [
    {
      icon: '◐',
      title: 'ロック画面と連携しませんか',
      desc: 'koyomiの指標を、毎日見るロック画面に自動で表示できます。Androidでは外部アプリの追加は不要で、koyomiが直接ロック画面を更新します。',
    },
    {
      icon: '⚙',
      title: 'バッテリー最適化の除外（推奨）',
      desc: '端末の節電機能により、指定時刻の更新が遅れることがあります。安定して動かすには、koyomiを「最適化の対象外」に設定してください。',
    },
    {
      icon: '✓',
      title: '設定が完了しました',
      desc: '設定した時刻に、koyomiの指標がロック画面へ自動で反映されます。',
    },
  ],
};

function detectPlatform(): Platform_ {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const [platform, setPlatform] = useState<Platform_>(detectPlatform());
  const [step, setStep] = useState(0);
  const [batteryExempt, setBatteryExempt] = useState(true);
  const [applyingNow, setApplyingNow] = useState(false);
  const [photoPermStatus, setPhotoPermStatus] = useState<
    'unknown' | 'granted' | 'limited' | 'denied'
  >('unknown');
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [guidePage, setGuidePage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  useEffect(() => {
    (async () => {
      const ob = await loadOnboarding();
      if (ob.platform) setPlatform(ob.platform);
    })();
  }, []);

  const steps = OB_STEPS[platform];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  async function handleNext() {
    if (isLast) {
      const state: OnboardingState = { platform, done: true };
      await saveOnboarding(state);
      onDone?.();
    } else {
      setStep(step + 1);
    }
  }

  const showBatteryToggle = platform === 'android' && step === 1;
  const showPhotoPermission = platform === 'ios' && step === 0;
  const showAddShortcut = platform === 'ios' && step === 1;
  const showAutomationGuide = platform === 'ios' && step === 2;
  const showConfirmButton = platform === 'ios' && isLast;

  async function handleApplyNow() {
    if (applyingNow) return;
    setApplyingNow(true);
    try {
      await regenerateAndApplyWallpaper();
    } finally {
      setApplyingNow(false);
    }
  }

  async function handleRequestPhotoPermission() {
    if (requestingPerm) return;
    setRequestingPerm(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setPhotoPermStatus('denied');
      } else if (perm.accessPrivileges === 'limited') {
        setPhotoPermStatus('limited');
      } else {
        setPhotoPermStatus('granted');
      }
    } finally {
      setRequestingPerm(false);
    }
  }

  async function handleAddShortcut() {
    try {
      // iCloudの共有リンクはユニバーサルリンクなので、そのまま開けばOSが
      // Shortcutsアプリの「ショートカットを入手」画面へルーティングしてくれる。
      // import-shortcut/import-workflowでラップすると生の.shortcutファイルが
      // 期待されてしまい、HTMLページであるiCloudリンクでは失敗するため使わない。
      await Linking.openURL(SHORTCUT_ADD_URL);
    } catch {
      // 開けない場合はショートカットアプリ自体を開く
      Linking.openURL('shortcuts://').catch(() => {});
    }
  }

  function handleGuideScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!carouselWidth) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
    if (page !== guidePage) setGuidePage(page);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.platformSwitch}>
          {(['ios', 'android'] as Platform_[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.platBtn, platform === p && styles.platBtnActive]}
              onPress={() => {
                setPlatform(p);
                setStep(0);
              }}
            >
              <Text style={[styles.platBtnText, platform === p && styles.platBtnTextActive]}>
                {p === 'ios' ? 'iOS' : 'Android'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stepIcon}>
          <Text style={styles.stepIconText}>{current.icon}</Text>
        </View>
        <Text style={styles.stepTitle}>{current.title}</Text>
        <Text style={styles.stepDesc}>{current.desc}</Text>

        {showPhotoPermission && (
          <Pressable
            style={[styles.card, styles.confirmCard]}
            onPress={handleRequestPhotoPermission}
            disabled={requestingPerm || photoPermStatus === 'granted'}
          >
            {requestingPerm ? (
              <ActivityIndicator color={colors.l1} size="small" />
            ) : (
              <Text style={styles.cardLabel}>
                {photoPermStatus === 'granted'
                  ? '許可済みです'
                  : photoPermStatus === 'limited'
                  ? '一部の写真のみ許可されています（設定アプリから「すべての写真」に変更できます）'
                  : photoPermStatus === 'denied'
                  ? '許可されませんでした（設定アプリから変更できます）'
                  : '写真へのアクセスを許可する'}
              </Text>
            )}
          </Pressable>
        )}

        {showAddShortcut && (
          <Pressable style={[styles.card, styles.confirmCard]} onPress={handleAddShortcut}>
            <Text style={styles.cardLabel}>{`「${WALLPAPER_SHORTCUT_NAME}」を追加する`}</Text>
          </Pressable>
        )}

        {showBatteryToggle && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>最適化の対象外にする</Text>
            <Pressable
              style={[styles.toggle, batteryExempt && styles.toggleOn]}
              onPress={() => setBatteryExempt(!batteryExempt)}
            >
              <View style={[styles.toggleDot, batteryExempt && styles.toggleDotOn]} />
            </Pressable>
          </View>
        )}

        {showAutomationGuide && (
          <View style={styles.guideCard}>
            <View
              style={styles.guideCarousel}
              onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}
            >
              {carouselWidth > 0 && (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={carouselWidth}
                  snapToAlignment="start"
                  disableIntervalMomentum
                  onMomentumScrollEnd={handleGuideScroll}
                >
                  {AUTOMATION_GUIDE_STEPS.map((s, i) => (
                    <View key={i} style={[styles.guideSlide, { width: carouselWidth }]}>
                      <View style={styles.guideStepBadge}>
                        <Text style={styles.guideStepBadgeText}>STEP {i + 1}</Text>
                      </View>
                      <View style={styles.guideImageFrame}>
                        <Image source={s.image} style={styles.guideImage} resizeMode="cover" />
                      </View>
                      <Text style={styles.guideText}>{s.text}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            <View style={styles.guideDots}>
              {AUTOMATION_GUIDE_STEPS.map((_, i) => (
                <View key={i} style={[styles.guideDot, i === guidePage && styles.guideDotOn]} />
              ))}
            </View>
            <Pressable
              style={styles.ghostBtn}
              onPress={() => Linking.openURL('shortcuts://').catch(() => {})}
            >
              <Text style={styles.ghostBtnText}>ショートカットアプリを開く</Text>
            </Pressable>
          </View>
        )}

        {showConfirmButton && (
          <Pressable
            style={[styles.card, styles.confirmCard]}
            onPress={handleApplyNow}
            disabled={applyingNow}
          >
            {applyingNow ? (
              <ActivityIndicator color={colors.l1} size="small" />
            ) : (
              <Text style={styles.cardLabel}>今すぐ反映して確認する</Text>
            )}
          </Pressable>
        )}

        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>

        <View style={styles.nav}>
          {step > 0 && (
            <Pressable style={styles.ghostBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.ghostBtnText}>戻る</Text>
            </Pressable>
          )}
          <Pressable style={styles.primaryBtn} onPress={handleNext}>
            <Text style={styles.primaryBtnText}>{isLast ? '完了' : '次へ'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  content: { padding: 24, alignItems: 'center' },
  platformSwitch: { flexDirection: 'row', gap: 6, marginBottom: 24, width: '100%' },
  platBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
  },
  platBtnActive: { backgroundColor: colors.l1Soft, borderColor: colors.l1 },
  platBtnText: { color: colors.inkMuted, fontSize: 12 },
  platBtnTextActive: { color: colors.l1 },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.l1Soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepIconText: { color: colors.l1, fontSize: 22 },
  stepTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  stepDesc: { color: colors.inkMuted, fontSize: 13, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  card: {
    width: '100%',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: { color: colors.ink, fontSize: 12 },
  confirmCard: { justifyContent: 'center', alignItems: 'center' },
  guideCard: {
    width: '100%',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  guideCarousel: { width: '100%' },
  guideSlide: { paddingHorizontal: 4 },
  guideStepBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(120, 200, 160, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  guideStepBadgeText: { color: colors.l1, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  guideImageFrame: {
    width: '74%',
    alignSelf: 'center',
    aspectRatio: 9 / 19.5,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: '#12161C',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    marginBottom: 10,
  },
  guideImage: { width: '100%', height: '100%' },
  guideDots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 2 },
  guideDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.hairline },
  guideDotOn: { backgroundColor: colors.l1 },
  guideText: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  toggle: { width: 34, height: 20, borderRadius: 10, backgroundColor: colors.hairline, padding: 2 },
  toggleOn: { backgroundColor: colors.l1 },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#12161C' },
  toggleDotOn: { marginLeft: 14 },
  dots: { flexDirection: 'row', gap: 5, marginVertical: 16 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.hairline },
  dotOn: { backgroundColor: colors.l1 },
  nav: { flexDirection: 'row', gap: 8, width: '100%' },
  ghostBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
  },
  ghostBtnText: { color: colors.inkMuted, fontSize: 13 },
  primaryBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.l1, alignItems: 'center' },
  primaryBtnText: { color: '#12161C', fontSize: 13, fontWeight: '700' },
});
