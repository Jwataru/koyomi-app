import React, { useCallback, useState } from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView, Pressable, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, toDate } from '../logic/cycle';
import { loadCycleSettings, loadPhotoMeta, CycleSettings, PhotoMetaMap } from '../data/storage';
import { getTrialStatus, TrialStatus } from '../logic/trial';
import LevelIcon from '../components/LevelIcon';

const LEVEL_LIST: LevelKey[] = [1, 2, 3, 4];

// 実際の壁紙生成キャンバス（wallpaperEngine）や設定画面のプレビュー枠と縦横比を揃えるため、
// 実機の画面サイズから逆算してモックのサイズを決める（固定の 260x540 だと機種によって
// 縦横比がズレて、見切れ方が設定画面と食い違ってしまうため）。
const { width: DEVICE_W, height: DEVICE_H } = Dimensions.get('window');
const PHONE_SHELL_WIDTH = 260;
const PHONE_PADDING = 12;
const PHONE_SCREEN_WIDTH = PHONE_SHELL_WIDTH - PHONE_PADDING * 2;
const PHONE_SCREEN_HEIGHT = PHONE_SCREEN_WIDTH * (DEVICE_H / DEVICE_W);
const PHONE_SHELL_HEIGHT = PHONE_SCREEN_HEIGHT + PHONE_PADDING * 2;

function formatTime(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function formatDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}

export default function PreviewScreen() {
  const [cycle, setCycle] = useState<CycleSettings | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PhotoMetaMap | null>(null);
  const [overrideLevel, setOverrideLevel] = useState<LevelKey | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);

  const reload = useCallback(async () => {
    setCycle(await loadCycleSettings());
    setPhotoMeta(await loadPhotoMeta());
    setTrialStatus(await getTrialStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const autoLevel: LevelKey =
    cycle?.nextPeriodDate ? calcLevel(new Date(), toDate(cycle.nextPeriodDate), cycle.cycleLen) : 1;
  const level = overrideLevel ?? autoLevel;
  const info = LEVELS[level];
  const photo = photoMeta?.[level];
  const now = new Date();

  const content = (
    <View style={styles.lockContent}>
      <Text style={styles.lockDate}>{formatDate(now)}</Text>
      <Text style={styles.lockTime}>{formatTime(now)}</Text>
      {!photo?.uri && (
        <View style={styles.fallbackIcon}>
          <LevelIcon level={level} color="#fff" size={64} />
        </View>
      )}
      <View style={styles.lockBottom}>
        <View style={styles.iconBtn} />
        <View style={styles.iconBtn} />
      </View>
    </View>
  );

  const locked = !!trialStatus?.trialExpired;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        {locked && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>
              🔒 無料期間終了のためロック画面には反映されません
            </Text>
            <Text style={styles.lockedBannerSub}>
              ここでの見た目確認は引き続き行えますが、実際のロック画面への保存・自動切り替えは停止中です。
            </Text>
          </View>
        )}

        <View style={[styles.previewInner, locked && styles.dimmed]} pointerEvents={locked ? 'none' : 'auto'}>
          <View style={styles.phoneShell}>
            <View style={styles.phoneScreen}>
              {photo?.uri ? (
                <View style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: photo.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                  <View style={StyleSheet.absoluteFill}>{content}</View>
                </View>
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: info.soft }]}>
                  {content}
                </View>
              )}
              <View style={styles.notch} />
            </View>
          </View>

          <Text style={styles.caption}>
            現在のレベル：<Text style={{ color: info.hex }}>レベル{level}・{info.name}</Text>
            {overrideLevel === null ? '（本日の自動判定）' : '（プレビュー中）'}
          </Text>

          <View style={styles.switcher}>
            <Pressable
              style={[styles.switchBtn, overrideLevel === null && styles.switchBtnActive]}
              onPress={() => setOverrideLevel(null)}
            >
              <Text style={[styles.switchText, overrideLevel === null && styles.switchTextActive]}>
                自動（本日）
              </Text>
            </Pressable>
            {LEVEL_LIST.map((lvl) => (
              <Pressable
                key={lvl}
                style={[styles.switchBtn, overrideLevel === lvl && styles.switchBtnActive]}
                onPress={() => setOverrideLevel(lvl)}
              >
                <Text style={[styles.switchText, overrideLevel === lvl && styles.switchTextActive]}>
                  Lv{lvl}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.saveHint}>
          見た目の確認用画面です。写真の変更・更新は「設定」タブの各レベルにある「使用する写真を更新」から行えます。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  wrap: { flex: 1, alignItems: 'center', paddingTop: 24 },
  lockedBanner: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.l4Soft,
    borderWidth: 1,
    borderColor: colors.l4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  lockedBannerText: { color: colors.l4, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  lockedBannerSub: { color: colors.inkMuted, fontSize: 11, marginTop: 4, textAlign: 'center', lineHeight: 16 },
  previewInner: { alignItems: 'center' },
  dimmed: { opacity: 0.35 },
  phoneShell: {
    width: PHONE_SHELL_WIDTH,
    height: PHONE_SHELL_HEIGHT,
    borderRadius: 40,
    padding: PHONE_PADDING,
    backgroundColor: '#14181f',
  },
  phoneScreen: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  notch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 18,
    backgroundColor: '#0c0f14',
    borderRadius: 12,
  },
  lockContent: { flex: 1, alignItems: 'center', paddingTop: 46, paddingBottom: 20, paddingHorizontal: 16 },
  lockTime: { color: '#fff', fontSize: 62, fontWeight: '600', letterSpacing: -1.5, marginTop: 4 },
  lockDate: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '500' },
  fallbackIcon: {
    marginTop: 20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBottom: { marginTop: 'auto', width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)' },
  caption: { color: colors.inkMuted, fontSize: 12, marginTop: 16, textAlign: 'center' },
  switcher: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 20 },
  switchBtn: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bgPanel,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  switchBtnActive: { borderColor: colors.l1 },
  switchText: { color: colors.inkMuted, fontSize: 11 },
  switchTextActive: { color: colors.l1 },
  saveHint: {
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
