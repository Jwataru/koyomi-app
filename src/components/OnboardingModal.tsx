import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/theme';
import { OB_STEPS } from '../data/obSteps';
import { OnboardingState, saveOnboarding } from '../data/storage';

type Props = {
  visible: boolean;
  initial: OnboardingState;
  onClose: () => void;
  onDone: (state: OnboardingState) => void;
};

function timeStrToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 7, m || 0, 0, 0);
  return d;
}
function dateToTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OnboardingModal({ visible, initial, onClose, onDone }: Props) {
  const [platform, setPlatform] = useState<'ios' | 'android'>(initial.platform ?? 'ios');
  const [step, setStep] = useState(0);
  const [time, setTime] = useState(initial.time || '07:00');
  const [batteryOn, setBatteryOn] = useState(true);

  const steps = OB_STEPS[platform];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  function switchPlatform(p: 'ios' | 'android') {
    setPlatform(p);
    setStep(0);
  }

  async function handleNext() {
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    const finalState: OnboardingState = { platform, time, done: true };
    await saveOnboarding(finalState);
    onDone(finalState);
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>

          <View style={styles.platformSwitch}>
            <Pressable
              style={[styles.platBtn, platform === 'ios' && styles.platBtnActive]}
              onPress={() => switchPlatform('ios')}
            >
              <Text style={[styles.platText, platform === 'ios' && styles.platTextActive]}>
                iOS
              </Text>
            </Pressable>
            <Pressable
              style={[styles.platBtn, platform === 'android' && styles.platBtnActive]}
              onPress={() => switchPlatform('android')}
            >
              <Text style={[styles.platText, platform === 'android' && styles.platTextActive]}>
                Android
              </Text>
            </Pressable>
          </View>

          <View style={styles.stepIcon}>
            <Text style={styles.stepIconText}>{current.icon}</Text>
          </View>
          <Text style={styles.stepTitle}>{current.title}</Text>
          <Text style={styles.stepDesc}>{current.desc}</Text>

          {current.kind === 'photoPermission' && (
            <View style={styles.card}>
              <View style={styles.cardThumb} />
              <View>
                <Text style={styles.cardName}>koyomi壁紙</Text>
                <Text style={styles.cardSub}>このアプリ専用のアルバム</Text>
              </View>
            </View>
          )}

          {current.kind === 'shortcutAdd' && (
            <View style={styles.card}>
              <View style={styles.cardThumb} />
              <View>
                <Text style={styles.cardName}>koyomi壁紙を反映</Text>
                <Text style={styles.cardSub}>ショートカット・未追加</Text>
              </View>
            </View>
          )}

          {current.kind === 'timePicker' && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>自動更新する時刻</Text>
              <DateTimePicker
                value={timeStrToDate(time)}
                mode="time"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={(_, d) => {
                  if (d) setTime(dateToTimeStr(d));
                }}
              />
            </View>
          )}

          {current.kind === 'batteryToggle' && (
            <Pressable style={styles.toggleRow} onPress={() => setBatteryOn(!batteryOn)}>
              <Text style={styles.timeLabel}>最適化の対象外にする</Text>
              <View style={[styles.switchTrack, batteryOn && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, batteryOn && styles.switchThumbOn]} />
              </View>
            </Pressable>
          )}

          {current.kind === 'done' && (
            <View style={styles.card}>
              <View style={styles.cardThumb} />
              <View>
                <Text style={styles.cardName}>
                  {platform === 'ios' ? 'koyomi壁紙を反映' : 'ロック画面の自動更新'}
                </Text>
                <Text style={styles.cardSub}>連携済み・毎日{time}</Text>
              </View>
            </View>
          )}

          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>

          <View style={styles.nav}>
            {step > 0 && (
              <Pressable style={styles.ghostBtn} onPress={handlePrev}>
                <Text style={styles.ghostBtnText}>戻る</Text>
              </Pressable>
            )}
            <Pressable style={styles.primaryBtn} onPress={handleNext}>
              <Text style={styles.primaryBtnText}>{isLast ? '完了' : '次へ'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(8,10,14,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 360, backgroundColor: colors.bgPanel2, borderRadius: 20, padding: 22 },
  closeBtn: { position: 'absolute', top: 12, right: 14, zIndex: 2 },
  closeText: { color: colors.inkMuted, fontSize: 22 },
  platformSwitch: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  platBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  platBtnActive: { backgroundColor: colors.l1Soft, borderColor: colors.l1 },
  platText: { color: colors.inkMuted, fontSize: 11 },
  platTextActive: { color: colors.l1 },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.l1Soft,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stepIconText: { fontSize: 19, color: colors.l1 },
  stepTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  stepDesc: { color: colors.inkMuted, fontSize: 12, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  cardThumb: { width: 32, height: 32, borderRadius: 7, backgroundColor: colors.l1Soft },
  cardName: { color: colors.ink, fontSize: 12 },
  cardSub: { color: colors.inkMuted, fontSize: 10.5 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgPanel,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  timeLabel: { color: colors.ink, fontSize: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgPanel,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  switchTrack: { width: 30, height: 18, borderRadius: 9, backgroundColor: colors.hairline, padding: 2 },
  switchTrackOn: { backgroundColor: colors.l1 },
  switchThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#12161C' },
  switchThumbOn: { marginLeft: 12 },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginVertical: 12 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.hairline },
  dotOn: { backgroundColor: colors.l1 },
  nav: { flexDirection: 'row', gap: 8, marginTop: 4 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingVertical: 9,
    alignItems: 'center',
  },
  ghostBtnText: { color: colors.inkMuted, fontSize: 12 },
  primaryBtn: { flex: 1, backgroundColor: colors.l1, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  primaryBtnText: { color: '#12161C', fontWeight: '700', fontSize: 12 },
});
