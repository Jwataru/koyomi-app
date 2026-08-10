// ロック画面（プレビューのモック / 実際の壁紙生成キャンバスの両方）に描画する
// TODOリストの見た目そのもの。位置・ドラッグの扱いは呼び出し側（PreviewScreenの
// 編集UI、wallpaperEngineの静的描画）に任せ、ここでは「渡された幅の中にどう
// 収まるか」だけを担当する。
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONT_SCALE_RATIO, MAX_TODO_LINES, TodoFontScale } from '../logic/todoLayout';

export type LockScreenTodoDisplayItem = { id: string; text: string; dueDate?: string | null };

export default function LockScreenTodoBlock({
  items,
  fontScale,
  containerWidth,
}: {
  items: LockScreenTodoDisplayItem[];
  fontScale: TodoFontScale;
  // ロック画面（枠）の幅。ここを基準にフォントサイズを相対計算するため、
  // プレビューのモック幅・実機の画面幅のどちらを渡しても見た目の比率は揃う。
  containerWidth: number;
}) {
  const fontSize = Math.max(9, containerWidth * FONT_SCALE_RATIO[fontScale]);
  const lineHeight = Math.round(fontSize * 1.5);
  // 件数ではなく行数（折り返し込み）で上限を切るため、最大行数ぶんの高さでクリップする。
  const maxHeight = lineHeight * MAX_TODO_LINES;

  return (
    <View style={[styles.wrap, { maxHeight }]} pointerEvents="none">
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <View
            style={[
              styles.bullet,
              {
                width: fontSize * 0.46,
                height: fontSize * 0.46,
                borderRadius: fontSize * 0.12,
                marginTop: fontSize * 0.28,
              },
            ]}
          />
          <Text style={[styles.text, { fontSize, lineHeight }]} numberOfLines={2}>
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  bullet: {
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  text: {
    flex: 1,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
