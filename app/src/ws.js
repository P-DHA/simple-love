// 简爱 Simple Love - WebSocket 封装
export function connectSocket(url, handlers = {}) {
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    if (handlers.onError) handlers.onError(e);
    return null;
  }
  ws.onopen = () => {
    if (handlers.onOpen) handlers.onOpen();
  };
  ws.onmessage = (ev) => {
    let msg = null;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (msg && handlers.onMessage) handlers.onMessage(msg);
  };
  ws.onerror = () => {
    if (handlers.onError) handlers.onError(new Error('连接出错'));
  };
  ws.onclose = (ev) => {
    if (handlers.onClose) handlers.onClose(ev);
  };
  return ws;
}

export function sendJson(ws, obj) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}
