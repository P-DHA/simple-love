import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, container } from '../theme';

// 隐私声明原文（首页必须展示）
const PRIVACY_TEXT =
  '本应用仅适用于双方完全知情、自愿授权使用。\n' +
  '被观察者可随时断开连接、关闭全部权限。\n' +
  '禁止未经他人许可监控手机，私自监控属于违法行为。\n' +
  '所有权限必须由被观察者手动主动授予，App 不能静默获取任何手机数据。';

export default function HomeScreen({ onGoWatcher, onGoObserver }) {
  return (
    <ScrollView style={container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.heart}>❤</Text>
      <Text style={styles.title}>简爱</Text>
      <Text style={styles.subtitle}>Simple Love</Text>

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>隐私声明</Text>
        <Text style={styles.privacyText}>{PRIVACY_TEXT}</Text>
      </View>

      <TouchableOpacity style={styles.roleBtn} activeOpacity={0.85} onPress={onGoWatcher}>
        <Text style={styles.roleBtnTitle}>我要做被观察者</Text>
        <Text style={styles.roleBtnSub}>生成配对码 · 授权屏幕/相册 · 推送画面</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.roleBtn, styles.roleBtnAlt]} activeOpacity={0.85} onPress={onGoObserver}>
        <Text style={[styles.roleBtnTitle, { color: colors.primaryDark }]}>我要做观察者</Text>
        <Text style={[styles.roleBtnSub, { color: colors.sub }]}>输入配对码 · 实时画面 · 当前应用</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>仅限双方知情自愿使用 · 请务必遵守当地法律法规</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heart: {
    textAlign: 'center',
    fontSize: 40,
    color: colors.primary,
    marginTop: 20,
  },
  title: {
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '900',
    color: colors.text,
    marginTop: 4,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: 18,
  },
  privacyCard: {
    backgroundColor: '#FFF0F2',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  privacyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 10,
  },
  privacyText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.danger,
    lineHeight: 28,
    textAlign: 'center',
  },
  roleBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 26,
    alignItems: 'center',
    marginBottom: 16,
  },
  roleBtnAlt: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  roleBtnTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  roleBtnSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 6,
  },
  footer: {
    textAlign: 'center',
    color: colors.sub,
    fontSize: 12,
    marginTop: 8,
  },
});
