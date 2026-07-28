import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, daysUntilNextPeriod, toDate } from '../logic/cycle';
import { loadCycleSettings, loadPhotoMeta, CycleSettings, PhotoMetaMap } from '../data/storage';
import LevelIcon from '../components/LevelIcon';
import PositionedImage from '../components/PositionedImage';

export default function TodayScreen() {
  const [cycle, setCycle] = useState<CycleSettings | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PhotoMetaMap | null>(null);

  const reload = useCallback(async () => {
    const [c, p] = await Promise.all([loadCycleSettings(), loadPhotoMeta()]);
    setCycle(c);
    setPhotoMeta(p);
  }, []);

  // 設定画面で値を変えて戻ってきたときに再読み込みする
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (!cycle || !cycle.nextPeriodDate) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            まだ周期が設定されていません。{'\n'}
            「設定」タブから次の生理予定日を入力してください。
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const today = new Date();
  const nextPeriod = toDate(cycle.nextPeriodDate);
  const level: LevelKey = calcLevel(today, nextPeriod, cycle.cycleLen);
  const remaining = daysUntilNextPeriod(today, nextPeriod, cycle.cycleLen);
  const info = LEVELS[level];
  const photo = photoMeta?.[level];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>今日のステータス</Text>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: info.soft }]}>
            {photo?.uri ? (
              <PositionedImage uri={photo.uri} x={photo.x} y={photo.y} />
            ) : (
              <LevelIcon level={level} color={info.hex} size={92} />
            )}
          </View>
          <Text style={[styles.levelText, { color: info.hex }]}>
            レベル{level}・{info.name}
          </Text>
          <Text style={styles.subText}>
            {remaining <= 0 ? '本日が生理予定日です' : `次の予定日まで ${remaining} 日`}
          </Text>
          <View style={[styles.adviceBox, { borderLeftColor: info.hex }]}>
            <Text style={styles.adviceText}>
              <Text style={{ color: info.hex, fontWeight: '700' }}>アドバイス：</Text>
              {info.advice}
            </Text>
          </View>
        </View>

        <View style={styles.legend}>
          {(Object.keys(LEVELS) as unknown as LevelKey[]).map((lvl) => (
            <View key={lvl} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: LEVELS[lvl].hex }]} />
              <Text style={styles.legendText}>
                レベル{lvl} {LEVELS[lvl].name}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  // flexGrow:1 + justifyContent:'center' でコンテンツ全体を画面の縦中央に配置。
  // 画面が小さい/コンテンツが多い場合はスクロールもできるようにしておく。
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.inkMuted, textAlign: 'center', lineHeight: 22 },
  heading: {
    color: colors.ink,
    fontSize: 15,
    letterSpacing: 1,
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 20,
  },
  levelText: { fontSize: 26, marginBottom: 8, fontWeight: '600', textAlign: 'center' },
  subText: { color: colors.inkMuted, fontSize: 14, marginBottom: 20, textAlign: 'center' },
  adviceBox: {
    backgroundColor: colors.bgPanel2,
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 16,
    width: '100%',
  },
  adviceText: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24, justifyContent: 'center' },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgPanel2,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.inkMuted, fontSize: 11 },
});
