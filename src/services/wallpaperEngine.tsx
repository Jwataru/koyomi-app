// 「今日のレベルに応じた壁紙画像を生成し、ファイルとして保存する」処理をまとめたエンジン。
//
// - 画面には表示しない（画面外に配置した）フル解像度のキャンバスを常時マウントしておき、
//   react-native-view-shot でその見た目をそのままキャプチャする。
// - 生成した画像は、毎回同じファイル名（WALLPAPER_FILE_NAME）で
//   FileSystem.documentDirectory 直下に上書き保存する。
//   Info.plist の UIFileSharingEnabled / LSSupportsOpeningDocumentsInPlace により、
//   このディレクトリは「ファイル」App の「このiPhone内」→「koyomi」から見える。
//   ショートカット側は「ファイルを取得」アクションでこの固定パスを直接読む
//   （＝写真ライブラリを経由しないため、カメラロールに画像が増えていくことがない）。
// - プレビュー画面の「保存」ボタンからも、ショートカット経由のディープリンクからも、
//   同じ requestWallpaperSave() を呼べば同じ結果になるようにしてある。
//
// ただし「写真未設定（＝アイコンのみのフォールバック表示）」のときだけは例外。
// オフスクリーンキャンバス上のSVGアイコンをview-shotでキャプチャすると、
// 実機のロック画面では中身が描画されない単色画像になってしまう問題があり、
// このキャプチャ経路には現状頼れない。そのためこのケースに限り、キャプチャを
// 一切行わず、あらかじめ用意した静止画（レベルごとのPNG）をそのまま使う。
import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, Linking, Platform } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { LEVELS, LevelKey } from '../theme/theme';
import LevelIcon from '../components/LevelIcon';
import {
  loadCycleSettings,
  loadPhotoMeta,
  PhotoMeta,
  loadWallpaperLastApplied,
  saveWallpaperLastApplied,
} from '../data/storage';
import { calcLevel, toDate } from '../logic/cycle';
import { getTrialStatus } from '../logic/trial';

// 「ファイル」App から見える固定ファイル名。ショートカット側の「ファイルを取得」に
// 設定するパスとして案内する値なので、変更するとショートカット側も直す必要がある。
export const WALLPAPER_FILE_NAME = 'koyomi-wallpaper.png';

/** ショートカット設定時の案内表示用に、現在の壁紙ファイルの絶対パスを返す。 */
export function getWallpaperFilePath(): string {
  return `${FileSystem.documentDirectory}${WALLPAPER_FILE_NAME}`;
}

// 写真未設定時に使う、レベルごとのフォールバック壁紙（あらかじめ用意した静止画）。
// オフスクリーンキャンバスのキャプチャに頼らずそのままファイルとして書き出す。
const FALLBACK_WALLPAPERS: Record<LevelKey, number> = {
  1: require('../assets/wallpaper-fallback/level1.png'),
  2: require('../assets/wallpaper-fallback/level2.png'),
  3: require('../assets/wallpaper-fallback/level3.png'),
  4: require('../assets/wallpaper-fallback/level4.png'),
};

// オンボーディングの案内文どおりにユーザーがショートカットアプリに作成する想定の名前。
// ユーザー側で別名にした場合は連携できなくなるため、設定画面でも同じ名前を案内する。
export const WALLPAPER_SHORTCUT_NAME = 'koyomi';

// ショートカット完了後に自動でこのアプリへ戻ってくるための、x-success コールバックURL。
// AppleのURLスキームの仕組み（x-callback-url）で、ショートカット実行時に
// &x-success=<このURL> を付けておくと、正常終了時にOSがこのURLを開いてくれる＝
// 自動的にkoyomiへフォーカスが戻る。App.tsx側でこのURLを受け取って何もしない
// （既に保存処理は完了済みなので、ここでは着地させるだけでよい）。
export const WALLPAPER_APPLIED_CALLBACK_URL = 'koyomi://wallpaper-applied';

/**
 * 「koyomi」ショートカットをその場で実行する（iOSのみ）。
 * ショートカットの中の「壁紙を設定」アクションまで通しで動かすことで、
 * アプリ内の保存だけでなく、実際のロック画面の見た目までその場で切り替える。
 * アプリ自身はOS標準の壁紙設定APIを直接呼べないため、この一手間が必要になる。
 */
export function runWallpaperShortcut(): void {
  if (Platform.OS !== 'ios') return;
  const url =
    `shortcuts://run-shortcut?name=${encodeURIComponent(WALLPAPER_SHORTCUT_NAME)}` +
    `&x-success=${encodeURIComponent(WALLPAPER_APPLIED_CALLBACK_URL)}`;
  Linking.openURL(url).catch((e) => {
    console.error('[wallpaperEngine] runWallpaperShortcut failed', e);
  });
}

const { width, height } = Dimensions.get('window');

export type WallpaperSaveResult = { success: boolean; message: string; level?: LevelKey };

// 画面のどこからでも呼べるようにするための簡易ブリッジ。
// WallpaperEngine（App.tsx にマウントする実体）が自分自身の capture 関数をここに登録する。
let _requestSave: ((forcedLevel?: LevelKey, force?: boolean) => Promise<WallpaperSaveResult>) | null = null;

/**
 * forcedLevel を渡すと、実際の周期計算を無視してそのレベルの壁紙を生成・保存する。
 * プレビュー画面で「このレベルの見た目を確認したい」ときに使う。
 * 省略時（ショートカット経由など）は実際の周期から自動判定したレベルを使う。
 */
export function requestWallpaperSave(forcedLevel?: LevelKey, force = false): Promise<WallpaperSaveResult> {
  if (!_requestSave) {
    return Promise.resolve({ success: false, message: 'アプリの準備中です。少し待ってからもう一度お試しください。' });
  }
  return _requestSave(forcedLevel, force);
}

/**
 * 「設定」画面での変更（写真の更新・生理予定日や周期の変更）をきっかけに、
 * 時刻を待たずその場でロック画面まで反映したいときに呼ぶ。
 * 1. 現在の周期から自動判定したレベルで壁紙を生成し、固定パスのファイルへ保存
 * 2. 保存に成功したら、ショートカットを実行して実際のロック画面まで切り替える
 */
export async function regenerateAndApplyWallpaper(
  forcedLevel?: LevelKey,
  force = false
): Promise<WallpaperSaveResult> {
  const result = await requestWallpaperSave(forcedLevel, force);
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

  useEffect(() => {
    _requestSave = async (forcedLevel?: LevelKey, force = false): Promise<WallpaperSaveResult> => {
      try {
        // ロック画面自動連携は無料期間（60日）限定の機能。期限切れかつ未購入なら、
        // 壁紙生成・アルバム保存に進む前にここで止める。
        // ※ 今日・カレンダー・TODOなど他の画面はこのチェックを通らないため、期限後も引き続き使える。
        const trial = await getTrialStatus();
        if (trial.trialExpired) {
          return {
            success: false,
            message:
              '無料期間（60日間）が終了したため、ロック画面の自動連携は停止しています。設定画面から購入すると再開できます。',
          };
        }

        const [cycle, photoMeta] = await Promise.all([loadCycleSettings(), loadPhotoMeta()]);
        const autoLevel: LevelKey = cycle?.nextPeriodDate
          ? calcLevel(new Date(), toDate(cycle.nextPeriodDate), cycle.cycleLen)
          : 1;
        const lv: LevelKey = forcedLevel ?? autoLevel;
        const nextPhoto = photoMeta?.[lv] ?? null;

        // state を更新してキャンバスを最新内容で再描画させ、
        // 描画が反映されるのを少し待ってからキャプチャする
        await new Promise<void>((resolve) => {
          setLevel(lv);
          setPhoto(nextPhoto);
          setTimeout(resolve, 120);
        });

        // 「今のファイルの中身」がすでに今回適用したいレベル・写真と同じなら、実質何も変わっていない。
        // その場合は無駄な書き込みは行わず、ショートカットの再実行だけで済ませる。
        const lastApplied = await loadWallpaperLastApplied();
        const nothingChanged =
          !force &&
          !!lastApplied &&
          lastApplied.level === lv &&
          lastApplied.uri === (nextPhoto?.uri ?? null);

        if (nothingChanged) {
          return {
            success: true,
            message: `すでに最新の状態です（レベル${lv}・${LEVELS[lv].name}）`,
            level: lv,
          };
        }

        // 写真が設定されていればこれまで通りオフスクリーンキャンバスをキャプチャする。
        // 写真未設定（アイコンのみのフォールバック表示）のときは、キャプチャ経路を使わず
        // 同梱のPNGをそのままローカルファイルとして解決して使う。
        // ↓ どちらの経路を通ったかを失敗時のメッセージに出すためのフラグ
        const usedFallback = !nextPhoto?.uri;
        let uri: string | null | undefined;
        if (usedFallback) {
          const fallbackAsset = Asset.fromModule(FALLBACK_WALLPAPERS[lv]);
          await fallbackAsset.downloadAsync();
          uri = fallbackAsset.localUri ?? fallbackAsset.uri;
        } else {
          uri = await shotRef.current?.capture?.();
        }
        if (!uri) {
          return { success: false, message: `壁紙画像の生成に失敗しました。[経路:${usedFallback ? 'fallback' : 'capture'}]` };
        }

        // 「ファイル」App から見える固定パスへ、毎回同じファイル名で上書き保存する。
        // 写真ライブラリを一切経由しないため、カメラロールや専用アルバムが
        // 保存のたびに増えていくことがない（ショートカット側は「ファイルを取得」で
        // この固定パスを直接読む想定）。
        // ※ delete → copy だと毎回別ファイル（別inode）になり、ショートカット側の
        //   「ファイルを取得」が内部で持つブックマーク参照が数回で壊れる恐れがある。
        //   そのため中身だけを読み直して同じファイルに上書きする（ファイル自体は作り直さない）。
        try {
          const dest = getWallpaperFilePath();
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
        } catch (e) {
          console.error('[wallpaperEngine] wallpaper file write failed', e);
          return {
            success: false,
            message: `壁紙ファイルの保存に失敗しました（${e instanceof Error ? e.message : String(e)}）`,
          };
        }

        await saveWallpaperLastApplied({ level: lv, uri: nextPhoto?.uri ?? null });

        return {
          success: true,
          message: '壁紙ファイルを更新しました。',
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
