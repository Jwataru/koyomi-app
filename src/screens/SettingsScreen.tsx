import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  Animated,
  PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import LevelIcon from '../components/LevelIcon';
import PositionedImage from '../components/PositionedImage';
import {
  loadCycleSettings,
  saveCycleSettings,
  loadPhotoMeta,
  savePhotoMeta,
  persistPhoto,
  loadOnboarding,
  CycleSettings,
  PhotoMetaMap,
  OnboardingState,
} from '../data/storage';

const LEVEL_LIST: LevelKey[] = [1, 2, 3, 4];

function parseDateOrToday(s: string): Date {
  if (s) {
    const [y, m, d] = s.split('-').map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(s: string): string {
  if (!s) return '日付を選択';
  const d = parseDateOrToday(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

type Rect = { x: number; y: number; width: number; height: number };

function GripIcon() {
  return (
    <View style={styles.gripGrid}>
      {[0, 1, 2].map((r) => (
        <View key={r} style={styles.gripRow}>
          <View style={styles.gripDot} />
          <View style={styles.gripDot} />
        </View>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [nextPeriodDate, setNextPeriodDate] = useState('');
  const [cycleLen, setCycleLen] = useState('28');
  const [photoMeta, setPhotoMeta] = useState<PhotoMetaMap | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dragLevel, setDragLevel] = useState<LevelKey | null>(null);
  const [hoverLevel, setHoverLevel] = useState<LevelKey | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      loadOnboarding().then(setOnboarding);
    }, [])
  );

  useEffect(() => {
    (async () => {
      const c = await loadCycleSettings();
      setNextPeriodDate(c.nextPeriodDate);
      setCycleLen(String(c.cycleLen));
      setPhotoMeta(await loadPhotoMeta());
    })();
  }, []);

  async function commitCycle(next: Partial<CycleSettings>) {
    const merged: CycleSettings = {
      nextPeriodDate: next.nextPeriodDate ?? nextPeriodDate,
      cycleLen: next.cycleLen ?? Number(cycleLen),
    };
    await saveCycleSettings(merged);
  }

  // number-pad キーボードには「完了」ボタンが無く、onEndEditingが発火しないことがあるため
  // 入力が止まってから自動保存する（フォーカスが外れるのを待たない）
  useEffect(() => {
    const t = setTimeout(() => {
      commitCycle({ nextPeriodDate, cycleLen: Number(cycleLen) || 0 });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPeriodDate, cycleLen]);

  function onChangeDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      // Androidのダイアログは選択/キャンセルで自動的に閉じる
      setShowDatePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selected) {
      const formatted = formatDateKey(selected);
      setNextPeriodDate(formatted);
      commitCycle({ nextPeriodDate: formatted });
    }
  }

  const photoMetaRef = useRef<PhotoMetaMap | null>(null);
  useEffect(() => {
    photoMetaRef.current = photoMeta;
  }, [photoMeta]);

  async function pickPhoto(level: LevelKey) {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          '写真へのアクセスが許可されていません',
          '端末の設定アプリから koyomi（Expo Go）の写真ライブラリへのアクセスを許可してください。'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;

      // 端末内アプリ専用領域へコピー（外部・クラウドには一切送らない）
      const localUri = await persistPhoto(level, result.assets[0].uri);
      const updated: PhotoMetaMap = {
        ...(photoMetaRef.current as PhotoMetaMap),
        [level]: { uri: localUri, x: 50, y: 50 },
      };
      setPhotoMeta(updated);
      await savePhotoMeta(updated);
    } catch (e) {
      console.error('pickPhoto failed', e);
      Alert.alert('画像の取り込みに失敗しました', String(e));
    }
  }

  async function updatePosition(level: LevelKey, axis: 'x' | 'y', value: number) {
    const current = photoMetaRef.current;
    if (!current) return;
    const updated: PhotoMetaMap = {
      ...current,
      [level]: { ...current[level], [axis]: value },
    };
    setPhotoMeta(updated);
    await savePhotoMeta(updated);
  }

  async function swapPhotos(a: LevelKey, b: LevelKey) {
    const current = photoMetaRef.current;
    if (!current) return;
    const updated: PhotoMetaMap = { ...current, [a]: current[b], [b]: current[a] };
    setPhotoMeta(updated);
    await savePhotoMeta(updated);
  }

  // --- ドラッグで画像を入れ替える仕組み ---
  // 以前の実装は「写真をタップ→新しい写真を選ぶ」と「写真を長押し→ドラッグで入れ替え」を
  // 同じ領域に重ねて判定していたため、タップ判定とドラッグ判定が競合して反応しないことがあった。
  // 今回は「写真本体＝タップ専用（新しい写真を選ぶ）」「右下の小さなつまみ（GripIcon）＝ドラッグ専用」
  // と操作対象を完全に分離することで、判定の競合が起きないようにしている。
  const slotLayouts = useRef<Partial<Record<LevelKey, Rect>>>({});
  const slotRefs = useRef<Partial<Record<LevelKey, View | null>>>({});
  const hoverLevelRef = useRef<LevelKey | null>(null);
  const dragPos = useRef(new Animated.ValueXY()).current;

  function setHover(v: LevelKey | null) {
    hoverLevelRef.current = v;
    setHoverLevel(v);
  }

  function measureSlot(level: LevelKey) {
    slotRefs.current[level]?.measureInWindow((x, y, width, height) => {
      slotLayouts.current[level] = { x, y, width, height };
    });
  }

  // ドラッグ開始時、スクロールしていて位置がずれている可能性があるため
  // 全スロットをその場で再測定して最新の画面上の位置を取り直す
  function measureAllSlots() {
    LEVEL_LIST.forEach((lvl) => measureSlot(lvl));
  }

  function findSlotAt(pageX: number, pageY: number, exclude: LevelKey): LevelKey | null {
    let found: LevelKey | null = null;
    (Object.keys(slotLayouts.current) as unknown as LevelKey[]).forEach((key) => {
      if (Number(key) === exclude) return;
      const rect = slotLayouts.current[key];
      if (!rect) return;
      if (
        pageX >= rect.x &&
        pageX <= rect.x + rect.width &&
        pageY >= rect.y &&
        pageY <= rect.y + rect.height
      ) {
        found = key;
      }
    });
    return found;
  }

  const panResponders = useMemo(() => {
    const map: Partial<Record<LevelKey, ReturnType<typeof PanResponder.create>>> = {};
    LEVEL_LIST.forEach((lvl) => {
      map[lvl] = PanResponder.create({
        // つまみ専用の領域なので、触れた瞬間に即ドラッグとして扱ってよい
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragPos.setValue({ x: 0, y: 0 });
          setDragLevel(lvl);
          setScrollEnabled(false);
          measureAllSlots();
        },
        onPanResponderMove: (evt, g) => {
          dragPos.setValue({ x: g.dx, y: g.dy });
          setHover(findSlotAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY, lvl));
        },
        onPanResponderRelease: () => {
          const target = hoverLevelRef.current;
          setDragLevel(null);
          setHover(null);
          setScrollEnabled(true);
          Animated.spring(dragPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          if (target) swapPhotos(lvl, target);
        },
        onPanResponderTerminate: () => {
          setDragLevel(null);
          setHover(null);
          setScrollEnabled(true);
          Animated.spring(dragPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>周期設定</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>次の生理予定日</Text>
              <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
                <Text style={{ color: nextPeriodDate ? colors.ink : colors.inkMuted, fontSize: 14 }}>
                  {formatDateDisplay(nextPeriodDate)}
                </Text>
              </Pressable>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>周期（日）</Text>
              <TextInput
                style={styles.input}
                value={cycleLen}
                onChangeText={setCycleLen}
                keyboardType="number-pad"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>ロック画面連携</Text>
          <View style={styles.launchRow}>
            <Text style={styles.launchText}>
              {onboarding?.done
                ? `設定済み・毎日${onboarding.time}に自動更新`
                : 'まだ設定されていません'}
            </Text>
            <Pressable
              style={styles.launchBtn}
              onPress={() => navigation.navigate('Onboarding')}
            >
              <Text style={styles.launchBtnText}>{onboarding?.done ? '設定を変更' : '連携する'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>設定画像</Text>
          <Text style={styles.footnote}>
            画像を選ぶとロック画面全体にその画像が使われます（実際のロック画面反映は別途ネイティブ連携が必要です）。
            スライダーで表示位置を微調整できます。右下のつまみ（⠿）をドラッグすると、他のレベルの画像と入れ替えられます。
          </Text>
          <View style={styles.photoGrid}>
            {LEVEL_LIST.map((lvl) => {
              const meta = photoMeta?.[lvl];
              const info = LEVELS[lvl];
              const isDragging = dragLevel === lvl;
              const isHoverTarget = hoverLevel === lvl && dragLevel !== null && dragLevel !== lvl;
              return (
                <View key={lvl} style={styles.photoSlot}>
                  <Animated.View
                    ref={(r) => {
                      slotRefs.current[lvl] = r as unknown as View | null;
                    }}
                    onLayout={() => measureSlot(lvl)}
                    style={[
                      styles.photoPreview,
                      isHoverTarget && { borderColor: info.hex, borderWidth: 2 },
                      isDragging && {
                        transform: [
                          { translateX: dragPos.x },
                          { translateY: dragPos.y },
                          { scale: 1.06 },
                        ],
                        zIndex: 10,
                        elevation: 8,
                      },
                    ]}
                  >
                    <Pressable style={styles.photoPressable} onPress={() => pickPhoto(lvl)}>
                      {meta?.uri ? (
                        <PositionedImage uri={meta.uri} x={meta.x} y={meta.y} />
                      ) : (
                        <LevelIcon level={lvl} color={info.hex} size={48} />
                      )}
                    </Pressable>
                    {meta?.uri && (
                      <View style={styles.gripHandle} {...panResponders[lvl]?.panHandlers}>
                        <GripIcon />
                      </View>
                    )}
                  </Animated.View>
                  <Text style={styles.photoLabel}>{info.name}</Text>
                  {meta?.uri && (
                    <View style={styles.sliders}>
                      <View style={styles.sliderRow}>
                        <Text style={styles.sliderLabel}>横</Text>
                        <Slider
                          style={{ flex: 1 }}
                          minimumValue={0}
                          maximumValue={100}
                          value={meta.x}
                          onValueChange={(v) => updatePosition(lvl, 'x', v)}
                          minimumTrackTintColor={info.hex}
                        />
                      </View>
                      <View style={styles.sliderRow}>
                        <Text style={styles.sliderLabel}>縦</Text>
                        <Slider
                          style={{ flex: 1 }}
                          minimumValue={0}
                          maximumValue={100}
                          value={meta.y}
                          onValueChange={(v) => updatePosition(lvl, 'y', v)}
                          minimumTrackTintColor={info.hex}
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 日付ピッカー */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={styles.pickerSheet} onPress={() => {}}>
              <View style={styles.pickerHead}>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerCancel}>キャンセル</Text>
                </Pressable>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerDone}>完了</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={parseDateOrToday(nextPeriodDate)}
                mode="date"
                display="spinner"
                locale="ja-JP"
                onChange={onChangeDate}
                textColor={colors.ink}
                style={styles.pickerWidget}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={parseDateOrToday(nextPeriodDate)}
            mode="date"
            display="default"
            onChange={onChangeDate}
          />
        )
      )}
    </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  content: { padding: 20, paddingBottom: 60 },
  panel: {
    backgroundColor: colors.bgPanel,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  panelTitle: { color: colors.ink, fontSize: 14, marginBottom: 16, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 140 },
  label: { color: colors.inkMuted, fontSize: 11, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgPanel2,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    color: colors.ink,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingHorizontal: 12,
    fontSize: 14,
    justifyContent: 'center',
    minHeight: 40,
  },
  footnote: { color: colors.inkMuted, fontSize: 11, lineHeight: 18, marginBottom: 16 },
  launchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  launchText: { flex: 1, color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  launchBtn: {
    borderWidth: 1,
    borderColor: colors.l1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  launchBtnText: { color: colors.l1, fontSize: 12 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  photoSlot: { width: '46%', gap: 6 },
  photoPreview: {
    aspectRatio: 9 / 16,
    borderRadius: 14,
    backgroundColor: colors.bgPanel2,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  photoPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gripHandle: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(15,19,25,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gripGrid: { gap: 3 },
  gripRow: { flexDirection: 'row', gap: 3 },
  gripDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#fff' },
  photoLabel: { color: colors.inkMuted, fontSize: 10, textAlign: 'center' },
  sliders: { gap: 4 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sliderLabel: { color: colors.inkMuted, fontSize: 9, width: 18 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.bgPanel2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  pickerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  pickerCancel: { color: colors.inkMuted, fontSize: 14 },
  pickerDone: { color: colors.l1, fontSize: 14, fontWeight: '700' },
  pickerWidget: { backgroundColor: colors.bgPanel2 },
});
