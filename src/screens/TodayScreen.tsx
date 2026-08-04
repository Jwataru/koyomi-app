import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import { calcLevel, daysUntilNextPeriod, toDate } from '../logic/cycle';
import {
  loadCycleSettings,
  loadPhotoMeta,
  loadTodos,
  saveTodos,
  CycleSettings,
  PhotoMetaMap,
  TodoItem,
} from '../data/storage';
import LevelIcon from '../components/LevelIcon';

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

export default function TodayScreen() {
  const [cycle, setCycle] = useState<CycleSettings | null>(null);
  const [photoMeta, setPhotoMeta] = useState<PhotoMetaMap | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [checkedModalVisible, setCheckedModalVisible] = useState(false);

  const reload = useCallback(async () => {
    const [c, p, t] = await Promise.all([loadCycleSettings(), loadPhotoMeta(), loadTodos()]);
    setCycle(c);
    setPhotoMeta(p);
    setTodos(t);
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
      { id: makeTodoId(), text, checkedAt: null, createdAt: new Date().toISOString() },
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

  const activeTodos = todos.filter((t) => !t.checkedAt);
  const checkedTodos = todos
    .filter((t) => !!t.checkedAt)
    .sort((a, b) => new Date(b.checkedAt as string).getTime() - new Date(a.checkedAt as string).getTime());

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
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
            activeTodos.map((todo) => (
              <View key={todo.id} style={styles.todoRow}>
                <Pressable style={styles.checkbox} onPress={() => checkTodo(todo.id)} hitSlop={8} />
                <Text style={styles.todoText}>{todo.text}</Text>
                <Pressable onPress={() => deleteTodo(todo.id)} hitSlop={8}>
                  <Text style={styles.todoDel}>×</Text>
                </Pressable>
              </View>
            ))
          )}

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
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
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
});
