#!/usr/bin/env bash
# GrowTree Proxy Tunnel SOCKS5 — one-command Termux installer
set -Eeuo pipefail

# Repository supplied by the project owner. Keep these files in the repository root.
REPO_RAW="https://raw.githubusercontent.com/Server048/Growtree-Proxy-Tunnel/main"

RESET='\033[0m'; CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; GRAY='\033[90m'; BOLD='\033[1m'
color() { [[ -t 1 && -z "${NO_COLOR:-}" ]] && printf '%b' "$1" || true; }
log() { color "$CYAN"; printf '  ◈ '; color "$RESET"; printf '%s\n' "$*"; }
ok() { color "$GREEN"; printf '  ✔ '; color "$RESET"; printf '%s\n' "$*"; }
warn() { color "$YELLOW"; printf '  ! '; color "$RESET"; printf '%s\n' "$*"; }
fail() { color "$RED"; printf '  ✖ '; color "$RESET"; printf '%s\n' "$*" >&2; }

if [[ -t 1 ]]; then clear 2>/dev/null || printf '\033[2J\033[H'; fi
color "$CYAN$BOLD"
cat <<'BANNER'
  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║                    G R O W T R E E                   ║
  ║                                                      ║
  ║               PROXY TUNNEL  /  SOCKS5                ║
  ║                                                      ║
  ║                  ONE-COMMAND INSTALLER               ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝
BANNER
color "$RESET"
printf '\n'

if ! command -v pkg >/dev/null 2>&1; then
  fail 'Installer ini khusus Termux Android. Jalankan dari aplikasi Termux.'
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  log 'Memasang curl...'
  pkg update -y
  pkg install -y curl
fi

log 'Memeriksa Node.js 22+ (WebSocket bawaan)...'
node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
fi
if [[ "$node_major" -lt 22 ]]; then
  log 'Memasang / memperbarui Node.js dari repository Termux...'
  pkg update -y
  pkg install -y nodejs
fi
if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js tidak berhasil dipasang.'
  exit 1
fi
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$node_major" -lt 22 ]]; then
  fail "Diperlukan Node.js 22+; versi saat ini $(node --version)."
  warn 'Coba: pkg update && pkg upgrade && pkg install nodejs'
  exit 1
fi
if ! node -e 'if (typeof WebSocket === "undefined") process.exit(1)' >/dev/null 2>&1; then
  fail 'WebSocket bawaan Node.js tidak tersedia.'
  exit 1
fi
ok "Node.js $(node --version) siap."

PROJECT_DIR="${GROWTREE_DIR:-$HOME/proxy-socks5}"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

log 'Mengunduh source dari GitHub...'
for file in agent.js protocol.js env.js; do
  printf '  • %s\n' "$file"
  if ! curl -fLsS --retry 2 --connect-timeout 20 "$REPO_RAW/$file" -o "$TMP_DIR/$file"; then
    fail "Tidak dapat mengunduh $file."
    warn "Pastikan repository public dan file tersedia di root branch main: $REPO_RAW/$file"
    exit 1
  fi
  if [[ ! -s "$TMP_DIR/$file" ]]; then
    fail "$file kosong; instalasi dibatalkan."
    exit 1
  fi
done

log 'Memeriksa sintaks semua file JavaScript...'
for file in agent.js protocol.js env.js; do
  if ! (cd "$TMP_DIR" && node --check "$file"); then
    fail "Sintaks $file tidak valid. File project lama tidak diubah."
    exit 1
  fi
done

# Prepare package.json before copying files so a malformed existing manifest cannot
# leave the user with a partially replaced source tree.
mkdir -p "$PROJECT_DIR"
PACKAGE_JSON="$PROJECT_DIR/package.json" node --input-type=module <<'NODE'
import fs from 'node:fs';
const file = process.env.PACKAGE_JSON;
let data = {};
if (fs.existsSync(file)) {
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    console.error(`package.json lama tidak valid: ${error.message}`);
    process.exit(1);
  }
}
data.name ??= 'growtree-proxy-tunnel-agent';
data.version ??= '1.0.0';
data.private = true;
data.type = 'module';
data.scripts ??= {};
data.scripts.start = 'node agent.js';
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
NODE

STAMP="$(date +%Y%m%d-%H%M%S)"
for file in agent.js protocol.js env.js; do
  if [[ -f "$PROJECT_DIR/$file" ]]; then
    cp -p "$PROJECT_DIR/$file" "$PROJECT_DIR/$file.backup.$STAMP"
  fi
  install -m 600 "$TMP_DIR/$file" "$PROJECT_DIR/$file"
done

if [[ -f "$PROJECT_DIR/.env" ]]; then
  ok 'Konfigurasi .env lama dipertahankan.'
else
  warn 'File .env belum ada; token akan diminta secara tersembunyi.'
fi
ok "Project berhasil dipasang di $PROJECT_DIR"
ok 'Backup file lama dibuat jika sebelumnya tersedia.'
printf '\n'
log 'Menjalankan GrowTree Proxy Tunnel SOCKS5...'
cd "$PROJECT_DIR"

# Saat install dijalankan dengan `curl ... | bash`, stdin Bash berasal dari pipe,
# bukan terminal. Buka ulang input dari controlling terminal agar prompt token
# (readline) tetap interaktif.
if [[ -t 0 ]]; then
  exec node agent.js
elif [[ -r /dev/tty ]]; then
  exec node agent.js </dev/tty
else
  fail 'Tidak dapat mengakses terminal interaktif (/dev/tty tidak tersedia).'
  warn 'Jalankan installer langsung dari aplikasi Termux, bukan dari proses tanpa TTY.'
  exit 1
fi
