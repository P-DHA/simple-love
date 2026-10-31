import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// 本地原生模块（modules/screen-capture）：屏幕捕获 + 前台应用检测
import ScreenCapture from '../../modules/screen-capture';
import { genPairCode, loadPairCode, loadServerUrl, normalizeUrl, savePairCode, saveServerUrl } from '../config';
import { connectSocket, sendJson } from '../ws';
import { btnText, btnTextGhost, card, colors, container, ghostButton, hintText, input, primaryButton, sectionTitle } from '../theme';

const FRAME_INTERVAL_MS = 700; // 屏幕帧发送间隔（约1.4帧/秒，兼顾流量与流畅）
const APP_INTERVAL_MS = 2000; // 前台应用检测间隔
const MAX_PHOTO_BASE64 = 12_000_000; // 单张照片 base64 上限，约9MB原图

export default function WatcherScreen({ onBack }) {
  const [serverUrl, setServerUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | connecting | online | offline
  const [code, setCode] = useState('');
  const [hasUsage, setHasUsage] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [currentApp, setCurrentApp] = useState('未知');
  const [statusText, setStatusText] = useState('');
  const [sentPhotos, setSentPhotos] = useState(0);

  const wsRef = useRef(null);
  const codeRef = useRef('');
  const pendingCodeRef = useRef(''); // 已生成但尚未确认连接的配对码，仅连接成功后才会展示
  const joinTimerRef = useRef(null);
  const timersRef = useRef([]);
  const capturingRef = useRef(false);
  const onlineRef = useRef(false);
  const connectingRef = useRef(false);
  const lastAppRef = useRef('');

  useEffect(() => {
    loadServerUrl().then(setServerUrl);
    checkUsageAccess();
    // 若前台残留了上次未停止的捕获服务，同步UI状态
    try {
      if (ScreenCapture.isCapturing()) {
        capturingRef.current = true;
        setCapturing(true);
      }
    } catch (e) {
      /* ignore */
    }
    return () => {
      fullCleanup(); // 离开页面：立刻断开并停止一切采集
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkUsageAccess() {
    try {
      setHasUsage(!!ScreenCapture.hasUsageAccess());
    } catch (e) {
      /* ignore */
    }
  }

  function stopTimers() {
    timersRef.current.forEach((t) => clearInterval(t));
    timersRef.current = [];
  }

  function clearJoinTimer() {
    if (joinTimerRef.current) {
      clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  }

  function closeSocket() {
    clearJoinTimer();
    stopTimers();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        /* ignore */
      }
      wsRef.current = null;
    }
    onlineRef.current = false;
    connectingRef.current = false;
  }

  function fullCleanup() {
    try {
      sendJson(wsRef.current, { type: 'stop' });
    } catch (e) {
      /* ignore */
    }
    closeSocket();
    try {
      ScreenCapture.stopCapture();
    } catch (e) {
      /* ignore */
    }
    capturingRef.current = false;
    setCapturing(false);
    lastAppRef.current = '';
  }

  function handleServerMessage(m) {
    switch (m.type) {
      case 'joined': {
        onlineRef.current = true;
        connectingRef.current = false;
        clearJoinTimer();
        // 只有服务器确认加入房间后，才把配对码展示给用户并持久化
        const c = pendingCodeRef.current;
        codeRef.current = c;
        setCode(c);
        savePairCode(c);
        setPhase('online');
        setStatusText(m.peerOnline ? '已连接，观察者在线' : '已连接，等待观察者上线…');
        startTimers();
        break;
      }
      case 'error':
        setStatusText('服务器错误：' + (m.message || '未知'));
        break;
      case 'peer_online':
        setStatusText('观察者已上线，正在共享');
        break;
      case 'peer_offline':
        setStatusText('观察者已离线，数据暂停发送');
        break;
      case 'kicked':
        onlineRef.current = false;
        setStatusText('本角色被新设备接管，请重新连接');
        break;
      default:
        break;
    }
  }

  function startTimers() {
    stopTimers();
    const timers = [];

    // 1) 屏幕帧采集上传
    timers.push(
      setInterval(async () => {
        if (!capturingRef.current || !onlineRef.current) return;
        try {
          const b64 = await ScreenCapture.captureFrame();
          if (b64) sendJson(wsRef.current, { type: 'frame', data: b64 });
        } catch (e) {
          /* ignore */
        }
      }, FRAME_INTERVAL_MS)
    );

    // 2) 前台应用检测
    timers.push(
      setInterval(async () => {
        if (!onlineRef.current) return;
        try {
          const app = await ScreenCapture.getForegroundApp();
          if (app && app.appName) {
            if (app.appName !== lastAppRef.current) {
              lastAppRef.current = app.appName;
              setCurrentApp(app.appName);
              sendJson(wsRef.current, {
                type: 'app',
                name: app.appName,
                packageName: app.packageName,
              });
            }
          } else if (lastAppRef.current !== '') {
            lastAppRef.current = '';
            setCurrentApp('未获取到（检查使用情况权限）');
            sendJson(wsRef.current, { type: 'app', name: '未获取到（检查使用情况权限）' });
          }
        } catch (e) {
          /* ignore */
        }
      }, APP_INTERVAL_MS)
    );

    // 3) 使用情况权限状态复查
    timers.push(setInterval(checkUsageAccess, 4000));

    timersRef.current = timers;
  }

  function startSession() {
    const url = normalizeUrl(serverUrl);
    if (!url || !/^wss?:\/\//.test(url)) {
      Alert.alert('提示', '请先填写正确的服务器地址\n例如：ws://192.168.1.5:8080');
      return;
    }
    saveServerUrl(url);

    closeSocket();

    // 配对码先在内存中生成，连接成功（收到 joined）后才展示并保存；
    // 这样服务器不可达时不会出现一个“看似可用”的无效配对码
    pendingCodeRef.current = genPairCode();
    codeRef.current = '';
    setCode('');

    setPhase('connecting');
    connectingRef.current = true;
    setStatusText('正在连接服务器…');

    const ws = connectSocket(url, {
      onOpen: () => {
        sendJson(ws, { type: 'join', role: 'watcher', room: pendingCodeRef.current });
      },
      onMessage: (m) => handleServerMessage(m),
      onError: () => {},
      onClose: () => {
        clearJoinTimer();
        if (onlineRef.current) {
          onlineRef.current = false;
          setPhase('offline');
          setStatusText('与服务器断开，可点击“重新连接”');
        } else {
          // 从未连接成功：丢弃本次配对码，界面上不展示
          pendingCodeRef.current = '';
          codeRef.current = '';
          setCode('');
          if (connectingRef.current) {
            connectingRef.current = false;
            setPhase('offline');
            setStatusText('连接失败：请检查服务器是否启动、地址是否正确、是否同一网络');
          }
        }
      },
    });
    wsRef.current = ws;

    // 服务器可达但迟迟不返回 joined 时，超时判定为连接失败
    joinTimerRef.current = setTimeout(() => {
      if (connectingRef.current && !onlineRef.current) {
        connectingRef.current = false;
        pendingCodeRef.current = '';
        setCode('');
        setPhase('offline');
        setStatusText('连接超时：服务器未响应，请检查地址与服务状态');
        closeSocket();
      }
    }, 15000);
  }

  function reconnect() {
    pendingCodeRef.current = '';
    codeRef.current = '';
    setCode('');
    startSession();
  }

  async function toggleCapture() {
    if (capturingRef.current) {
      // 停止屏幕捕获
      capturingRef.current = false;
      setCapturing(false);
      try {
        ScreenCapture.stopCapture();
      } catch (e) {
        /* ignore */
      }
      sendJson(wsRef.current, { type: 'stop' });
      return;
    }
    try {
      const ok = await ScreenCapture.startCapture();
      if (ok) {
        capturingRef.current = true;
        setCapturing(true);
      }
    } catch (e) {
      Alert.alert('屏幕捕获失败', String((e && e.message) || e));
    }
  }

  function openUsageSettings() {
    try {
      ScreenCapture.openUsageAccessSettings();
    } catch (e) {
      /* ignore */
    }
  }

  async function pickPhotos() {
    if (!onlineRef.current) {
      Alert.alert('提示', '请先连接服务器后再发送照片');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm || !perm.granted) {
      Alert.alert('需要相册权限', '请在系统设置中手动允许访问照片与视频');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.6,
      base64: true,
    });
    if (!res || res.canceled || !Array.isArray(res.assets)) return;

    let n = 0;
    let skipped = 0;
    for (const a of res.assets) {
      if (!a.base64) {
        skipped++;
        continue;
      }
      if (a.base64.length > MAX_PHOTO_BASE64) {
        skipped++;
        continue;
      }
      sendJson(wsRef.current, {
        type: 'photo',
        data: a.base64,
        width: a.width,
        height: a.height,
        name: a.fileName || `photo_${Date.now()}.jpg`,
      });
      n++;
    }
    setSentPhotos((x) => x + n);
    Alert.alert('已发送', `已向观察者发送 ${n} 张照片` + (skipped ? `，跳过 ${skipped} 张（过大或读取失败）` : ''));
  }

  function disconnectAll() {
    fullCleanup();
    setPhase('idle');
    setCode('');
    codeRef.current = '';
    pendingCodeRef.current = '';
    setStatusText('');
    setSentPhotos(0);
    setCurrentApp('未知');
  }

  const connected = phase === 'online';
  const busy = phase === 'connecting';

  return (
    <ScrollView style={container} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹ 返回首页</Text>
      </TouchableOpacity>

      <Text style={styles.title}>被观察者</Text>

      {/* 服务器地址 */}
      <View style={card}>
        <Text style={sectionTitle}>① 后端服务器地址</Text>
        <TextInput
          style={input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="ws://192.168.1.5:8080 或 wss://xxxx.ngrok-free.app"
          placeholderTextColor={colors.sub}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={hintText}>同一WiFi填电脑局域网地址；远程访问用 ngrok 的 wss:// 地址。</Text>
      </View>

      {/* 配对码 */}
      <View style={card}>
        <Text style={sectionTitle}>② 配对码</Text>
        {code === '' ? (
          <TouchableOpacity
            style={[primaryButton, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={startSession}
          >
            <Text style={btnText}>{busy ? '连接中…' : '生成配对码并连接'}</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={styles.code}>{code}</Text>
            <Text style={hintText}>把配对码告诉观察者，对方输入即可连接到你。</Text>
          </View>
        )}
        {statusText !== '' && <Text style={styles.status}>{statusText}</Text>}
      </View>

      {/* 权限区 */}
      <View style={card}>
        <Text style={sectionTitle}>③ 权限引导（全部手动开启）</Text>

        <View style={styles.permRow}>
          <Text style={[styles.permDot, { color: hasUsage ? colors.ok : colors.warn }]}>
            {hasUsage ? '●' : '○'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.permName}>使用情况访问权限 {hasUsage ? '（已开启）' : '（未开启）'}</Text>
            <Text style={hintText}>用于读取当前前台应用名称，必须到系统设置手动开启。</Text>
          </View>
          <TouchableOpacity style={ghostButton} onPress={openUsageSettings}>
            <Text style={btnTextGhost}>去设置</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.permRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.permDot, { color: capturing ? colors.ok : colors.warn }]}>
            {capturing ? '●' : '○'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.permName}>屏幕实时画面 {capturing ? '（捕获中）' : '（未开启）'}</Text>
            <Text style={hintText}>点击后弹出系统屏幕录制弹窗，需要你手动点“立即开始”。</Text>
          </View>
          <TouchableOpacity style={ghostButton} onPress={toggleCapture}>
            <Text style={btnTextGhost}>{capturing ? '停止捕获' : '开启捕获'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 相册 */}
      <View style={card}>
        <Text style={sectionTitle}>④ 相册照片（手动选择发送）</Text>
        <TouchableOpacity style={ghostButton} onPress={pickPhotos}>
          <Text style={btnTextGhost}>选择照片发送给观察者</Text>
        </TouchableOpacity>
        <Text style={[hintText, { marginTop: 8 }]}>本次连接已发送 {sentPhotos} 张。App 不会自动上传任何照片。</Text>
      </View>

      {/* 当前应用 */}
      <View style={card}>
        <Text style={sectionTitle}>当前正在使用的应用</Text>
        <Text style={styles.appName}>{currentApp}</Text>
      </View>

      {/* 断开 */}
      <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectAll}>
        <Text style={btnText}>断开连接（停止采集并清空缓存）</Text>
      </TouchableOpacity>

      {phase === 'offline' && code !== '' && (
        <TouchableOpacity style={[ghostButton, { marginTop: 12 }]} onPress={reconnect}>
          <Text style={btnTextGhost}>重新连接（新配对码）</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.privacyFooter}>
        被观察者可随时断开；断开后立即停止屏幕捕获、停止读取应用信息、停止上传并清空缓存。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 16,
    marginBottom: 4,
  },
  backText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 14,
  },
  code: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: 6,
  },
  status: {
    marginTop: 10,
    fontSize: 13,
    color: colors.primaryDark,
    fontWeight: '700',
    textAlign: 'center',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  permDot: {
    fontSize: 16,
    marginRight: 10,
  },
  permName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  disconnectBtn: {
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  privacyFooter: {
    marginTop: 14,
    fontSize: 12,
    color: colors.sub,
    lineHeight: 19,
    textAlign: 'center',
  },
});
