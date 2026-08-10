import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Dimensions,
  PanResponder,
  LayoutChangeEvent,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, toDate } from '../logic/cycle';
import {
  loadCycleSettings,
  loadPhotoMeta,
  loadLockScreenTodos,
  loadTodoLockScreenLayout,
  saveTodoLockScreenLayout,
  CycleSettings,
  PhotoMetaMap,
  LockScreenTodosSnapshot,
} from '../data/storage';
import { getTrialStatus, TrialStatus } from '../logic/trial';
import { regenerateAndApplyWallpaper } from '../services/wallpaperEngine';
import LevelIcon from '../components/LevelIcon';
import LockScreenTodoBlock from '../components/LockScreenTodoBlock';
import {
  TodoLockScreenLayout,
  TodoFontFamily,
  DEFAULT_TODO_LAYOUT,
  DUMMY_PREVIEW_TODOS,
  FONT_FAMILY_ORDER,
  FONT_FAMILY_LABEL,
  MIN_FONT_SIZE_RATIO,
  MAX_FONT_SIZE_RATIO,
  TEXT_COLOR_PRESETS,
  PANEL_COLOR_PRESETS,
  TODO_BLOCK_WIDTH_RATIO,
  SAFE_AREA_TOP_PERCENT,
  SAFE_AREA_BOTTOM_PERCENT,
  clampTodoLayout,
} from '../logic/todoLayout';

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
const TODO_BLOCK_WIDTH_PX = PHONE_SCREEN_WIDTH * TODO_BLOCK_WIDTH_RATIO;
// フォントサイズのスライダー表示用：実機の目安の画面幅（iPhone標準サイズ相当）でpt換算する
const FONT_SIZE_REFERENCE_WIDTH = 390;

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
  const [lockTodos, setLockTodos] = useState<LockScreenTodosSnapshot | null>(null);

  // 保存済みのTODO表示レイアウト（位置・文字サイズ・フォント・色・パネル）と、
  // 編集中のドラフト（キャンセルで破棄できるように分けている）
  const [todoLayout, setTodoLayout] = useState<TodoLockScreenLayout>(DEFAULT_TODO_LAYOUT);
  const [draftLayout, setDraftLayout] = useState<TodoLockScreenLayout>(DEFAULT_TODO_LAYOUT);
  const [editingLayout, setEditingLayout] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blockHeightPx, setBlockHeightPx] = useState(0);
  const [scrollLocked, setScrollLocked] = useState(false);

  const editingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    editingRef.current = editingLayout;
  }, [editingLayout]);

  const reload = useCallback(async () => {
    const [c, p, trial, lockSnap, layout] = await Promise.all([
      loadCycleSettings(),
      loadPhotoMeta(),
      getTrialStatus(),
      loadLockScreenTodos(),
      loadTodoLockScreenLayout(),
    ]);
    setCycle(c);
    setPhotoMeta(p);
    setTrialStatus(trial);
    setLockTodos(lockSnap);
    setTodoLayout(layout);
    setDraftLayout(layout);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const blockHeightPercent = blockHeightPx > 0 ? (blockHeightPx / PHONE_SCREEN_HEIGHT) * 100 : 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => editingRef.current,
      onMoveShouldSetPanResponder: (_e, g) =>
        editingRef.current && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onPanResponderGrant: () => {
        setScrollLocked(true);
        setDraftLayout((prev) => {
          dragStartRef.current = { x: prev.xPercent, y: prev.yPercent };
          return prev;
        });
      },
      onPanResponderMove: (_e, g) => {
        const dxPercent = (g.dx / PHONE_SCREEN_WIDTH) * 100;
        const dyPercent = (g.dy / PHONE_SCREEN_HEIGHT) * 100;
        setDraftLayout((prev) =>
          clampTodoLayout(
            {
              ...prev,
              xPercent: dragStartRef.current.x + dxPercent,
              yPercent: dragStartRef.current.y + dyPercent,
            },
            blockHeightPercent
          )
        );
      },
      onPanResponderRelease: () => setScrollLocked(false),
      onPanResponderTerminate: () => setScrollLocked(false),
    })
  ).current;

  function onBlockLayout(e: LayoutChangeEvent) {
    setBlockHeightPx(e.nativeEvent.layout.height);
  }

  function startEditing() {
    setDraftLayout(todoLayout);
    setEditingLayout(true);
  }

  function cancelEditing() {
    setDraftLayout(todoLayout);
    setEditingLayout(false);
  }

  async function confirmEditing() {
    setSaving(true);
    try {
      const clamped = clampTodoLayout(draftLayout, blockHeightPercent);
      await saveTodoLockScreenLayout(clamped);
      setTodoLayout(clamped);
      setDraftLayout(clamped);
      setEditingLayout(false);
      // 見た目・位置の変更をその場で実際のロック画面まで反映する
      // （写真の更新や周期の変更と同じ「設定を変えたら即反映」の流れに揃える）。
      const result = await regenerateAndApplyWallpaper();
      if (!result.success) {
        Alert.alert('ロック画面への反映に失敗しました', result.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<TodoLockScreenLayout>) {
    setDraftLayout((prev) => clampTodoLayout({ ...prev, ...patch }, blockHeightPercent));
  }

  const autoLevel: LevelKey =
    cycle?.nextPeriodDate ? calcLevel(new Date(), toDate(cycle.nextPeriodDate), cycle.cycleLen) : 1;
  const level = overrideLevel ?? autoLevel;
  const info = LEVELS[level];
  const photo = photoMeta?.[level];
  const now = new Date();

  const hasRealTodos = (lockTodos?.items?.length ?? 0) > 0;
  const displayTodos = hasRealTodos ? lockTodos!.items : editingLayout ? DUMMY_PREVIEW_TODOS : [];
  const activeLayout = editingLayout ? draftLayout : todoLayout;
  const blockLeftPx = Math.max(
    0,
    Math.min(
      PHONE_SCREEN_WIDTH - TODO_BLOCK_WIDTH_PX,
      (activeLayout.xPercent / 100) * PHONE_SCREEN_WIDTH - TODO_BLOCK_WIDTH_PX / 2
    )
  );
  const blockTopPx = (activeLayout.yPercent / 100) * PHONE_SCREEN_HEIGHT;
  const safeAreaTopPx = (SAFE_AREA_TOP_PERCENT / 100) * PHONE_SCREEN_HEIGHT;
  const safeAreaBottomPx = (SAFE_AREA_BOTTOM_PERCENT / 100) * PHONE_SCREEN_HEIGHT;
  const fontSizePtEstimate = Math.round(draftLayout.fontSizeRatio * FONT_SIZE_REFERENCE_WIDTH);

  const content = (
    <View style={styles.lockContent}>
      <Text style={styles.lockDate}>{formatDate(now)}</Text>
      <Text style={styles.lockTime}>{formatTime(now)}</Text>
      {!photo?.uri && !editingLayout && (
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
      <ScrollView
        contentContainerStyle={styles.wrap}
        scrollEnabled={!scrollLocked}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

              {editingLayout && (
                <>
                  <View pointerEvents="none" style={[styles.safeAreaGuide, { top: 0, height: safeAreaTopPx }]} />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.safeAreaGuide,
                      { top: safeAreaBottomPx, height: PHONE_SCREEN_HEIGHT - safeAreaBottomPx },
                    ]}
                  />
                </>
              )}

              {displayTodos.length > 0 && (
                <View
                  {...(editingLayout ? panResponder.panHandlers : {})}
                  onLayout={onBlockLayout}
                  style={[
                    styles.todoBlockWrap,
                    editingLayout && styles.todoBlockWrapEditing,
                    { width: TODO_BLOCK_WIDTH_PX, left: blockLeftPx, top: blockTopPx },
                  ]}
                >
                  <LockScreenTodoBlock
                    items={displayTodos}
                    fontSizeRatio={activeLayout.fontSizeRatio}
                    containerWidth={PHONE_SCREEN_WIDTH}
                    fontFamily={activeLayout.fontFamily}
                    textColor={activeLayout.textColor}
                    panelEnabled={activeLayout.panelEnabled}
                    panelColor={activeLayout.panelColor}
                    panelOpacity={activeLayout.panelOpacity}
                  />
                </View>
              )}

              <View style={styles.notch} />
            </View>
          </View>

          {editingLayout ? (
            <View style={styles.editPanel}>
              <Text style={styles.editHint}>
                ドラッグで位置を調整できます。上下の網掛け部分には時計やアイコンが重なるため配置できません。
              </Text>

              <Text style={styles.editSectionLabel}>文字の大きさ（目安 {fontSizePtEstimate}pt）</Text>
              <Slider
                style={styles.adjustSlider}
                minimumValue={MIN_FONT_SIZE_RATIO}
                maximumValue={MAX_FONT_SIZE_RATIO}
                value={draftLayout.fontSizeRatio}
                onValueChange={(v) => updateDraft({ fontSizeRatio: v })}
                minimumTrackTintColor={colors.l1}
              />

              <Text style={styles.editSectionLabel}>フォント</Text>
              <View style={styles.pillRow}>
                {FONT_FAMILY_ORDER.map((family) => (
                  <Pressable
                    key={family}
                    style={[styles.pillBtn, draftLayout.fontFamily === family && styles.pillBtnActive]}
                    onPress={() => updateDraft({ fontFamily: family as TodoFontFamily })}
                  >
                    <Text
                      style={[styles.pillBtnText, draftLayout.fontFamily === family && styles.pillBtnTextActive]}
                    >
                      {FONT_FAMILY_LABEL[family]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.editSectionLabel}>文字の色</Text>
              <View style={styles.swatchRow}>
                {TEXT_COLOR_PRESETS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => updateDraft({ textColor: c })}
                    style={[
                      styles.swatch,
                      { backgroundColor: c },
                      draftLayout.textColor === c && styles.swatchActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.panelToggleRow}>
                <Text style={styles.editSectionLabel}>背面パネル</Text>
                <Pressable
                  style={[styles.togglePill, draftLayout.panelEnabled && styles.togglePillActive]}
                  onPress={() => updateDraft({ panelEnabled: !draftLayout.panelEnabled })}
                >
                  <Text style={[styles.togglePillText, draftLayout.panelEnabled && styles.togglePillTextActive]}>
                    {draftLayout.panelEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
              </View>

              {draftLayout.panelEnabled && (
                <>
                  <Text style={styles.editSectionLabel}>パネルの色</Text>
                  <View style={styles.swatchRow}>
                    {PANEL_COLOR_PRESETS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => updateDraft({ panelColor: c })}
                        style={[
                          styles.swatch,
                          { backgroundColor: c },
                          draftLayout.panelColor === c && styles.swatchActive,
                        ]}
                      />
                    ))}
                  </View>

                  <Text style={styles.editSectionLabel}>
                    パネルの濃さ（{Math.round(draftLayout.panelOpacity * 100)}%）
                  </Text>
                  <Slider
                    style={styles.adjustSlider}
                    minimumValue={0.05}
                    maximumValue={0.9}
                    value={draftLayout.panelOpacity}
                    onValueChange={(v) => updateDraft({ panelOpacity: v })}
                    minimumTrackTintColor={colors.l1}
                  />
                </>
              )}

              <View style={styles.editButtonRow}>
                <Pressable style={styles.cancelBtn} onPress={cancelEditing} disabled={saving}>
                  <Text style={styles.cancelBtnText}>キャンセル</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
                  onPress={confirmEditing}
                  disabled={saving}
                >
                  <Text style={styles.confirmBtnText}>{saving ? '反映中…' : '保存してロック画面に反映'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
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

              <Pressable style={styles.editEntryBtn} onPress={startEditing}>
                <Text style={styles.editEntryBtnText}>TODOの表示位置・見た目を編集</Text>
              </Pressable>
            </>
          )}
        </View>

        {!editingLayout && (
          <Text style={styles.saveHint}>
            見た目の確認用画面です。写真の変更・更新は「設定」タブの各レベルにある「使用する写真を更新」から行えます。
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  wrap: { flexGrow: 1, alignItems: 'center', paddingTop: 24, paddingBottom: 48 },
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

  todoBlockWrap: {
    position: 'absolute',
    padding: 4,
  },
  todoBlockWrapEditing: {
    borderWidth: 1.5,
    borderColor: colors.l1,
    borderRadius: 10,
    backgroundColor: 'rgba(127,191,160,0.12)',
  },
  safeAreaGuide: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(224,89,107,0.18)',
  },

  editEntryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.l1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  editEntryBtnText: { color: colors.l1, fontSize: 12, fontWeight: '700' },

  editPanel: { width: '100%', maxWidth: 340, paddingHorizontal: 20 },
  editHint: {
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 16,
  },
  editSectionLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: 14,
    marginBottom: 6,
  },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pillBtn: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bgPanel,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pillBtnActive: { borderColor: colors.l1, backgroundColor: colors.l1Soft },
  pillBtnText: { color: colors.inkMuted, fontSize: 12 },
  pillBtnTextActive: { color: colors.l1, fontWeight: '700' },

  swatchRow: { flexDirection: 'row', gap: 10 },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  swatchActive: { borderWidth: 2.5, borderColor: colors.l1 },

  panelToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  togglePill: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bgPanel,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  togglePillActive: { borderColor: colors.l1, backgroundColor: colors.l1Soft },
  togglePillText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  togglePillTextActive: { color: colors.l1 },

  adjustSlider: { width: '100%', height: 32 },

  editButtonRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cancelBtnText: { color: colors.inkMuted, fontSize: 13 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.l1,
    backgroundColor: colors.l1Soft,
  },
  confirmBtnText: { color: colors.l1, fontSize: 13, fontWeight: '700' },
});
