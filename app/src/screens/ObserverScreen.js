import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { loadPairCode, loadServerUrl, normalizeUrl, savePairCode, saveServerUrl } from '../config';
import { connectSocket, sendJson } from '../ws';
import { btnText, card, colors, container, input, sectionTitle } from '../theme';

const MAX_PHOTOS = 50; // 最多保留最近50张照片

export default function ObserverScreen({ onBack }) {
  const [serverUrl, setServerUrl] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [frame, setFrame] = useState(null); // 最新屏幕画面 data uri
  const [appInfo, setAppInfo] = useState(null); // {name, packageName}
  const [photos, setPhotos] = useState([]); // [{id, uri, name, ts}]
  const [viewing, setViewing] = useState(null); // 全屏查看的照片
  const [stopNotice, setStopNotice] = useState(false);

  const wsRef = useRef(null);
  const onlineRef = useRef(false);

  useEffect(() => {
    loadServerUrl().then(setServerUrl);
    loadPairCode().then((c) => c && setCodeInput(c));
    return () => {
      // 离开页面：断开并清空所有接收内容
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          /* ignore */
        }
        wsRef.current = null;
      }
      onlineRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearReceived() {
    setFrame(null);
    setAppInfo(null);
    setPhotos([]);
    setViewing(null);
    setStopNotice(false);
  }

  function handleMessage(m) {
    switch (m.type) {
      case 'joined':
        onlineRef.current = true;
        setConnected(true);
        setPeerOnline(!!m.peerOnline);
        setStatusText(m.peerOnline ? '已连接，被观察者在线' : '已连接，等待被观察者上线…');
        break;
      case 'error':
        setStatusText('服务器错误：' + (m.message || '未知'));
        break;
      case 'peer_online':
        setPeerOnline(true);
        setStatusText('被观察者已上线');
        break;
      case 'peer_offline':
        setPeerOnline(false);
        setStatusText('被观察者已离线');
        break;
      case 'frame':
        if (m.data) {
          setStopNotice(false);
          setFrame('data:image/jpeg;base64,' + m.data);
        }
        break;
      case 'app':
        setAppInfo({ name: m.name || '', packageName: m.packageName || '' });
        break;
      case 'photo':
        if (m.data) {
          setPhotos((prev) => {
            const item = {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              uri: 'data:image/jpeg;base64,' + m.data,
              name: m.name || 'photo',
              ts: Date.now(),
            };
            const next = [...prev, item];
            return next.length > MAX_PHOTOS ? next.slice(next.length - MAX_PHOTOS) : next;
          });
        }
        break;
      case 'stop':
        // 被观察者停止了屏幕共享：清空画面与应用名
        setStopNotice(true);
        setFrame(null);
        setAppInfo(null);
        break;
      case 'kicked':
        onlineRef.current = false;
        setConnected(false);
        setStatusText('本角色被新设备接管');
        break;
      default:
        break;
    }
  }

  function connect() {
    const url = normalizeUrl(serverUrl);
    const code = (codeInput || '').trim();
    if (!url || !/^wss?:\/\//.test(url)) {
      Alert.alert('提示', '请先填写正确的服务器地址\n例如：ws://192.168.1.5:8080');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('提示', '请输入6位数字配对码');
      return;
    }
    saveServerUrl(url);
    savePairCode(code);

    // 若已有连接，先断开
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        /* ignore */
      }
      wsRef.current = null;
      onlineRef.current = false;
    }
    clearReceived();
    setStatusText('正在连接…');

    const ws = connectSocket(url, {
      onOpen: () => {
        sendJson(ws, { type: 'join', role: 'observer', room: code });
      },
      onMessage: (m) => handleMessage(m),
      onError: () => {},
      onClose: () => {
        if (onlineRef.current) {
          onlineRef.current = false;
          setConnected(false);
          setPeerOnline(false);
          setStatusText('与服务器断开');
        } else {
          setConnected(false);
          setStatusText('连接失败：请检查服务器是否启动、地址是否正确、是否同一网络');
        }
      },
    });
    wsRef.current = ws;
  }

  function disconnect() {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        /* ignore */
      }
      wsRef.current = null;
    }
    onlineRef.current = false;
    setConnected(false);
    setPeerOnline(false);
    setStatusText('');
    clearReceived(); // 断开后清空所有接收画面和图片
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={container}
        contentContainerStyle={{ paddingBottom: 40 }}
        scrollEnabled={!viewing}
      >
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 返回首页</Text>
        </TouchableOpacity>

        <Text style={styles.title}>观察者</Text>

        {/* 连接区 */}
        <View style={card}>
          <Text style={sectionTitle}>① 服务器地址</Text>
          <TextInput
            style={input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="ws://192.168.1.5:8080 或 wss://xxxx.ngrok-free.app"
            placeholderTextColor={colors.sub}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[sectionTitle, { marginTop: 14 }]}>② 配对码</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={[input, { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: 6, textAlign: 'center' }]}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.sub}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity style={styles.connectBtn} onPress={connected ? disconnect : connect}>
              <Text style={btnText}>{connected ? '断开' : '连接'}</Text>
            </TouchableOpacity>
          </View>
          {statusText !== '' && <Text style={styles.status}>{statusText}</Text>}
          <Text style={styles.dotRow}>
            <Text style={{ color: connected ? colors.ok : colors.warn }}>● 服务</Text>
            <Text>   </Text>
            <Text style={{ color: peerOnline ? colors.ok : colors.warn }}>● 被观察者</Text>
          </Text>
        </View>

        {/* 当前应用 */}
        <View style={card}>
          <Text style={sectionTitle}>当前正在使用的应用</Text>
          <Text style={styles.appName}>{appInfo && appInfo.name ? appInfo.name : '暂无信息'}</Text>
          {stopNotice && <Text style={styles.stopNotice}>对方已停止屏幕共享</Text>}
        </View>

        {/* 实时屏幕 */}
        <View style={[card, { padding: 8 }]}>
          <Text style={[sectionTitle, { marginLeft: 8 }]}>实时屏幕画面</Text>
          <View style={styles.frameBox}>
            {frame ? (
              <Image source={{ uri: frame }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
            ) : (
              <Text style={styles.framePlaceholder}>
                {peerOnline ? '等待画面…（若长时间无画面见排查清单）' : '被观察者未上线'}
              </Text>
            )}
          </View>
        </View>

        {/* 相册 */}
        <View style={[card, { padding: 8 }]}>
          <Text style={[sectionTitle, { marginLeft: 8 }]}>收到的相册照片（{photos.length}）</Text>
          {photos.length === 0 ? (
            <Text style={styles.framePlaceholder}>被观察者主动发送的照片会显示在这里</Text>
          ) : (
            <FlatList
              data={photos}
              keyExtractor={(item) => item.id}
              numColumns={3}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.thumb} onPress={() => setViewing(item)}>
                  <Image source={{ uri: item.uri }} style={styles.thumbImg} resizeMode="cover" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
          <Text style={btnText}>断开连接（清空所有画面与图片）</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 照片全屏查看 */}
      <Modal visible={!!viewing} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setViewing(null)}>
          {viewing && (
            <Image source={{ uri: viewing.uri }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
          )}
          <Text style={styles.modalHint}>点击任意位置关闭</Text>
        </TouchableOpacity>
      </Modal>
    </View>
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
  connectBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginLeft: 10,
    alignItems: 'center',
  },
  status: {
    marginTop: 10,
    fontSize: 13,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  dotRow: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  stopNotice: {
    marginTop: 8,
    color: colors.warn,
    fontSize: 13,
    fontWeight: '700',
  },
  frameBox: {
    height: 340,
    backgroundColor: '#2B2028',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  framePlaceholder: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  thumb: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 3,
  },
  thumbImg: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#EEE',
  },
  disconnectBtn: {
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: 12,
  },
  modalHint: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 12,
    paddingBottom: 20,
  },
});
