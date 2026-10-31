// 简爱 Simple Love - 全屏开屏动画层
//
// 设计要点（针对两类异常）：
// 1. 全屏覆盖：容器使用 absoluteFill 铺满整个根视图，背景色与原生启动屏完全相同，
//    图片使用 resizeMode=cover 自适应任意屏幕比例（含刘海屏/挖孔屏），
//    因此任何机型都不会出现边界留白；根视图在 androidStatusBar.translucent 下
//    本身已延伸至状态栏区域，图片可真正铺满整屏。
// 2. 完整时长：动画总时长由下面的常量统一控制，只有动画 sequence 真正播放完毕
//    才会通知外层卸载；同时附加超时兜底，避免回调异常导致永久停留。
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { colors } from '../theme';

// ——— 预设动画时长（毫秒） ———
const T_FADE_IN = 900; // 图片淡入
const T_ZOOM = 1400; // 缓慢缩放（略大于淡入，形成持续的呼吸感）
const T_HOLD = 800; // 完整停留展示
const T_FADE_OUT = 600; // 整体淡出

// 动画总时长：三段时间串行相加，供外层与兜底定时器使用
export const SPLASH_TOTAL_DURATION = T_ZOOM + T_HOLD + T_FADE_OUT; // 2800ms

export default function SplashOverlay({ onFinish }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(1.06)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  const laidOutRef = useRef(false);
  const doneRef = useRef(false);

  // 保证 onFinish 只触发一次，避免重复卸载或提前结束
  const finishOnce = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (onFinish) onFinish();
  };

  // 兜底：即使动画回调异常，也在总时长后退出，绝不让开屏层常驻
  useEffect(() => {
    const guard = setTimeout(finishOnce, SPLASH_TOTAL_DURATION + 400);
    return () => clearTimeout(guard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 布局完成后再隐藏原生启动屏，避免“根视图已挂载但开屏层未铺满”造成的白屏闪跳
  const handleLayout = async () => {
    if (laidOutRef.current) return;
    laidOutRef.current = true;

    try {
      await SplashScreen.hideAsync();
    } catch (e) {
      // 原生启动屏可能已被其他逻辑隐藏，忽略即可
    }

    Animated.sequence([
      Animated.parallel([
        Animated.timing(imageOpacity, {
          toValue: 1,
          duration: T_FADE_IN,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(imageScale, {
          toValue: 1,
          duration: T_ZOOM,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 700,
          delay: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(T_HOLD),
      Animated.parallel([
        Animated.timing(rootOpacity, {
          toValue: 0,
          duration: T_FADE_OUT,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      // 仅在动画自然播放完成时结束；被打断则由兜底定时器处理
      if (finished) finishOnce();
    });
  };

  return (
    <Animated.View
      style={[styles.root, { opacity: rootOpacity }]}
      onLayout={handleLayout}
    >
      {/* 全屏图片：cover 自适应比例，四周不留白 */}
      <Animated.Image
        source={require('../../assets/splash.png')}
        style={[StyleSheet.absoluteFill, { opacity: imageOpacity, transform: [{ scale: imageScale }] }]}
        resizeMode="cover"
        fadeDuration={0}
      />

      {/* 品牌字标放在画面下方的留白区，淡入出现 */}
      <View style={styles.wordmarkWrap} pointerEvents="none">
        <Animated.Text style={[styles.wordmark, { opacity: titleOpacity }]}>简爱</Animated.Text>
        <Animated.Text style={[styles.wordmarkSub, { opacity: titleOpacity }]}>Simple Love</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    // 与原生启动屏背景色一致：隐藏原生屏的一瞬间不会出现任何颜色断层
    backgroundColor: '#FFE1E9',
    zIndex: 999,
    elevation: 999,
  },
  wordmarkWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '16%',
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 8,
    color: colors.primaryDark,
  },
  wordmarkSub: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 3,
    color: colors.primary,
  },
});
