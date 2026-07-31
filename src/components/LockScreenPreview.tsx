import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import LevelIcon from './LevelIcon';
import { PhotoMeta } from '../data/storage';

/**
 * koyomi_prototype_5.html の .phone-shell / .lock-content を移植した
 * ロック画面モックアップ。実際の端末ロック画面ではなく「見た目の確認用プレビュー」。
 */
export default function LockScreenPreview({
  level,
  photo,
}: {
  level: LevelKey;
  photo?: PhotoMeta | null;
}) {
  const info = LEVELS[level];
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const content = (
    <View style={styles.lockContent}>
      <View style={styles.notch} />
      <Text style={styles.date}>{dateStr}</Text>
      <Text style={styles.time}>
        {hh}:{mm}
      </Text>
      {!photo?.uri && (
        <View style={[styles.fallbackIcon, { backgroundColor: 'rgba(0,0,0,0.22)' }]}>
          <LevelIcon level={level} color="#fff" size={64} />
        </View>
      )}
      <View style={styles.bottomRow}>
        <View style={styles.iconBtn} />
        <View style={styles.iconBtn} />
      </View>
    </View>
  );

  return (
    <View style={styles.phoneShell}>
      <View style={styles.phoneScreen}>
        {photo?.uri ? (
          <View style={StyleSheet.absoluteFillObject}>
            <Image source={{ uri: photo.uri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
            <View style={StyleSheet.absoluteFillObject}>{content}</View>
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: info.soft }]}>
            {content}
          </View>
        )}
      </View>
      <Text style={styles.caption}>
        レベル{level}・{info.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneShell: {
    width: 220,
    alignSelf: 'center',
  },
  phoneScreen: {
    width: 220,
    height: 460,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#14181f',
  },
  notch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 70,
    height: 16,
    borderRadius: 10,
    backgroundColor: '#0c0f14',
    zIndex: 5,
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  date: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '500' },
  time: { color: '#fff', fontSize: 52, fontWeight: '600', letterSpacing: -1, marginTop: 2 },
  fallbackIcon: {
    marginTop: 16,
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    marginTop: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  caption: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 10,
  },
});
