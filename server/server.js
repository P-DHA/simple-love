/**
 * 简爱 Simple Love - WebSocket 配对中转服务
 *
 * 功能：
 *  - 以 6 位数字配对码作为房间 ID，维护配对房间
 *  - 被观察者(watcher) 与 观察者(observer) 双向消息转发
 *  - 自动处理：加入房间、同角色顶号、断开连接、房间销毁、心跳保活、异常掉线
 *
 * 启动：npm start   （默认端口 8080，可用环境变量 PORT 覆盖）
 */

const os = require('os');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PAYLOAD = 32 * 1024 * 1024; // 单条消息上限 32MB（容纳相册照片 base64）

const ROLE_WATCHER = 'watcher'; // 被观察者
const ROLE_OBSERVER = 'observer'; // 观察者
const ROLES = [ROLE_WATCHER, ROLE_OBSERVER];

const wss = new WebSocket.Server({ port: PORT, maxPayload: MAX_PAYLOAD });

/** rooms: Map<配对码, { watcher: ws|null, observer: ws|null }> */
const rooms = new Map();

function log(...args) {
  console.log(`[${new Date().toLocaleString('zh-CN')}]`, ...args);
}

function isRole(v) {
  return ROLES.includes(v);
}

function isOpen(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

function send(ws, obj) {
  if (!isOpen(ws)) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    /* 忽略发送失败 */
  }
}

function peerOf(room, role) {
  return role === ROLE_WATCHER ? room.observer : room.watcher;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws._room = null;
  ws._role = null;
  const ip = (req && req.socket && req.socket.remoteAddress) || 'unknown';
  log('新连接', ip);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return; // 非 JSON 消息直接丢弃
    }
    if (!msg || typeof msg.type !== 'string') return;

    // 心跳
    if (msg.type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() });
      return;
    }

    // 加入房间
    if (msg.type === 'join') {
      const code = String(msg.room || '');
      const role = msg.role;
      if (!/^\d{6}$/.test(code)) {
        send(ws, { type: 'error', message: '配对码必须是6位数字' });
        return;
      }
      if (!isRole(role)) {
        send(ws, { type: 'error', message: '角色不合法' });
        return;
      }
      let room = rooms.get(code);
      if (!room) {
        room = { watcher: null, observer: null };
        rooms.set(code, room);
        log('创建房间', code);
      }
      // 同角色新设备接入 -> 顶掉旧连接
      const old = room[role];
      if (old && old !== ws && isOpen(old)) {
        send(old, { type: 'kicked', reason: '相同角色在其他设备重新连接' });
        try {
          old.close();
        } catch (e) {
          /* ignore */
        }
      }
      room[role] = ws;
      ws._room = code;
      ws._role = role;
      const peer = peerOf(room, role);
      send(ws, { type: 'joined', room: code, role, peerOnline: isOpen(peer) });
      if (isOpen(peer)) {
        send(peer, { type: 'peer_online', role });
      }
      log(`加入房间 ${code} 角色=${role} (${ip})`);
      return;
    }

    // ---- 转发类消息：frame / app / photo / stop ----
    const code = ws._room;
    const role = ws._role;
    if (!code || !role) {
      send(ws, { type: 'error', message: '请先加入房间(join)' });
      return;
    }
    const room = rooms.get(code);
    if (!room || room[role] !== ws) return;

    const peer = peerOf(room, role);
    if (!isOpen(peer)) return; // 对方不在线，直接丢弃

    const payload = { type: msg.type };
    if (msg.type === 'frame' && typeof msg.data === 'string') {
      payload.data = msg.data;
    } else if (msg.type === 'app') {
      payload.name = String(msg.name || '');
      if (msg.packageName) payload.packageName = String(msg.packageName);
    } else if (msg.type === 'photo' && typeof msg.data === 'string') {
      payload.data = msg.data;
      if (msg.width) payload.width = msg.width;
      if (msg.height) payload.height = msg.height;
      if (msg.name) payload.name = msg.name;
    } else if (msg.type === 'stop') {
      // 被观察者停止了屏幕共享
    } else {
      return; // 未知消息不转发
    }
    try {
      peer.send(JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
  });

  ws.on('close', () => {
    const code = ws._room;
    const role = ws._role;
    log('断开连接', ip, code || '-', role || '-');
    if (!code || !role) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room[role] === ws) {
      room[role] = null;
      const peer = peerOf(room, role);
      if (isOpen(peer)) {
        send(peer, { type: 'peer_offline', role });
      }
      if (!room.watcher && !room.observer) {
        rooms.delete(code);
        log('销毁房间', code);
      }
    }
  });

  ws.on('error', (err) => {
    log('连接错误', ip, err.message);
  });
});

// 心跳保活：30s 无响应则判定掉线并清理
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch (e) {
        /* ignore */
      }
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      /* ignore */
    }
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

wss.on('listening', () => {
  log(`简爱 Simple Love WebSocket 服务已启动: ws://0.0.0.0:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        log(`局域网地址: ws://${net.address}:${PORT}  (手机与本电脑连同一WiFi时可用)`);
      }
    }
  }
});
