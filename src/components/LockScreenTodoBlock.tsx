// ロック画面（プレビューのモック / 実際の壁紙生成キャンバスの両方）に描画する
// TODOリストの見た目そのもの。位置・ドラッグの扱いは呼び出し側（PreviewScreenの
// 編集UI、wallpaperEngineの静的描画）に任せ、ここでは「渡された幅の中にどう
// 収まるか・どう見えるか」だけを担当する。
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  FONT_FAMILY_VALUE,
  MAX_TODO_LINES,
  TodoFontFamily,
  hexToRgba,
} from '../logic/todoLayout';

export type LockScreenTodoDisplayItem = { id: string; text: string; dueDate?: string | null };

export default function LockScreenTodoBlock({
  items,
  fontSizeRatio,
  containerWidth,
  fontFamily = 'default',
  textColor = '#FFFFFF',
  panelEnabled = false,
  panelColor = '#000000',
  panelOpacity = 0.35,
}: {
  items: LockScreenTodoDisplayItem[];
  fontSizeRatio: number; // 画面幅に対する比率
  // ロック画面（枠）の幅。ここを基準にフォントサイズを相対計算するため、
  // プレビューのモック幅・実機の画面幅のどちらを渡しても見た目の比率は揃う。
  containerWidth: number;
  fontFamily?: TodoFontFamily;
  textColor?: string;
  panelEnabled?: boolean;
  panelColor?: string;
  panelOpacity?: number;
}) {
  const fontSize = Math.max(9, containerWidth * fontSizeRatio);
  const lineHeight = Math.round(fontSize * 1.5);
  // 件数ではなく行数（折り返し込み）で上限を切るため、最大行数ぶんの高さでクリップする。
  const maxHeight = lineHeight * MAX_TODO_LINES;
  const resolvedFontFamily = FONT_FAMILY_VALUE[fontFamily];

  return (
    <View
      style={[
        styles.wrap,
        { maxHeight },
        panelEnabled && [styles.panel, { backgroundColor: hexToRgba(panelColor, panelOpacity) }],
      ]}
      pointerEvents="none"
    >
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
                borderColor: textColor,
              },
            ]}
          />
          <Text
            style={[
              styles.text,
              {
                fontSize,
                lineHeight,
                color: textColor,
                fontFamily: resolvedFontFamily,
                // カスタムフォントの太さはフォント自体が持つため、標準フォントのときだけ
                // fontWeightで太くする（カスタムフォント名にfontWeightを重ねると
                // 一部端末で無視/変換されてしまうのを避けるため）。
                fontWeight: resolvedFontFamily ? undefined : '600',
                textShadowColor: panelEnabled ? 'transparent' : 'rgba(0,0,0,0.55)',
              },
            ]}
            numberOfLines={2}
          >
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', width: '100%' },
  panel: { borderRadius: 12, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  bullet: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  text: {
    flex: 1,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
