import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
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
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  requestWallpaperSave,
  regenerateAndApplyWallpaper,
} from '../services/wallpaperEngine';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import LevelIcon from '../components/LevelIcon';
import CropModal from '../components/CropModal';
import {
  loadCycleSettings,
  saveCycleSettings,
  loadPhotoMeta,
  savePhotoMeta,
  persistPhoto,
  loadOnboarding,
  saveOnboarding,
  loadWallpaperSaved,
  saveWallpaperSaved,
  CycleSettings,
  PhotoMetaMap,
  OnboardingState,
  WallpaperSavedMap,
} from '../data/storage';

// 実機の壁紙生成キャンバス（wallpaperEngine）はこの画面サイズをそのまま使う。
// 設定画面のプレビュー枠・プレビュー画面（PreviewScreen）・実際の壁紙出力の
// 縦横比をすべて揃えることで、「見た目がずれる」問題を防ぐ。
const { width: DEVICE_W, height: DEVICE_H } = Dimensions.get('window');
const DEVICE_ASPECT = DEVICE_W / DEVICE_H;

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
  const [savedMap, setSavedMap] = useState<WallpaperSavedMap>({});
  // 切り抜きモーダルに渡す「どのレベルの、どの画像を切り抜いているか」
  const [cropTarget, setCropTarget] = useState<{ level: LevelKey; uri: string } | null>(null);
  const [applyingNow, setApplyingNow] = useState(false);
  // 「更新時刻」パネル用（ロック画面連携とは別枠で編集できるようにしたもの）
  const [updateTime, setUpdateTime] = useState(new Date(2000, 0, 1, 7, 0));
  const [showTimePicker, setShowTimePicker] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadOnboarding().then((ob) => {
        setOnboarding(ob);
        if (ob.time) {
          const [h, m] = ob.time.split(':').map(Number);
          if (!Number.isNaN(h) && !Number.isNaN(m)) {
            setUpdateTime(new Date(2000, 0, 1, h, m));
          }
        }
      });
    }, [])
  );

  useEffect(() => {
    (async () => {
      const c = await loadCycleSettings();
      setNextPeriodDate(c.nextPeriodDate);
      setCycleLen(String(c.cycleLen));
      setPhotoMeta(await loadPhotoMeta());
      setSavedMap(await loadWallpaperSaved());
    })();
  }, []);

  // 「すべての設定を反映」ボタン用。画面に今表示している内容
  // （生理予定日・周期・更新時刻・各レベルの設定画像）をすべて確実に保存してから、
  // 実際のロック画面まで即座に反映する。この画面での保存・反映処理はすべてこの関数に集約する。
  async function applyNow() {
    if (applyingNow) return;
    setApplyingNow(true);
    try {
      await commitCycle({ nextPeriodDate, cycleLen: Number(cycleLen) || 0 });
      await commitUpdateTime(updateTime);

      // 設定済みの各レベルの写真を、それぞれ「koyomi壁紙」アルバムへ保存する
      const currentPhotoMeta = photoMetaRef.current;
      const nextSavedMap: WallpaperSavedMap = { ...savedMapRef.current };
      for (const lvl of LEVEL_LIST) {
        const meta = currentPhotoMeta?.[lvl];
        if (!meta?.uri) continue;
        const saveResult = await requestWallpaperSave(lvl);
        if (!saveResult.success) {
          Alert.alert('反映できませんでした', saveResult.message);
          return;
        }
        nextSavedMap[lvl] = { uri: meta.uri };
      }
      setSavedMap(nextSavedMap);
      await saveWallpaperSaved(nextSavedMap);

      // 最後に、現在の周期から自動判定したレベルの壁紙を実際のロック画面まで反映する
      const result = await regenerateAndApplyWallpaper();
      if (!result.success) {
        Alert.alert('反映できませんでした', result.message);
      }
      // 成功時はショートカットアプリに切り替わり「壁紙を設定」画面が開くので、
      // アプリ側では特にメッセージを出さない（ショートカット側の完了操作に任せる）。
    } finally {
      setApplyingNow(false);
    }
  }

  async function commitCycle(next: Partial<CycleSettings>) {
    const merged: CycleSettings = {
      nextPeriodDate: next.nextPeriodDate ?? nextPeriodDate,
      cycleLen: next.cycleLen ?? Number(cycleLen),
    };
    await saveCycleSettings(merged);
  }

  // 「更新時刻」パネルでの選択を保存する。
  // ※ ここで保存されるのはアプリ内の表示用の値で、実際に毎日決まった時刻に
  //   処理を走らせているのは端末の「ショートカット」アプリ側のオートメーション。
  //   時刻を変えたら、オートメーション側の時刻もあわせて変更してもらう必要がある。
  async function commitUpdateTime(time: Date) {
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const next: OnboardingState = {
      platform: onboarding?.platform ?? null,
      done: onboarding?.done ?? false,
      time: `${hh}:${mm}`,
    };
    setOnboarding(next);
    await saveOnboarding(next);
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

  function onChangeUpdateTime(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selected) {
      setUpdateTime(selected);
      commitUpdateTime(selected);
    }
  }

  const photoMetaRef = useRef<PhotoMetaMap | null>(null);
  useEffect(() => {
    photoMetaRef.current = photoMeta;
  }, [photoMeta]);

  const savedMapRef = useRef<WallpaperSavedMap>({});
  useEffect(() => {
    savedMapRef.current = savedMap;
  }, [savedMap]);

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
      // 「一部の写真のみ（Limited）」を選んでいる場合、専用アルバムの管理ができないなど
      // 制限が入る。原因が分かるように先に案内しておく。
      if (perm.accessPrivileges === 'limited') {
        Alert.alert(
          '写真へのアクセスが「一部の写真のみ」になっています',
          'この設定のままだと専用アルバムが更新できないなどの制限があります。設定アプリの「koyomi」→「写真」で「すべての写真」を選択することをおすすめします。'
        );
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        // 'images' の配列指定が現行SDKの推奨形。旧来の MediaTypeOptions.Images は
        // 非推奨な上、端末によっては動画も選べてしまう不具合があったため置き換え。
        mediaTypes: ['images'],
        // OS標準のクロップ画面は使わない（iOSの仕様でクロップ枠が常に正方形になり、
        // ロック画面の縦横比とズレてドアップな仕上がりになってしまうため）。
        // 代わりに、選んだ元画像をそのままこの後の自前の切り抜き画面（CropModal）に渡す。
        allowsEditing: false,
        quality: 0.95,
      });
      if (result.canceled || !result.assets?.[0]) return;

      // 続けて「ロック画面と同じ比率で切り抜く」モーダルを開く
      setCropTarget({ level, uri: result.assets[0].uri });
    } catch (e) {
      console.error('pickPhoto failed', e);
      Alert.alert('画像の取り込みに失敗しました', String(e));
    }
  }

  // 設定済みの写真の切り抜き範囲だけをやり直したいとき用（再選択なしで調整できる）
  function readjustPhoto(level: LevelKey) {
    const uri = photoMetaRef.current?.[level]?.uri;
    if (!uri) return;
    setCropTarget({ level, uri });
  }

  async function handleCropConfirm(croppedUri: string) {
    const target = cropTarget;
    setCropTarget(null);
    if (!target) return;
    try {
      // 端末内アプリ専用領域へコピー（外部・クラウドには一切送らない）
      const localUri = await persistPhoto(target.level, croppedUri);
      const updated: PhotoMetaMap = {
        ...(photoMetaRef.current as PhotoMetaMap),
        [target.level]: { uri: localUri },
      };
      setPhotoMeta(updated);
      await savePhotoMeta(updated);
    } catch (e) {
      console.error('handleCropConfirm failed', e);
      Alert.alert('画像の保存に失敗しました', String(e));
    }
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
              {onboarding?.done ? '連携済みです' : 'まだ連携されていません'}
            </Text>
            <Pressable
              style={styles.launchBtn}
              onPress={() => navigation.navigate('Onboarding')}
            >
              <Text style={styles.launchBtnText}>{onboarding?.done ? 'ロック画面連携' : '連携する'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>更新時刻</Text>
          <Text style={styles.launchText}>
            毎日この時刻に、ロック画面の壁紙を自動で更新します。
            {'\n'}※ 実際の自動実行は端末の「ショートカット」アプリ側のオートメーションが行うため、変更したら同じ時刻をオートメーション側にも設定してください。
          </Text>
          <Pressable
            style={[styles.input, { marginTop: 10, alignSelf: 'flex-start', minWidth: 120 }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={{ color: colors.ink, fontSize: 14 }}>
              {String(updateTime.getHours()).padStart(2, '0')}:{String(updateTime.getMinutes()).padStart(2, '0')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>設定画像</Text>
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
                      { aspectRatio: DEVICE_ASPECT },
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
                        <Image source={{ uri: meta.uri }} resizeMode="cover" style={styles.photoImage} />
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
                      <Pressable style={styles.readjustBtn} onPress={() => readjustPhoto(lvl)}>
                        <Text style={styles.readjustBtnText}>位置を調整</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.applyAllBtn, applyingNow && styles.updateBtnDisabled]}
              onPress={applyNow}
              disabled={applyingNow}
            >
              {applyingNow ? (
                <ActivityIndicator color={colors.bgDeep} size="small" />
              ) : (
                <Text style={styles.applyAllBtnText}>すべての設定を反映</Text>
              )}
            </Pressable>
          )}
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

      {/* 更新時刻ピッカー */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setShowTimePicker(false)}>
            <Pressable style={styles.pickerSheet} onPress={() => {}}>
              <View style={styles.pickerHead}>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancel}>キャンセル</Text>
                </Pressable>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerDone}>完了</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={updateTime}
                mode="time"
                display="spinner"
                locale="ja-JP"
                onChange={onChangeUpdateTime}
                textColor={colors.ink}
                style={styles.pickerWidget}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : (
        showTimePicker && (
          <DateTimePicker value={updateTime} mode="time" display="default" onChange={onChangeUpdateTime} />
        )
      )}

      <CropModal
        visible={cropTarget !== null}
        sourceUri={cropTarget?.uri ?? null}
        aspect={DEVICE_ASPECT}
        accentColor={cropTarget ? LEVELS[cropTarget.level].hex : undefined}
        onCancel={() => setCropTarget(null)}
        onConfirm={handleCropConfirm}
      />
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
  toggle: { width: 34, height: 20, borderRadius: 10, backgroundColor: colors.hairline, padding: 2 },
  toggleOn: { backgroundColor: colors.l1 },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#12161C' },
  toggleDotOn: { marginLeft: 14 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  photoSlot: { width: '46%', gap: 6 },
  photoPreview: {
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
  photoImage: {
    width: '100%',
    height: '100%',
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
  sliders: { gap: 6 },
  readjustBtn: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readjustBtnText: { color: colors.inkMuted, fontSize: 10 },
  updateBtnDisabled: { opacity: 0.6 },
  applyAllBtn: {
    marginTop: 20,
    backgroundColor: colors.l1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  applyAllBtnText: { color: colors.bgDeep, fontSize: 14, fontWeight: '700' },
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
