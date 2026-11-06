
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = [...new Set([path.join(process.cwd(), '.env'), path.join(here, '.env')])];
  const loaded = [];
  for (const f of files) {
    let txt;
    try {
      txt = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (let line of txt.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('export ')) line = line.slice(7).trim();
      const i = line.indexOf('=');
      if (i < 1) continue;
      const k = line.slice(0, i).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
      let v = line.slice(i + 1).trim();
      const q = v[0];
      if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
    loaded.push(f);
  }
  return loaded;
}
