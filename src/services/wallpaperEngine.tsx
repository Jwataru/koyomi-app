// 「今日のレベルに応じた壁紙画像を生成し、専用アルバムに保存する」処理をまとめたエンジン。
//
// - 画面には表示しない（画面外に配置した）フル解像度のキャンバスを常時マウントしておき、
//   react-native-view-shot でその見た目をそのままキャプチャする。
// - 生成した画像は expo-media-library で「koyomi壁紙」という専用アルバムに保存する。
// - プレビュー画面の「保存」ボタンからも、ショートカット経由のディープリンクからも、
//   同じ requestWallpaperSave() を呼べば同じ結果になるようにしてある。
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Linking, Platform } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { colors, LEVELS, LevelKey } from '../theme/theme';
import LevelIcon from '../components/LevelIcon';
import { loadCycleSettings, loadPhotoMeta, PhotoMeta } from '../data/storage';
import { calcLevel, toDate } from '../logic/cycle';

export const WALLPAPER_ALBUM_NAME = 'koyomi壁紙';

// オンボーディングの案内文どおりにユーザーがショートカットアプリに作成する想定の名前。
// ユーザー側で別名にした場合は連携できなくなるため、設定画面でも同じ名前を案内する。
export const WALLPAPER_SHORTCUT_NAME = 'koyomi壁紙を更新';

/**
 * 「koyomi壁紙を更新」ショートカットをその場で実行する（iOSのみ）。
 * ショートカットの中の「壁紙を設定」アクションまで通しで動かすことで、
 * アプリ内の保存だけでなく、実際のロック画面の見た目までその場で切り替える。
 * アプリ自身はOS標準の壁紙設定APIを直接呼べないため、この一手間が必要になる。
 */
export function runWallpaperShortcut(): void {
  if (Platform.OS !== 'ios') return;
  const url = `shortcuts://run-shortcut?name=${encodeURIComponent(WALLPAPER_SHORTCUT_NAME)}`;
  Linking.openURL(url).catch((e) => {
    console.error('[wallpaperEngine] runWallpaperShortcut failed', e);
  });
}

const { width, height } = Dimensions.get('window');

function formatTime(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function formatDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}

export type WallpaperSaveResult = { success: boolean; message: string; level?: LevelKey };

// 画面のどこからでも呼べるようにするための簡易ブリッジ。
// WallpaperEngine（App.tsx にマウントする実体）が自分自身の capture 関数をここに登録する。
let _requestSave: ((forcedLevel?: LevelKey) => Promise<WallpaperSaveResult>) | null = null;

/**
 * forcedLevel を渡すと、実際の周期計算を無視してそのレベルの壁紙を生成・保存する。
 * プレビュー画面で「このレベルの見た目を確認したい」ときに使う。
 * 省略時（ショートカット経由など）は実際の周期から自動判定したレベルを使う。
 */
export function requestWallpaperSave(forcedLevel?: LevelKey): Promise<WallpaperSaveResult> {
  if (!_requestSave) {
    return Promise.resolve({ success: false, message: 'アプリの準備中です。少し待ってからもう一度お試しください。' });
  }
  return _requestSave(forcedLevel);
}

/**
 * 「設定」画面での変更（写真の更新・生理予定日や周期の変更）をきっかけに、
 * 時刻を待たずその場でロック画面まで反映したいときに呼ぶ。
 * 1. 現在の周期から自動判定したレベルで壁紙を生成し、専用アルバムへ保存
 * 2. 保存に成功したら、ショートカットを実行して実際のロック画面まで切り替える
 */
export async function regenerateAndApplyWallpaper(forcedLevel?: LevelKey): Promise<WallpaperSaveResult> {
  const result = await requestWallpaperSave(forcedLevel);
  if (result.success) {
    runWallpaperShortcut();
  }
  return result;
}

/**
 * App.tsx のルートに一度だけマウントしておくコンポーネント。
 * 画面には見えない位置にロック画面風のキャンバスを描画し、必要なときにキャプチャ→保存する。
 */
export default function WallpaperEngine() {
  const shotRef = useRef<ViewShot>(null);
  const [level, setLevel] = useState<LevelKey>(1);
  const [photo, setPhoto] = useState<PhotoMeta | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    _requestSave = async (forcedLevel?: LevelKey): Promise<WallpaperSaveResult> => {
      try {
        const [cycle, photoMeta] = await Promise.all([loadCycleSettings(), loadPhotoMeta()]);
        const autoLevel: LevelKey = cycle?.nextPeriodDate
          ? calcLevel(new Date(), toDate(cycle.nextPeriodDate), cycle.cycleLen)
          : 1;
        const lv: LevelKey = forcedLevel ?? autoLevel;
        const nextPhoto = photoMeta?.[lv] ?? null;

        // state を更新してキャンバスを最新内容で再描画させ、
        // 描画が反映されるのを少し待ってからキャプチャする
        await new Promise<void>((resolve) => {
          setNow(new Date());
          setLevel(lv);
          setPhoto(nextPhoto);
          setTimeout(resolve, 120);
        });

        const perm = await MediaLibrary.requestPermissionsAsync();
        if (perm.status !== 'granted') {
          return {
            success: false,
            message: '写真へのアクセスが許可されていないため保存できませんでした。設定アプリの「koyomi」から写真へのアクセスを許可してください。',
          };
        }
        // iOS で「選択した写真のみ」（Limited）が選ばれていると、写真1枚の追加（write）自体はできても
        // アルバムの作成・取得・追加といった管理操作が失敗することがある。
        // ここで先に検知して、原因が分かるメッセージを返す。
        if (perm.accessPrivileges === 'limited') {
          return {
            success: false,
            message:
              '写真へのアクセスが「一部の写真のみ」になっているため、専用アルバムを作成・更新できません。設定アプリの「koyomi」→「写真」で「すべての写真」を選択してください。',
          };
        }

        const uri = await shotRef.current?.capture?.();
        if (!uri) {
          return { success: false, message: '壁紙画像の生成に失敗しました。' };
        }

        let asset: MediaLibrary.Asset;
        try {
          asset = await MediaLibrary.createAssetAsync(uri);
        } catch (e) {
          console.error('[wallpaperEngine] createAssetAsync failed', e);
          return {
            success: false,
            message: `写真の保存に失敗しました（${e instanceof Error ? e.message : String(e)}）`,
          };
        }

        try {
          const album = await MediaLibrary.getAlbumAsync(WALLPAPER_ALBUM_NAME);
          if (album) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          } else {
            await MediaLibrary.createAlbumAsync(WALLPAPER_ALBUM_NAME, asset, false);
          }
        } catch (e) {
          // ここで失敗すると、写真自体は保存済みだがアルバムには入らず、
          // 端末側の判定で「スクリーンショット」等の別アルバムに表示されることがある。
          console.error('[wallpaperEngine] album op failed', e);
          return {
            success: false,
            message: `写真自体は保存されましたが、「${WALLPAPER_ALBUM_NAME}」アルバムへの登録に失敗しました。設定アプリの「koyomi」→「写真」で「すべての写真」へのアクセスを許可すると解決することがあります。（${
              e instanceof Error ? e.message : String(e)
            }）`,
          };
        }

        return {
          success: true,
          message: `「${WALLPAPER_ALBUM_NAME}」アルバムに保存しました（レベル${lv}・${LEVELS[lv].name}）`,
          level: lv,
        };
      } catch (e) {
        console.error('[wallpaperEngine] requestWallpaperSave failed', e);
        return {
          success: false,
          message: `保存中にエラーが発生しました（${e instanceof Error ? e.message : String(e)}）。もう一度お試しください。`,
        };
      }
    };

    return () => {
      _requestSave = null;
    };
  }, []);

  const info = LEVELS[level];

  return (
    // opacity ではなく画面外への配置で「非表示」にする。
    // opacity:0 の View は見た目通り透明な状態でキャプチャされてしまうため、
    // view-shot での撮影を前提にするなら画面外に置くのが正しいやり方。
    <View style={styles.offscreenWrap} pointerEvents="none">
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={{ width, height }}>
        <View style={[styles.canvas, { width, height }]} collapsable={false}>
          {photo?.uri ? (
            <Image source={{ uri: photo.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: info.soft }]} />
          )}
          <View style={styles.content}>
            <Text style={styles.time}>{formatTime(now)}</Text>
            <Text style={styles.date}>{formatDate(now)}</Text>
            {!photo?.uri && (
              <View style={styles.fallbackIcon}>
                <LevelIcon level={level} color="#fff" size={96} />
              </View>
            )}
          </View>
        </View>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreenWrap: {
    position: 'absolute',
    top: -height - 200,
    left: 0,
  },
  canvas: {
    backgroundColor: '#14181f',
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: height * 0.16,
  },
  time: { color: '#fff', fontSize: 96, fontWeight: '600' },
  date: { color: 'rgba(255,255,255,0.85)', fontSize: 22, marginTop: 10 },
  fallbackIcon: {
    marginTop: 40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
