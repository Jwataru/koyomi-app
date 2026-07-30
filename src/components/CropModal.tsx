// 写真を選んだ直後に表示する「切り抜き」モーダル。
//
// これまでは (1) OS標準のクロップ画面（iOSの仕様で常に正方形になってしまう）→
// (2) 表示位置調整スライダー、の2段階でズレが積み重なり、結果的にかなりドアップな
// 見た目になってしまっていた。
//
// このモーダルでは最初からロック画面と同じ縦横比の枠だけを使ってその場で切り抜く。
// 拡大率（枠内に写る範囲の広さ）と位置はどちらも自由に調整でき、確定した見た目が
// そのまま最終的な壁紙画像になる（以後、表示位置の再調整は不要）。
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  PanResponder,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import ViewShot from 'react-native-view-shot';
import { colors } from '../theme/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAX_ZOOM = 3; // 枠いっぱい（最小）〜3倍まで自由に拡大できる

type Size = { w: number; h: number };
type Pt = { x: number; y: number };

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function CropModal({
  visible,
  sourceUri,
  aspect,
  accentColor,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  sourceUri: string | null;
  aspect: number; // width / height（ロック画面と同じ比率）
  accentColor?: string;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}) {
  const [natural, setNatural] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const panStart = useRef<Pt>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const naturalRef = useRef<Size | null>(null);
  const shotRef = useRef<ViewShot>(null);

  // 枠のサイズ（画面に収まる範囲でできるだけ大きく取る）
  let FRAME_W = Math.min(SCREEN_W * 0.86, 380);
  let FRAME_H = FRAME_W / aspect;
  const MAX_FRAME_H = SCREEN_H * 0.6;
  if (FRAME_H > MAX_FRAME_H) {
    FRAME_H = MAX_FRAME_H;
    FRAME_W = FRAME_H * aspect;
  }

  useEffect(() => {
    if (!visible || !sourceUri) return;
    setNatural(null);
    setZoom(1);
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
    Image.getSize(
      sourceUri,
      (w, h) => {
        setNatural({ w, h });
        naturalRef.current = { w, h };
      },
      (e) => {
        console.error('CropModal getSize failed', e);
        Alert.alert('画像の読み込みに失敗しました', String(e));
      }
    );
  }, [visible, sourceUri]);

  const getBounds = useCallback(
    (zoomVal: number) => {
      const n = naturalRef.current;
      if (!n) {
        return { maxX: 0, maxY: 0, displayScale: 1, dispW: FRAME_W, dispH: FRAME_H };
      }
      const coverScale = Math.max(FRAME_W / n.w, FRAME_H / n.h);
      const displayScale = coverScale * zoomVal;
      const dispW = n.w * displayScale;
      const dispH = n.h * displayScale;
      const maxX = Math.max(0, (dispW - FRAME_W) / 2);
      const maxY = Math.max(0, (dispH - FRAME_H) / 2);
      return { maxX, maxY, displayScale, dispW, dispH };
    },
    [FRAME_W, FRAME_H]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        panStart.current = { x: 0, y: 0 };
        setPan((p) => {
          panStart.current = p;
          return p;
        });
      },
      onPanResponderMove: (_e, g) => {
        const b = getBounds(zoomRef.current);
        setPan({
          x: clampNum(panStart.current.x + g.dx, -b.maxX, b.maxX),
          y: clampNum(panStart.current.y + g.dy, -b.maxY, b.maxY),
        });
      },
    })
  ).current;

  function onZoomChange(v: number) {
    zoomRef.current = v;
    setZoom(v);
    const b = getBounds(v);
    setPan((p) => ({
      x: clampNum(p.x, -b.maxX, b.maxX),
      y: clampNum(p.y, -b.maxY, b.maxY),
    }));
  }

  async function handleConfirm() {
    if (!naturalRef.current || !sourceUri) return;
    setLoading(true);
    try {
      // 枠の中に実際に見えている通りの範囲をそのままキャプチャする。
      // （壁紙本体の生成にも使っている react-native-view-shot と同じ仕組みなので、
      // 新しいネイティブモジュールを追加せずに済む）
      const uri = await shotRef.current?.capture?.();
      if (!uri) throw new Error('capture returned empty result');
      onConfirm(uri);
    } catch (e) {
      console.error('CropModal capture failed', e);
      Alert.alert('切り抜きに失敗しました', String(e));
    } finally {
      setLoading(false);
    }
  }

  const b = getBounds(zoom);
  const accent = accentColor ?? colors.l1;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Text style={styles.title}>写真の切り抜き</Text>
        <Text style={styles.caption}>ロック画面と同じ比率で切り抜かれます。ドラッグで位置、下のスライダーで拡大率を調整できます。</Text>

        <View style={[styles.frameOuter, { width: FRAME_W, height: FRAME_H, borderColor: accent }]}>
          <ViewShot ref={shotRef} options={{ format: 'jpg', quality: 0.92 }} style={styles.frameInner}>
            <View style={StyleSheet.absoluteFill} collapsable={false} {...panResponder.panHandlers}>
              {natural ? (
                <Image
                  source={{ uri: sourceUri ?? undefined }}
                  resizeMode="cover"
                  style={{
                    position: 'absolute',
                    width: b.dispW,
                    height: b.dispH,
                    left: FRAME_W / 2 - b.dispW / 2 + pan.x,
                    top: FRAME_H / 2 - b.dispH / 2 + pan.y,
                  }}
                />
              ) : (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={accent} />
                </View>
              )}
            </View>
          </ViewShot>
        </View>

        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>拡大</Text>
          <Slider
            style={{ flex: 1 }}
            minimumValue={1}
            maximumValue={MAX_ZOOM}
            value={zoom}
            onValueChange={onZoomChange}
            minimumTrackTintColor={accent}
            disabled={!natural}
          />
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, { borderColor: accent }, loading && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={loading || !natural}
          >
            {loading ? (
              <ActivityIndicator color={accent} size="small" />
            ) : (
              <Text style={[styles.confirmText, { color: accent }]}>この範囲を使う</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  caption: {
    color: colors.inkMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 320,
  },
  frameOuter: {
    borderWidth: 2,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.bgPanel2,
  },
  frameInner: {
    flex: 1,
    overflow: 'hidden',
  },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 380,
    marginTop: 20,
  },
  zoomLabel: { color: colors.inkMuted, fontSize: 11 },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    width: '100%',
    maxWidth: 380,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cancelText: { color: colors.inkMuted, fontSize: 13 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  confirmText: { fontSize: 13, fontWeight: '700' },
});
