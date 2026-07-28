import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, toDate } from '../logic/cycle';
import { loadCycleSettings, loadPhotoMeta, CycleSettings, PhotoMetaMap } from '../data/storage';
import LevelIcon from '../components/LevelIcon';
import PositionedImage from '../components/PositionedImage';

const LEVEL_LIST: LevelKey[] = [1, 2, 3, 4];

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

  const reload = useCallback(async () => {
    setCycle(await loadCycleSettings());
    setPhotoMeta(await loadPhotoMeta());
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
      <Text style={styles.lockTime}>{formatTime(now)}</Text>
      <Text style={styles.lockDate}>{formatDate(now)}</Text>
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <View style={styles.phoneShell}>
          <View style={styles.phoneScreen}>
            {photo?.uri ? (
              <View style={StyleSheet.absoluteFill}>
                <PositionedImage uri={photo.uri} x={photo.x} y={photo.y} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  wrap: { flex: 1, alignItems: 'center', paddingTop: 24 },
  phoneShell: {
    width: 260,
    height: 540,
    borderRadius: 40,
    padding: 12,
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
  lockContent: { flex: 1, alignItems: 'center', paddingTop: 48, paddingBottom: 20, paddingHorizontal: 16 },
  lockTime: { color: '#fff', fontSize: 42, fontWeight: '600' },
  lockDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
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
});
