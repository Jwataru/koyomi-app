import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Linking, Alert } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TodayScreen from './src/screens/TodayScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { colors } from './src/theme/theme';
import WallpaperEngine, {
  requestWallpaperSave,
  WALLPAPER_APPLIED_CALLBACK_URL,
} from './src/services/wallpaperEngine';
import { ensureFirstLaunchRecorded, getTrialStatus } from './src/logic/trial';
import { scheduleTrialNotifications } from './src/services/notifications';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgDeep,
    card: colors.bgPanel,
    border: colors.hairline,
    primary: colors.l1,
    text: colors.ink,
  },
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.l1,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.bgPanel, borderTopColor: colors.hairline },
      }}
    >
      <Tab.Screen name="今日" component={TodayScreen} />
      <Tab.Screen name="カレンダー" component={CalendarScreen} />
      <Tab.Screen name="プレビュー" component={PreviewScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// koyomi:// で開かれるディープリンクを2種類扱う。
// 1. koyomi://update-wallpaper … ショートカット（時刻トリガーのオートメーション等）が
//    「アプリを起動して最新の壁紙ファイルを作らせる」ために呼ぶもの。
// 2. koyomi://wallpaper-applied … アプリからその場で「koyomi」ショートカットを実行した後、
//    ショートカット完了時にOSがx-successコールバックとして自動で開くもの。
//    保存処理自体はショートカットを呼ぶ前にアプリ側で完了済みなので、ここでは
//    何もせず、単に「フォーカスをアプリへ戻す」ためだけに存在する。
function handleDeepLink(url: string | null) {
  if (!url) return;
  if (url === WALLPAPER_APPLIED_CALLBACK_URL) return;
  if (!url.includes('update-wallpaper')) return;
  requestWallpaperSave().then((result) => {
    if (!result.success) {
      Alert.alert('壁紙の更新に失敗しました', result.message);
    }
    // 成功時はショートカット側の「写真を検索」→「壁紙に設定」がそのまま続けられるよう、
    // アプリ側では何も表示せず静かに終える。
  });
}

export default function App() {
  useEffect(() => {
    // 無料期間（60日）の起算日を記録する。すでに記録済みなら何もしない。
    (async () => {
      const firstLaunchAt = await ensureFirstLaunchRecorded();
      const trial = await getTrialStatus();
      // 購入済みなら予告通知は不要。未購入なら「残り7日/1日/当日」を（再）スケジュールしておく。
      // 同じ内容で呼んでも安全な作りなので、起動のたびに呼んでも重複登録されない。
      if (!trial.isPro) {
        scheduleTrialNotifications(firstLaunchAt);
      }
    })();

    Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WallpaperEngine />
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Tabs" component={Tabs} />
          <RootStack.Screen
            name="Onboarding"
            component={OnboardingScreenWrapper}
            options={{ presentation: 'modal' }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

// ナビゲーションのgoBackをOnboardingScreenのonDoneに繋ぐだけの薄いラッパー
function OnboardingScreenWrapper({ navigation }: any) {
  return <OnboardingScreen onDone={() => navigation.goBack()} />;
}
