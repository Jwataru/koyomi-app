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
import WallpaperEngine, { requestWallpaperSave } from './src/services/wallpaperEngine';

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

// ショートカット（や他アプリ）から koyomi://update-wallpaper を開かれたときに、
// 現在のレベルの壁紙を再生成してアルバムへ保存する。
// 「koyomi」ショートカットの「Open URL」アクションから呼ばれる想定。
function handleDeepLink(url: string | null) {
  if (!url) return;
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
