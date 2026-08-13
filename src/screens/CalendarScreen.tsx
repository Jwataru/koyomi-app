import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, LEVELS } from '../theme/theme';
import { calcLevel, isPeriodDay } from '../logic/cycle';
import { toDate } from '../logic/cycle';
import {
  loadCycleSettings,
  loadEvents,
  saveEvents,
  CycleSettings,
  EventMap,
} from '../data/storage';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
// 1つのセルに入れて崩れない範囲でチップを表示できる上限（超えた分は「+N件」でまとめる）
const MAX_VISIBLE_CHIPS = 3;

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarScreen() {
  const [cycle, setCycle] = useState<CycleSettings | null>(null);
  const [events, setEvents] = useState<EventMap>({});
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setCycle(await loadCycleSettings());
    setEvents(await loadEvents());
  }, []);

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
            「設定」タブで次の生理予定日を入力すると{'\n'}カレンダーにレベルが表示されます。
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const nextPeriod = toDate(cycle.nextPeriodDate);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // 6週分に揃えて、週ごとに高さを均等割り（flex:1）にすることで
  // TimeTreeのようにグリッドが画面いっぱいまで大きく表示されるようにする
  while (cells.length < 42) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  function openDay(d: Date) {
    const key = dateKey(d);
    setSelectedDate(key);
    setDraftNotes(events[key] ?? []);
  }

  async function closeDay() {
    if (selectedDate) {
      const cleaned = draftNotes.map((s) => s.trim()).filter(Boolean);
      const updated = { ...events, [selectedDate]: cleaned };
      if (cleaned.length === 0) delete updated[selectedDate];
      setEvents(updated);
      await saveEvents(updated);
    }
    setSelectedDate(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.calHead}>
          <Pressable onPress={() => setViewMonth(new Date(year, month - 1, 1))}>
            <Text style={styles.navBtn}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {year}年{month + 1}月
          </Text>
          <Pressable onPress={() => setViewMonth(new Date(year, month + 1, 1))}>
            <Text style={styles.navBtn}>›</Text>
          </Pressable>
        </View>

        <View style={styles.dowRow}>
          {DOW.map((d) => (
            <Text key={d} style={styles.dowText}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {weeks.map((week, wIdx) => (
            <View key={wIdx} style={styles.weekRow}>
              {week.map((d, idx) => {
                if (!d) return <View key={idx} style={styles.cell} />;
                const key = dateKey(d);
                const level = calcLevel(d, nextPeriod, cycle.cycleLen);
                const period = isPeriodDay(d, nextPeriod, cycle.cycleLen);
                const info = LEVELS[level];
                const isToday = key === dateKey(new Date());
                const notes = events[key] ?? [];

                // 表示できるチップ数には限りがあるので、はみ出す分は「+N」でまとめる。
                // 文字が長い予定はチップの中で1行に省略表示し、セルの高さは絶対に超えない。
                const chips: string[] = [];
                if (period) chips.push('生理');
                chips.push(...notes);
                const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
                const hiddenCount = chips.length - visibleChips.length;

                return (
                  <Pressable
                    key={idx}
                    style={[styles.cell, { backgroundColor: info.soft }]}
                    onPress={() => openDay(d)}
                  >
                    <View style={[styles.dayNumWrap, isToday && { backgroundColor: info.hex }]}>
                      <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={styles.chipList}>
                      {visibleChips.map((text, i) => (
                        <View
                          key={i}
                          style={[
                            styles.chip,
                            text === '生理' ? styles.periodChip : styles.eventChip,
                          ]}
                        >
                          <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
                            {text}
                          </Text>
                        </View>
                      ))}
                      {hiddenCount > 0 && (
                        <Text style={styles.moreText} numberOfLines={1}>
                          ＋{hiddenCount}件
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <Modal visible={!!selectedDate} transparent animationType="fade" onRequestClose={closeDay}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalPanel}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{selectedDate}</Text>
              <Pressable onPress={closeDay}>
                <Text style={styles.modalClose}>×</Text>
              </Pressable>
            </View>
            {draftNotes.map((note, i) => (
              <View key={i} style={styles.eventRow}>
                <TextInput
                  style={styles.eventInput}
                  value={note}
                  onChangeText={(text) => {
                    const next = [...draftNotes];
                    next[i] = text;
                    setDraftNotes(next);
                  }}
                  placeholder="予定・メモ"
                  placeholderTextColor={colors.inkMuted}
                />
                <Pressable
                  onPress={() => setDraftNotes(draftNotes.filter((_, j) => j !== i))}
                >
                  <Text style={styles.eventDel}>×</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={() => setDraftNotes([...draftNotes, ''])}>
              <Text style={styles.addBtnText}>＋ 予定を追加</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep },
  content: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.inkMuted, textAlign: 'center', lineHeight: 22 },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  monthLabel: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  navBtn: { color: colors.ink, fontSize: 26, paddingHorizontal: 16 },
  dowRow: { flexDirection: 'row', paddingBottom: 8 },
  dowText: { flex: 1, textAlign: 'center', color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  // TimeTreeのように、グリッド全体で残りの縦スペースをすべて使い切る
  grid: { flex: 1 },
  weekRow: { flex: 1, flexDirection: 'row' },
  cell: {
    flex: 1,
    padding: 4,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    overflow: 'hidden', // 文字数が多いチップがあってもセルの外にはみ出させない
  },
  dayNumWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: { color: colors.ink, fontSize: 14 },
  dayNumToday: { fontWeight: '700', color: colors.bgDeep },
  // チップを縦に積む領域。flex:1 + overflow:hidden でセルの残り高さに収まる分だけ表示する
  chipList: { flex: 1, marginTop: 3, gap: 2, overflow: 'hidden' },
  chip: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  periodChip: { backgroundColor: colors.l4 },
  eventChip: { backgroundColor: 'rgba(255,255,255,0.16)' },
  chipText: { color: '#fff', fontSize: 9, lineHeight: 12 },
  moreText: { color: colors.inkMuted, fontSize: 8, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,10,14,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalPanel: { width: '100%', maxWidth: 380, backgroundColor: colors.bgPanel2, borderRadius: 16, padding: 20 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { color: colors.ink, fontSize: 14 },
  modalClose: { color: colors.inkMuted, fontSize: 20 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  eventInput: {
    flex: 1,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    color: colors.ink,
    paddingVertical: 9,
    paddingHorizontal: 11,
    fontSize: 13,
  },
  eventDel: { color: colors.inkMuted, fontSize: 17 },
  addBtn: { marginTop: 4, alignItems: 'center', paddingVertical: 8 },
  addBtnText: { color: colors.inkMuted, fontSize: 12 },
});
