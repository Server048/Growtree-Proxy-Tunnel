
export const T = {
  TCP_OPEN: 1, TCP_OK: 2, TCP_FAIL: 3, TCP_DATA: 4, TCP_END: 5, TCP_CLOSE: 6, TCP_PAUSE: 7, TCP_RESUME: 8,
  UDP_OPEN: 20, UDP_SEND: 21, UDP_RECV: 22, UDP_CLOSE: 23,
};

export function frame(type, id, payload) {
  const p = payload ? Buffer.from(payload) : Buffer.alloc(0);
  const b = Buffer.allocUnsafe(5 + p.length);
  b[0] = type;
  b.writeUInt32BE(id >>> 0, 1);
  p.copy(b, 5);
  return b;
}

export function parseFrame(buf) {
  if (buf.length < 5) return null;
  return { type: buf[0], id: buf.readUInt32BE(1), payload: buf.subarray(5) };
}

export function parseAddr(buf, off = 0) {
  if (buf.length < off + 1) return null;
  const atyp = buf[off];
  let host;
  let p = off + 1;
  if (atyp === 1) {
    if (buf.length < p + 6) return null;
    host = `${buf[p]}.${buf[p + 1]}.${buf[p + 2]}.${buf[p + 3]}`;
    p += 4;
  } else if (atyp === 4) {
    if (buf.length < p + 18) return null;
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push(buf.readUInt16BE(p + i * 2).toString(16));
    host = parts.join(':');
    p += 16;
  } else if (atyp === 3) {
    if (buf.length < p + 1) return null;
    const n = buf[p];
    if (n === 0 || buf.length < p + 1 + n + 2) return null;
    host = buf.toString('utf8', p + 1, p + 1 + n);
    p += 1 + n;
  } else {
    return null;
  }
  return { atyp, host, port: buf.readUInt16BE(p), rest: buf.subarray(p + 2) };
}

export function encodeAddr(host, port, family) {
  if (family === 4) {
    const o = host.split('.').map(Number);
    const b = Buffer.alloc(7);
    b[0] = 1;
    for (let i = 0; i < 4; i++) b[1 + i] = o[i];
    b.writeUInt16BE(port, 5);
    return b;
  }

  let h = host.replace(/^\[|\]$/g, '');
  const mapped = h.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const o = mapped[2].split('.').map(Number);
    h = mapped[1] + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  let groups;
  if (h.includes('::')) {
    const [a, c] = h.split('::');
    const left = a ? a.split(':') : [];
    const right = c ? c.split(':') : [];
    groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  } else {
    groups = h.split(':');
  }
  const b = Buffer.alloc(19);
  b[0] = 4;
  groups.forEach((g, i) => b.writeUInt16BE(parseInt(g || '0', 16), 1 + i * 2));
  b.writeUInt16BE(port, 17);
  return b;
}
