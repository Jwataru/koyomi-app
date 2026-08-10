import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, daysUntilNextPeriod, toDate } from '../logic/cycle';
import {
  loadCycleSettings,
  loadPhotoMeta,
  loadTodos,
  saveTodos,
  loadLockScreenTodos,
  saveLockScreenTodos,
  CycleSettings,
  PhotoMetaMap,
  TodoItem,
  LockScreenTodosSnapshot,
} from '../data/storage';
import LevelIcon from '../components/LevelIcon';
import { getTrialStatus, TrialStatus } from '../logic/trial';
import { syncTodosToWidget } from '../services/widgetSync';

function makeTodoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// "2026-08-04T05:12:00.000Z" のようなISO文字列を "8/4 14:12" の形式に整形する
function formatCheckedAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

// "YYYY-MM-DD" 文字列 <-> Date の相互変換。SettingsScreen の同名関数と同じ考え方。
function parseDateOrToday(s: string | null): Date {
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

// 今日を0として、締め切り日までの残り日数（マイナスなら期限切れ）
function daysUntilDue(dateKey: string): number {
  const d = parseDateOrToday(dateKey);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// 締め切りピルの表示文言と、迫り具合に応じた色を返す
function getDueMeta(dateKey: string): { label: string; color: string } {
  const diff = daysUntilDue(dateKey);
  const d = parseDateOrToday(dateKey);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (diff < 0) return { label: `${md}（期限切れ）`, color: colors.l4 };
  if (diff === 0) return { label: `${md}（本日締切）`, color: colors.l4 };
  if (diff <= 3) return { label: `${md}まで`, color: colors.l3 };
  return { label: `${md}まで`, color: colors.inkMuted };
}

// 締め切りが近い順に並べる。締め切り未設定のものは後ろへ、その中では作成順を保つ。
function sortByDeadline(a: TodoItem, b: TodoItem): number {
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export default function TodayScreen() {
  const [cycle, setCycle] = useState<CycleSettings | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PhotoMetaMap | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [checkedModalVisible, setCheckedModalVisible] = useState(false);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  // 「ロック画面に反映」ボタンを最後に押した時点のスナップショット
  const [lockScreenSnapshot, setLockScreenSnapshot] = useState<LockScreenTodosSnapshot | null>(null);
  // 締め切り日ピッカーを開いているTODOのid（null なら非表示）
  const [dueDatePickerId, setDueDatePickerId] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);

  const reload = useCallback(async () => {
    const [c, p, t, trial, snap] = await Promise.all([
      loadCycleSettings(),
      loadPhotoMeta(),
      loadTodos(),
      getTrialStatus(),
      loadLockScreenTodos(),
    ]);
    setCycle(c);
    setPhotoMeta(p);
    setTodos(t);
    setTrialStatus(trial);
    setLockScreenSnapshot(snap);
  }, []);

  // 設定画面で値を変えて戻ってきたときに再読み込みする
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function addTodo() {
    const text = newTodoText.trim();
    if (!text) return;
    const next: TodoItem[] = [
      ...todos,
      {
        id: makeTodoId(),
        text,
        checkedAt: null,
        createdAt: new Date().toISOString(),
        dueDate: null,
        showOnLockScreen: false,
      },
    ];
    setTodos(next);
    setNewTodoText('');
    await saveTodos(next);
  }

  async function checkTodo(id: string) {
    const next = todos.map((t) => (t.id === id ? { ...t, checkedAt: new Date().toISOString() } : t));
    setTodos(next);
    await saveTodos(next);
  }

  async function deleteTodo(id: string) {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    await saveTodos(next);
  }

  async function setTodoDueDate(id: string, dateKey: string | null) {
    const next = todos.map((t) => (t.id === id ? { ...t, dueDate: dateKey } : t));
    setTodos(next);
    await saveTodos(next);
  }

  async function toggleShowOnLockScreen(id: string) {
    const next = todos.map((t) => (t.id === id ? { ...t, showOnLockScreen: !t.showOnLockScreen } : t));
    setTodos(next);
    await saveTodos(next);
  }

  function clearAllChecked() {
    Alert.alert('チェック済みを全部削除', 'チェック済みのTODOをすべて削除します。よろしいですか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          const next = todos.filter((t) => !t.checkedAt);
          setTodos(next);
          await saveTodos(next);
        },
      },
    ]);
  }

  function onChangeDueDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      // Androidのダイアログは選択/キャンセルで自動的に閉じる
      const id = dueDatePickerId;
      setDueDatePickerId(null);
      if (event.type === 'dismissed' || !id) return;
      if (selected) setTodoDueDate(id, formatDateKey(selected));
      return;
    }
    if (selected && dueDatePickerId) {
      setTodoDueDate(dueDatePickerId, formatDateKey(selected));
    }
  }

  // ロック画面に表示したいTODO（未完了 & トグルON）を締め切り順に並べたもの。
  // これがそのまま「反映」ボタンで保存されるスナップショットの中身になる。
  const desiredLockScreenTodos = useMemo(
    () =>
      todos
        .filter((t) => !t.checkedAt && t.showOnLockScreen)
        .sort(sortByDeadline)
        .map((t) => ({ id: t.id, text: t.text, dueDate: t.dueDate })),
    [todos]
  );

  // 現在の希望状態が、最後に反映したスナップショットと完全に一致しているか
  const hasUnreflectedChanges = useMemo(() => {
    const snapItems = lockScreenSnapshot?.items ?? [];
    if (snapItems.length !== desiredLockScreenTodos.length) return true;
    return desiredLockScreenTodos.some((item, i) => {
      const s = snapItems[i];
      return !s || s.id !== item.id || s.text !== item.text || s.dueDate !== item.dueDate;
    });
  }, [desiredLockScreenTodos, lockScreenSnapshot]);

  // このTODO個別について、「表示させたい状態」と「実際に反映済みのスナップショット」がずれているか
  function isTodoUnreflected(todo: TodoItem): boolean {
    const snapItems = lockScreenSnapshot?.items ?? [];
    const inSnapshot = snapItems.find((s) => s.id === todo.id);
    if (!todo.checkedAt && todo.showOnLockScreen) {
      // 表示したい状態 → スナップショットに同じ内容で入っていなければ未反映
      return !inSnapshot || inSnapshot.text !== todo.text || inSnapshot.dueDate !== todo.dueDate;
    }
    // 表示OFF（またはチェック済みで対象外）なのに、まだスナップショット側に残っている
    return !!inSnapshot;
  }

  async function reflectToLockScreen() {
    setReflecting(true);
    try {
      const snapshot: LockScreenTodosSnapshot = {
        updatedAt: new Date().toISOString(),
        items: desiredLockScreenTodos,
      };
      await saveLockScreenTodos(snapshot);
      setLockScreenSnapshot(snapshot);
      await syncTodosToWidget(snapshot);
    } finally {
      setReflecting(false);
    }
  }

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

  // 未完了TODOは締め切りが近い順に表示する
  const activeTodos = todos.filter((t) => !t.checkedAt).sort(sortByDeadline);
  const checkedTodos = todos
    .filter((t) => !!t.checkedAt)
    .sort((a, b) => new Date(b.checkedAt as string).getTime() - new Date(a.checkedAt as string).getTime());

  const editingTodo = dueDatePickerId ? todos.find((t) => t.id === dueDatePickerId) ?? null : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {trialStatus?.trialExpired ? (
          <View style={styles.trialExpiredBanner}>
            <Text style={styles.trialExpiredBannerText}>
              🔒 無料期間終了のためロック画面自動切り替えは行われません
            </Text>
            <Text style={styles.trialExpiredBannerSub}>
              買い切り版を購入すると引き続きご利用いただけます。「設定」タブから購入できます。
            </Text>
          </View>
        ) : (
          trialStatus?.showWarning && (
            <View style={styles.trialWarningBanner}>
              <Text style={styles.trialWarningBannerText}>
                ⏰ あと{trialStatus.daysRemaining}日で無料期間が終了します
              </Text>
              <Text style={styles.trialWarningBannerSub}>
                終了後はロック画面の自動切り替えが停止します。
              </Text>
            </View>
          )
        )}

        <Text style={styles.heading}>今日のステータス</Text>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: info.soft }]}>
            {photo?.uri ? (
              <Image source={{ uri: photo.uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
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
                {lvl} {LEVELS[lvl].name}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.todoSection}>
          <Text style={styles.todoHeading}>TODO</Text>

          <View style={styles.todoInputRow}>
            <TextInput
              style={styles.todoInput}
              value={newTodoText}
              onChangeText={setNewTodoText}
              placeholder="TODOを追加"
              placeholderTextColor={colors.inkMuted}
              onSubmitEditing={addTodo}
              returnKeyType="done"
            />
            <Pressable style={styles.todoAddBtn} onPress={addTodo}>
              <Text style={styles.todoAddBtnText}>＋</Text>
            </Pressable>
          </View>

          {activeTodos.length === 0 ? (
            <Text style={styles.todoEmptyText}>未完了のTODOはありません</Text>
          ) : (
            activeTodos.map((todo) => {
              const dueMeta = todo.dueDate ? getDueMeta(todo.dueDate) : null;
              const unreflected = isTodoUnreflected(todo);
              return (
                <View key={todo.id} style={styles.todoCard}>
                  <View style={styles.todoRow}>
                    <Pressable style={styles.checkbox} onPress={() => checkTodo(todo.id)} hitSlop={8} />
                    <Text style={styles.todoText}>{todo.text}</Text>
                    <Pressable onPress={() => deleteTodo(todo.id)} hitSlop={8}>
                      <Text style={styles.todoDel}>×</Text>
                    </Pressable>
                  </View>

                  <View style={styles.todoMetaRow}>
                    <Pressable
                      style={[styles.dueDatePill, dueMeta && { borderColor: dueMeta.color }]}
                      onPress={() => setDueDatePickerId(todo.id)}
                    >
                      <Text style={[styles.dueDatePillText, dueMeta && { color: dueMeta.color }]}>
                        📅 {dueMeta ? dueMeta.label : '締切を設定'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.lockPill, todo.showOnLockScreen && styles.lockPillActive]}
                      onPress={() => toggleShowOnLockScreen(todo.id)}
                    >
                      <Text style={[styles.lockPillText, todo.showOnLockScreen && styles.lockPillTextActive]}>
                        🔒 ロック画面{todo.showOnLockScreen ? 'ON' : 'OFF'}
                      </Text>
                    </Pressable>

                    {unreflected && (
                      <View style={styles.unreflectedTag}>
                        <Text style={styles.unreflectedTagText}>未反映</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.lockReflectSection}>
            <Pressable
              style={[styles.lockReflectBtn, !hasUnreflectedChanges && styles.lockReflectBtnDone]}
              onPress={reflectToLockScreen}
              disabled={reflecting}
            >
              <Text style={styles.lockReflectBtnText}>
                {reflecting ? '反映中…' : hasUnreflectedChanges ? '🔒 ロック画面に反映' : '✓ 反映済み'}
              </Text>
            </Pressable>
            <Text style={styles.lockReflectHint}>
              {desiredLockScreenTodos.length > 0
                ? `ロック画面表示ONのTODO ${desiredLockScreenTodos.length}件`
                : 'ロック画面表示ONのTODOはありません'}
            </Text>
          </View>

          <Pressable style={styles.checkedListBtn} onPress={() => setCheckedModalVisible(true)}>
            <Text style={styles.checkedListBtnText}>
              チェック済み一覧（{checkedTodos.length}）
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={checkedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckedModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalPanel}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>チェック済み一覧</Text>
              <Pressable onPress={() => setCheckedModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.checkedScroll}>
              {checkedTodos.length === 0 ? (
                <Text style={styles.emptyText}>チェック済みのTODOはありません</Text>
              ) : (
                checkedTodos.map((todo) => (
                  <View key={todo.id} style={styles.checkedRow}>
                    <View style={styles.checkedTextWrap}>
                      <Text style={styles.checkedText}>{todo.text}</Text>
                      <Text style={styles.checkedTime}>{formatCheckedAt(todo.checkedAt)}</Text>
                    </View>
                    <Pressable onPress={() => deleteTodo(todo.id)} hitSlop={8}>
                      <Text style={styles.todoDel}>×</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            {checkedTodos.length > 0 && (
              <Pressable style={styles.clearAllBtn} onPress={clearAllChecked}>
                <Text style={styles.clearAllBtnText}>すべて削除</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* TODO締め切り日ピッカー */}
      {dueDatePickerId &&
        (Platform.OS === 'ios' ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setDueDatePickerId(null)}
          >
            <Pressable style={styles.pickerOverlay} onPress={() => setDueDatePickerId(null)}>
              <Pressable style={styles.pickerSheet} onPress={() => {}}>
                <View style={styles.pickerHead}>
                  <Pressable onPress={() => setDueDatePickerId(null)}>
                    <Text style={styles.pickerCancel}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setTodoDueDate(dueDatePickerId, null);
                      setDueDatePickerId(null);
                    }}
                  >
                    <Text style={styles.pickerClear}>締切をクリア</Text>
                  </Pressable>
                  <Pressable onPress={() => setDueDatePickerId(null)}>
                    <Text style={styles.pickerDone}>完了</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={parseDateOrToday(editingTodo?.dueDate ?? null)}
                  mode="date"
                  display="spinner"
                  locale="ja-JP"
                  onChange={onChangeDueDate}
                  textColor={colors.ink}
                  style={styles.pickerWidget}
                />
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={parseDateOrToday(editingTodo?.dueDate ?? null)}
            mode="date"
            display="default"
            onChange={onChangeDueDate}
          />
        ))}
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

  trialExpiredBanner: {
    backgroundColor: colors.l4Soft,
    borderWidth: 1,
    borderColor: colors.l4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  trialExpiredBannerText: { color: colors.l4, fontSize: 12, fontWeight: '700' },
  trialExpiredBannerSub: { color: colors.inkMuted, fontSize: 11, marginTop: 4, lineHeight: 16 },

  trialWarningBanner: {
    backgroundColor: colors.l3Soft,
    borderWidth: 1,
    borderColor: colors.l3,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  trialWarningBannerText: { color: colors.l3, fontSize: 12, fontWeight: '700' },
  trialWarningBannerSub: { color: colors.inkMuted, fontSize: 11, marginTop: 4, lineHeight: 16 },

  todoSection: {
    marginTop: 24,
    backgroundColor: colors.bgPanel,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  todoHeading: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  todoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  todoInput: {
    flex: 1,
    backgroundColor: colors.bgPanel2,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    color: colors.ink,
    paddingVertical: 9,
    paddingHorizontal: 11,
    fontSize: 13,
  },
  todoAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.bgPanel2,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoAddBtnText: { color: colors.ink, fontSize: 18, lineHeight: 20 },
  todoEmptyText: { color: colors.inkMuted, fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  todoCard: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.inkMuted,
  },
  todoText: { flex: 1, color: colors.ink, fontSize: 13 },
  todoDel: { color: colors.inkMuted, fontSize: 17 },
  todoMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginLeft: 28, // チェックボックス分インデント
  },
  dueDatePill: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dueDatePillText: { color: colors.inkMuted, fontSize: 11 },
  lockPill: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  lockPillActive: {
    backgroundColor: colors.l1Soft,
    borderColor: colors.l1,
  },
  lockPillText: { color: colors.inkMuted, fontSize: 11 },
  lockPillTextActive: { color: colors.l1, fontWeight: '600' },
  unreflectedTag: {
    backgroundColor: colors.l2Soft,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  unreflectedTagText: { color: colors.l2, fontSize: 11, fontWeight: '600' },

  lockReflectSection: {
    marginTop: 16,
    alignItems: 'center',
  },
  lockReflectBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.l1Soft,
    borderWidth: 1,
    borderColor: colors.l1,
  },
  lockReflectBtnDone: {
    backgroundColor: colors.bgPanel2,
    borderColor: colors.hairline,
  },
  lockReflectBtnText: { color: colors.l1, fontSize: 13, fontWeight: '700' },
  lockReflectHint: { color: colors.inkMuted, fontSize: 11, marginTop: 6 },

  checkedListBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  checkedListBtnText: { color: colors.inkMuted, fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalPanel: { width: '100%', maxWidth: 380, backgroundColor: colors.bgPanel2, borderRadius: 16, padding: 20 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { color: colors.ink, fontSize: 14 },
  modalClose: { color: colors.inkMuted, fontSize: 20 },
  checkedScroll: { maxHeight: 360 },
  checkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  checkedTextWrap: { flex: 1 },
  checkedText: { color: colors.ink, fontSize: 13, marginBottom: 2 },
  checkedTime: { color: colors.inkMuted, fontSize: 11 },
  clearAllBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.l4Soft,
  },
  clearAllBtnText: { color: colors.l4, fontSize: 13, fontWeight: '600' },

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
  pickerClear: { color: colors.l4, fontSize: 13 },
  pickerDone: { color: colors.l1, fontSize: 14, fontWeight: '700' },
  pickerWidget: { backgroundColor: colors.bgPanel2 },
});
