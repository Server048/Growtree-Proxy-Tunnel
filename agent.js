#!/usr/bin/env node

import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { T, frame, parseFrame, parseAddr, encodeAddr } from './protocol.js';
import { loadEnv } from './env.js';

const HIGH = 1024 * 1024;
const LOW = 256 * 1024;



// ==========================================
// G R O W T R E E  |  TERMINAL INTERFACE
// ==========================================

const COLOR_ENABLED = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const UI = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
};

function paint(color, value) {
  const text = String(value);
  return COLOR_ENABLED ? `${color}${text}${UI.reset}` : text;
}

function clearTerminal() {
  if (process.stdout.isTTY) process.stdout.write('\x1B[2J\x1B[H');
}

const BOX_WIDTH = 54;
function centered(value, width = BOX_WIDTH) {
  const text = String(value);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(left)}${text}`.padEnd(width).slice(0, width);
}

function showBanner() {
  const border = `  ╔${'═'.repeat(BOX_WIDTH + 2)}╗`;
  const blank = `  ║ ${' '.repeat(BOX_WIDTH)} ║`;
  const row = (text, color = UI.cyan) =>
    console.log(paint(color, `  ║ ${centered(text)} ║`));

  console.log(paint(UI.cyan + UI.bright, border));
  console.log(paint(UI.cyan, blank));
  row('G R O W T R E E', UI.green + UI.bright);
  console.log(paint(UI.cyan, blank));
  row('PROXY TUNNEL  /  SOCKS5', UI.white + UI.bright);
  row('PRIVATE DEVICE AGENT', UI.cyan);
  row('TCP  •  UDP  •  WEBSOCKET', UI.gray);
  console.log(paint(UI.cyan, blank));
  console.log(paint(UI.cyan + UI.bright, border));
  console.log(`  ${paint(UI.gray, 'GrowTree Proxy Service')}  ${paint(UI.dim, '│')}  ${paint(UI.gray, 'v1.0.0')}`);
  console.log(`  ${paint(UI.gray, '────────────────────────────────────────────────────────────')}\n`);
}

function showSection(title) {
  const label = ` ${String(title).toUpperCase()} `;
  const remaining = Math.max(0, 54 - label.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  console.log(`\n  ${paint(UI.cyan + UI.bright, `┌${'─'.repeat(left)}${label}${'─'.repeat(right)}┐`)}`);
}

function statusLine(kind, message) {
  const styles = {
    success: [UI.green, '✔'],
    error: [UI.red, '✖'],
    warning: [UI.yellow, '⚠'],
    info: [UI.cyan, '›'],
    pending: [UI.blue, '◌'],
  };
  const [color, icon] = styles[kind] || styles.info;
  console.log(`  ${paint(UI.gray, new Date().toLocaleTimeString('id-ID', { hour12: false }))}  ${paint(color + UI.bright, icon)}  ${message}`);
}

const success = (message) => statusLine('success', message);
const error = (message) => statusLine('error', message);
const warning = (message) => statusLine('warning', message);
const info = (message) => statusLine('info', message);
const pending = (message) => statusLine('pending', message);

function defaultLogger(...args) {
  statusLine('info', args.map((value) => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(' '));
}

const blocked = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(a, p, 'ipv6');

function isBlocked(ip) {
  const fam = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
  if (fam === 'ipv6') {
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return blocked.check(m[1], 'ipv4');
  }
  return blocked.check(ip, fam);
}

async function resolveSafe(host, allowPrivate) {
  let list;
  if (net.isIP(host)) {
    list = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
  } else {
    try {
      list = await dns.promises.lookup(host, { all: true, verbatim: true });
    } catch {
      throw Object.assign(new Error('dns gagal'), { socks: 4 });
    }
  }
  const ok = allowPrivate ? list : list.filter((x) => !isBlocked(x.address));
  if (!ok.length) throw Object.assign(new Error('Tujuan diblokir'), { socks: 2 });
  ok.sort((a, b) => a.family - b.family);
  return ok[0];
}

const socksCode = (err) => {
  switch (err?.code) {
    case 'ECONNREFUSED': return 5;
    case 'ENETUNREACH': return 3;
    case 'EHOSTUNREACH': case 'ETIMEDOUT': case 'ENOTFOUND': return 4;
    default: return err?.socks || 1;
  }
};

export function startAgent(userCfg = {}) {
  const cfg = {
    url: '',
    token: '',
    onFatal: null,
    onReady: null,
    allowPrivate: false,
    maxStreams: 1024,
    log: defaultLogger,
    ...userCfg,
  };
  if (!cfg.url || !/^wss?:\/\//.test(cfg.url)) throw new Error('SERVER_URL harus berawalan wss:// (atau ws://)');
  if (!/^mk_[A-Za-z0-9_-]{20,100}$/.test(cfg.token)) throw new Error('Token akun tidak valid (harus berawalan mk_…)');
  if (typeof WebSocket === 'undefined') throw new Error('Butuh Node 22+ (WebSocket bawaan). Di Termux: pkg upgrade nodejs');
  const log = cfg.log;
  const logStatus = (kind, ...args) => {
    if (userCfg.log) log(...args);
    else statusLine(kind, args.map((value) => value instanceof Error ? value.message : String(value)).join(' '));
  };

  let ws = null;
  let startedOk = 0;
  let stopped = false;
  let backoff = 1000;
  let lastPing = 0;
  let watchdog = null;
  let retryTimer = null;
  const streams = new Map();
  const udps = new Map();
  const paused = new Set();

  const send = (type, id, payload) => {
    if (ws && ws.readyState === 1) ws.send(frame(type, id, payload));
  };

  let drainTimer = null;
  const watchDrain = () => {
    if (drainTimer) return;
    drainTimer = setInterval(() => {
      if (!ws || ws.bufferedAmount < LOW) {
        for (const s of paused) if (!s.destroyed) s.resume();
        paused.clear();
      }
      if (!paused.size) {
        clearInterval(drainTimer);
        drainTimer = null;
      }
    }, 25);
  };

  function closeAll() {
    for (const s of streams.values()) s.destroy();
    streams.clear();
    for (const u of udps.values()) {
      u.s4?.close();
      u.s6?.close();
    }
    udps.clear();
    paused.clear();
  }

  async function onTcpOpen(id, payload) {
    if (payload.length < 3) return;
    const port = payload.readUInt16BE(0);
    const host = payload.toString('utf8', 2);
    if (streams.size >= cfg.maxStreams) return send(T.TCP_FAIL, id, Buffer.from([1]));
    streams.set(id, null);
    let target;
    try {
      target = await resolveSafe(host, cfg.allowPrivate);
    } catch (e) {
      streams.delete(id);
      return send(T.TCP_FAIL, id, Buffer.from([socksCode(e)]));
    }
    if (!streams.has(id)) return;
    const s = net.connect({ host: target.address, port, allowHalfOpen: true });
    s.setNoDelay(true);
    s.setKeepAlive(true, 30_000);
    s.setTimeout(20_000);
    let opened = false;
    s.on('connect', () => {
      opened = true;
      s.setTimeout(0);
      if (!streams.has(id)) return s.destroy();
      streams.set(id, s);
      send(T.TCP_OK, id);
    });
    s.on('data', (d) => {
      send(T.TCP_DATA, id, d);
      if (ws && ws.bufferedAmount > HIGH) {
        s.pause();
        paused.add(s);
        watchDrain();
      }
    });
    s.on('end', () => send(T.TCP_END, id));
    s.on('timeout', () => s.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    s.on('error', (err) => {
      if (!opened && streams.has(id)) {
        streams.delete(id);
        send(T.TCP_FAIL, id, Buffer.from([socksCode(err)]));
      }
    });
    s.on('close', () => {
      paused.delete(s);
      if (opened && streams.get(id) === s) {
        streams.delete(id);
        send(T.TCP_CLOSE, id);
      } else if (!opened) {
        streams.delete(id);
      }
    });
  }

  function udpSocket(u, id, family) {
    const key = family === 6 ? 's6' : 's4';
    if (u[key]) return u[key];
    const sock = dgram.createSocket(family === 6 ? 'udp6' : 'udp4');
    sock.on('error', (e) => log(`udp${family} error:`, e.message));
    sock.on('message', (msg, rinfo) => {
      const fam = net.isIPv6(rinfo.address) ? 6 : 4;
      let host = rinfo.address;
      let f = fam;
      const m = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
      if (m) {
        host = m[1];
        f = 4;
      }
      send(T.UDP_RECV, id, Buffer.concat([encodeAddr(host, rinfo.port, f), msg]));
    });
    sock.bind(0);
    u[key] = sock;
    return sock;
  }

  async function onUdpSend(id, payload) {
    const u = udps.get(id);
    if (!u) return;
    const a = parseAddr(payload);
    if (!a) return;
    let target;
    const now = Date.now();
    const cached = u.dns.get(a.host);
    if (cached && cached.exp > now) {
      target = cached.t;
    } else {
      try {
        target = await resolveSafe(a.host, cfg.allowPrivate);
      } catch {
        return;
      }
      u.dns.set(a.host, { t: target, exp: now + 60_000 });
    }
    if (!udps.has(id)) return;
    udpSocket(u, id, target.family).send(a.rest, a.port, target.address);
  }

  function onFrame(buf) {
    const f = parseFrame(buf);
    if (!f) return;
    switch (f.type) {
      case T.TCP_OPEN: onTcpOpen(f.id, f.payload); break;
      case T.TCP_DATA: {
        const s = streams.get(f.id);
        if (s && !s.destroyed && !s.write(f.payload)) {
          send(T.TCP_PAUSE, f.id);
          s.once('drain', () => send(T.TCP_RESUME, f.id));
        }
        break;
      }
      case T.TCP_END: streams.get(f.id)?.end(); break;
      case T.TCP_CLOSE: {
        const s = streams.get(f.id);
        streams.delete(f.id);
        s?.destroy();
        break;
      }
      case T.TCP_PAUSE: {
        const s = streams.get(f.id);
        if (s) {
          s.pause();
          s.remotePaused = true;
        }
        break;
      }
      case T.TCP_RESUME: {
        const s = streams.get(f.id);
        if (s) {
          s.remotePaused = false;
          if (!paused.has(s)) s.resume();
        }
        break;
      }
      case T.UDP_OPEN: udps.set(f.id, { s4: null, s6: null, dns: new Map() }); break;
      case T.UDP_SEND: onUdpSend(f.id, f.payload); break;
      case T.UDP_CLOSE: {
        const u = udps.get(f.id);
        udps.delete(f.id);
        u?.s4?.close();
        u?.s6?.close();
        break;
      }
      default:
    }
  }

  function connect() {
    if (stopped) return;
    logStatus('pending', 'Menghubungkan ke server proxy...');
    let sock;
    try {
      sock = new WebSocket(cfg.url);
    } catch (e) {
      logStatus('error', 'URL server tidak valid:', e.message);
      return;
    }
    ws = sock;
    sock.binaryType = 'arraybuffer';
    sock.onopen = () => {
      logStatus('info', 'WebSocket tersambung; mengautentikasi akun...');
      sock.send(JSON.stringify({ t: 'hello', token: cfg.token }));
    };
    sock.onmessage = (ev) => {
      lastPing = Date.now();
      if (typeof ev.data === 'string') {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.t === 'ping') sock.send('{"t":"pong"}');
        else if (m.t === 'denied') logStatus('error', `Autentikasi ditolak: ${String(m.reason || 'akses ditolak').slice(0, 120)}`);
        else if (m.t === 'ready') {
          logStatus('success', `Akun ${String(m.name || 'GrowTree').slice(0, 40)} berhasil terhubung.`);
          logStatus('success', 'Proxy tunnel aktif — trafik keluar melalui jaringan perangkat ini.');
          logStatus('info', 'Mode SOCKS5 siap digunakan (TCP / UDP).');
          startedOk = Date.now();
          cfg.onReady?.(m.name);
        }
        return;
      }
      onFrame(Buffer.from(ev.data));
    };
    sock.onerror = () => {};
    sock.onclose = (ev) => {
      if (ws === sock) ws = null;
      closeAll();
      clearInterval(watchdog);
      if (stopped) return;
      if (ev.code === 1008 || ev.code === 4001) {
        stopped = true;
        const why = ev.code === 1008 ? 'Token tidak valid / ditolak' : 'akun ini tersambung dari perangkat lain';
        logStatus('error', `Koneksi dihentikan: ${why}`);
        cfg.onFatal?.(why);
        return;
      }
      if (startedOk && Date.now() - startedOk > 30_000) backoff = 1000;
      startedOk = 0;
      logStatus('warning', `Koneksi terputus (kode ${ev.code}); mencoba ulang dalam ${Math.round(backoff / 1000)} detik.`);
      retryTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
    lastPing = Date.now();
    clearInterval(watchdog);
    watchdog = setInterval(() => {
      if (Date.now() - lastPing > 45_000) {
        logStatus('warning', 'Server tidak merespons selama 45 detik; menyambungkan ulang...');
        try {
          sock.close();
        } catch {
        }
      }
    }, 5000);
  }

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      clearInterval(drainTimer);
      try {
        ws?.close();
      } catch {
        /* abaikan */
      }
      closeAll();
    },
    connected: () => !!ws && ws.readyState === 1 && lastPing > 0,
  };
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
      else if (s.startsWith('\x1b')) rl.output.write(s);
      else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      else rl.output.write('*');
    };
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

const DEFAULT_URL = 'ws://agent.growtree.my.id:25380/agent';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  clearTerminal();
  showBanner();

  const loadedEnv = loadEnv();
  if (loadedEnv.length) info(`Konfigurasi dimuat dari: ${loadedEnv.join(', ')}`);

  const e = process.env;
  let token = (e.USER_TOKEN || '').trim();

  showSection('ACCOUNT AUTHENTICATION');
  if (token) {
    success('Token ditemukan dari environment; nilai token tidak ditampilkan.');
  } else {
    if (!process.stdin.isTTY) {
      error('Terminal tidak interaktif. Isi USER_TOKEN di environment atau file .env.');
      process.exit(1);
    }

    console.log(`  ${paint(UI.white, 'Masukkan token akun GrowTree untuk mengaktifkan agent.')}`);
    console.log(`  ${paint(UI.gray, 'Token harus diawali mk_. Input disembunyikan demi keamanan.')}\n`);
    token = await askHidden(`${paint(UI.green + UI.bright, '  ➜')} ${paint(UI.white, 'Token User: ')} `);
    console.log('');
    if (token) success('Token berhasil dimasukkan (disembunyikan).');
    else warning('Token kosong. Validasi akan gagal jika token tidak diisi.');
  }

  const serverUrl = e.SERVER_URL || DEFAULT_URL;
  let serverLabel = serverUrl;
  try {
    const parsed = new URL(serverUrl);
    serverLabel = `${parsed.protocol}//${parsed.host}`;
  } catch {
  }

  showSection('TUNNEL INITIALIZATION');
  info(`Server       : HIDDEN`);
  info(`Transport    : ${/^wss:/i.test(serverUrl) ? 'Secure WebSocket (WSS)' : 'WebSocket (WS)'}`);
  info('Proxy mode   : SOCKS5 / TCP + UDP');
  info(`Max streams  : ${e.MAX_STREAMS || 1024}`);
  pending('Memulai agent dan menunggu autentikasi server...');

  try {
    const a = startAgent({
      url: serverUrl,
      token,
      allowPrivate: e.ALLOW_PRIVATE === '1',
      maxStreams: Number(e.MAX_STREAMS || 1024),
      onFatal: (why) => {
        error(`Agent berhenti: ${why}`);
        process.exit(2);
      },
    });

    let shuttingDown = false;
    const stop = (signal = 'SIGINT') => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('');
      warning(`Menerima ${signal}; menutup koneksi proxy...`);
      a.stop();
      success('Proxy agent dihentikan. Sampai jumpa!');
      process.exit(0);
    };

    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
  } catch (err) {
    error(`Gagal menjalankan agent: ${err.message}`);
    process.exit(1);
  }
}
