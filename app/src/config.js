// 简爱 Simple Love - 服务器地址配置（持久化到 AsyncStorage）
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SERVER = 'sl_server_url';
const KEY_PAIR_CODE = 'sl_pair_code';

export async function loadServerUrl() {
  try {
    return (await AsyncStorage.getItem(KEY_SERVER)) || '';
  } catch (e) {
    return '';
  }
}

export async function saveServerUrl(url) {
  try {
    await AsyncStorage.setItem(KEY_SERVER, url);
  } catch (e) {
    /* ignore */
  }
}

export async function loadPairCode() {
  try {
    return (await AsyncStorage.getItem(KEY_PAIR_CODE)) || '';
  } catch (e) {
    return '';
  }
}

export async function savePairCode(code) {
  try {
    await AsyncStorage.setItem(KEY_PAIR_CODE, code);
  } catch (e) {
    /* ignore */
  }
}

/**
 * 归一化服务器地址：
 *  - 192.168.1.5:8080        -> ws://192.168.1.5:8080
 *  - http://xxx.ngrok.io     -> ws://xxx.ngrok.io
 *  - https://xxx.ngrok.io    -> wss://xxx.ngrok.io
 *  - 已带 ws:// 或 wss://     -> 原样保留
 */
export function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) {
    u = u.replace(/^https:\/\//i, 'wss://');
  } else if (/^http:\/\//i.test(u)) {
    u = u.replace(/^http:\/\//i, 'ws://');
  } else if (!/^wss?:\/\//i.test(u)) {
    u = 'ws://' + u;
  }
  u = u.replace(/\/+$/, '');
  return u;
}

export function genPairCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
