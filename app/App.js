import React, { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import HomeScreen from './src/screens/HomeScreen';
import WatcherScreen from './src/screens/WatcherScreen';
import ObserverScreen from './src/screens/ObserverScreen';
import SplashOverlay from './src/components/SplashOverlay';
import { colors } from './src/theme';

// 必须在根组件渲染前调用：接管原生启动屏，禁止其自动隐藏，
// 改由 SplashOverlay 在自身布局完成后再隐藏，杜绝“一闪而过”。
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [screen, setScreen] = useState('home');
  const [splashDone, setSplashDone] = useState(false);

  // 安卓物理返回键：子页面返回首页（触发子页面卸载并自动断开清理）
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'home') {
        setScreen('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {screen === 'home' && (
        <HomeScreen
          onGoWatcher={() => setScreen('watcher')}
          onGoObserver={() => setScreen('observer')}
        />
      )}
      {screen === 'watcher' && <WatcherScreen onBack={() => setScreen('home')} />}
      {screen === 'observer' && <ObserverScreen onBack={() => setScreen('home')} />}

      {!splashDone && <SplashOverlay onFinish={() => setSplashDone(true)} />}
    </View>
  );
}
