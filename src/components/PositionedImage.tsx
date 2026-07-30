import React, { useState } from 'react';
import { View, Image, StyleSheet, LayoutChangeEvent, ViewStyle } from 'react-native';

// 画像を枠より少し大きく（OVERSCAN倍）表示しておき、その中で x/y (0-100) の
// スライダー値に応じて表示位置をずらす。こうすることで「object-position」的な
// 見た目のトリミング位置調整を、追加ライブラリなしで実現する。
const OVERSCAN = 1.35;

export default function PositionedImage({
  uri,
  x,
  y,
  style,
}: {
  uri: string;
  x: number; // 0-100（0=左/上、50=中央、100=右/下）
  y: number; // 0-100
  style?: ViewStyle;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }

  const bigW = size.width * OVERSCAN;
  const bigH = size.height * OVERSCAN;
  const excessW = bigW - size.width;
  const excessH = bigH - size.height;
  const left = -excessW * (x / 100);
  const top = -excessH * (y / 100);

  return (
    <View style={[styles.clip, style]} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{
            position: 'absolute',
            width: bigW,
            height: bigH,
            left,
            top,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', width: '100%', height: '100%' },
});
