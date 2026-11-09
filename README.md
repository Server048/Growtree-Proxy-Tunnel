# 🌳 GrowTree Proxy Tunnel

**Private Device Agent · SOCKS5 · TCP · UDP · WebSocket**

Agent ringan untuk menghubungkan perangkat Android/Termux ke layanan GrowTree Proxy Tunnel. Koneksi keluar dari agent menggunakan jaringan perangkat, sehingga trafik yang diteruskan menggunakan koneksi internet perangkat tersebut.

<p align="center">
  <b>Instalasi Termux cukup dengan satu command.</b>
</p>

```bash
curl -fsSL https://raw.githubusercontent.com/Server048/Growtree-Proxy-Tunnel/main/install.sh | bash
```

> Repository: [Server048/Growtree-Proxy-Tunnel](https://github.com/Server048/Growtree-Proxy-Tunnel)

---

## ✨ Fitur

- **One-command installer** — instalasi langsung dari GitHub tanpa mengunduh ZIP secara manual.
- **Private device agent** — agent berjalan di perangkat Android dan menggunakan koneksi internet perangkat.
- **SOCKS5 tunnel** — meneruskan koneksi TCP dan UDP melalui server GrowTree.
- **WebSocket transport** — komunikasi agent dengan server menggunakan WebSocket.
- **Auto reconnect** — mencoba menyambung kembali ketika koneksi terputus, dengan jeda retry bertahap.
- **Token authentication** — menggunakan token akun GrowTree dengan prefix `mk_`.
- **Hidden token prompt** — token yang diketik tidak ditampilkan sebagai teks biasa.
- **Terminal UI** — banner, status, pesan error, dan informasi koneksi berwarna.
- **Basic destination protection** — alamat loopback, jaringan privat, dan rentang alamat khusus diblokir secara default.
- **No npm dependencies** — menggunakan modul bawaan Node.js dan file project.

## 📱 Persyaratan

- Android dengan aplikasi **Termux**.
- Koneksi internet.
- Repository GitHub ini dapat diakses secara publik oleh installer.
- **Node.js 22 atau lebih baru**. Installer akan memeriksa versi Node.js dan mencoba memasangnya melalui repository Termux jika diperlukan.

Agent menggunakan WebSocket bawaan Node.js, sehingga Node.js versi lama tidak didukung.

## 🚀 Instalasi

Buka Termux, lalu jalankan satu command berikut:

```bash
curl -fsSL https://raw.githubusercontent.com/Server048/Growtree-Proxy-Tunnel/main/install.sh | bash
```

Installer akan melakukan langkah berikut:

1. Memastikan proses berjalan di Termux.
2. Memastikan `curl` tersedia.
3. Memeriksa Node.js 22+ dan WebSocket bawaan.
4. Mengunduh `agent.js`, `protocol.js`, dan `env.js` dari branch `main`.
5. Memeriksa sintaks file JavaScript sebelum memasangnya.
6. Membuat backup file lama jika ditemukan.
7. Memasang project ke `~/proxy-socks5`.
8. Mempertahankan file `.env` lokal yang sudah ada.
9. Menjalankan agent dan meminta token melalui terminal.

Installer mendukung prompt interaktif meskipun dipanggil menggunakan pola `curl | bash`, dengan membaca input dari `/dev/tty`.

### Menjalankan kembali agent

Setelah instalasi selesai:

```bash
cd ~/proxy-socks5
npm start
```

Alternatifnya:

```bash
cd ~/proxy-socks5
node agent.js
```

## 🔐 Autentikasi akun

Saat diminta, masukkan token akun GrowTree yang diawali dengan `mk_`. Input token disembunyikan di terminal.

Token juga dapat disediakan melalui environment variable `USER_TOKEN` atau konfigurasi lokal `.env`. **Jangan pernah memasukkan token pribadi ke README, source code publik, screenshot, issue, atau commit Git.**

Jika token ditolak, periksa token akun dan pastikan agent lain dengan akun yang sama tidak sedang tersambung dari perangkat lain.

## ⚙️ Konfigurasi

Konfigurasi dapat diberikan melalui environment variable atau file `.env` lokal yang dibaca oleh `env.js`.

| Variabel | Default | Keterangan |
|---|---|---|
| `USER_TOKEN` | Tidak diatur | Token akun GrowTree. Jika tidak tersedia, agent meminta token secara interaktif. |
| `SERVER_URL` | `wss://agent.growtree.my.id:25380/agent` | URL endpoint WebSocket agent. Mendukung skema `ws://` atau `wss://`. |
| `MAX_STREAMS` | `1024` | Batas maksimum stream TCP yang ditangani agent. |
| `ALLOW_PRIVATE` | `0` / tidak aktif | Jika disetel ke `1`, tujuan jaringan privat tidak lagi diblokir oleh pemeriksaan agent. Gunakan dengan sangat hati-hati. |

Contoh `.env` tanpa menyimpan token:

```dotenv
SERVER_URL=wss://agent.growtree.my.id:25380/agent
MAX_STREAMS=1024
# ALLOW_PRIVATE=0
```

Simpan `.env` hanya di perangkat sendiri dan tambahkan `.env` ke `.gitignore`. Jangan upload file tersebut ke repository publik.

> **Catatan transport:** nilai default saat ini menggunakan `ws://`. Gunakan `wss://` pada `SERVER_URL` apabila endpoint server GrowTree telah dikonfigurasi untuk menerima koneksi WebSocket TLS.

## 🌐 Informasi proxy

Agent menghubungkan perangkat ke endpoint server GrowTree. Komentar konfigurasi agent menyebut layanan proxy pribadi pada `proxy.growtree.my.id`, dengan username berdasarkan nama akun dan password menggunakan token akun.

Port dan detail koneksi client dapat bergantung pada konfigurasi layanan/backend GrowTree. Gunakan detail endpoint yang diberikan oleh layanan GrowTree; jangan menebak port atau membagikan token akun kepada orang lain.

## 🔄 Memperbarui instalasi

Jalankan kembali command installer:

```bash
curl -fsSL https://raw.githubusercontent.com/Server048/Growtree-Proxy-Tunnel/main/install.sh | bash
```

Installer mengunduh versi yang tersedia di branch `main`. File `agent.js`, `protocol.js`, dan `env.js` lama akan dibuatkan backup bertimestamp sebelum diganti. File `.env` lokal tidak ditimpa.

## 🧰 Troubleshooting

### `Terminal tidak interaktif`

Jalankan installer dari aplikasi Termux yang memiliki terminal aktif. Installer terbaru mengalihkan input ke `/dev/tty` ketika dijalankan dengan `curl | bash`. Untuk menjalankan agent secara manual:

```bash
cd ~/proxy-socks5 && node agent.js
```

### `Diperlukan Node.js 22+`

Perbarui package Termux, lalu pasang Node.js:

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y && pkg install curl -y
node --version
```

### Installer gagal mengunduh `protocol.js` atau `env.js`

Pastikan ketiga file berikut tersedia di **root branch `main`** dan repository dapat diakses publik:

- `agent.js`
- `protocol.js`
- `env.js`

Pastikan juga nama file dan huruf besar/kecilnya sama persis.

### Token ditolak atau agent berhenti

Periksa token `mk_` yang digunakan. Kode agent juga menghentikan koneksi ketika server menolak token atau mendeteksi akun yang sama tersambung dari perangkat lain.

### Koneksi terputus

Agent akan mencoba reconnect otomatis untuk kondisi koneksi yang dapat dicoba ulang. Periksa koneksi internet perangkat dan status server GrowTree apabila masalah berlanjut.

## 🗂️ Struktur repository

Installer mengharapkan file berikut berada di root repository:

```text
Growtree-Proxy-Tunnel/
├── agent.js
├── protocol.js
├── env.js
├── install.sh
└── README.md
```

`package.json` dibuat otomatis saat instalasi jika belum tersedia. Project menggunakan format ES Module (`type: module`).

## 🛡️ Catatan keamanan

- Perlakukan token `mk_` seperti password. Jangan membagikan atau mengunggahnya.
- Jangan commit `.env` atau backup yang berisi konfigurasi rahasia.
- Pemeriksaan tujuan jaringan privat aktif secara default. Jangan mengaktifkan `ALLOW_PRIVATE=1` kecuali benar-benar memahami risikonya.
- Gunakan agent hanya pada akun dan jaringan yang kamu miliki atau berwenang untuk digunakan.
- Pastikan endpoint server dan transport yang digunakan sesuai konfigurasi backend GrowTree.

## 📄 Lisensi

Informasi lisensi belum ditentukan di repository ini. Hubungi pemilik project sebelum menyalin, memodifikasi, atau mendistribusikan ulang project untuk penggunaan di luar ketentuan yang diizinkan.

---

<p align="center">
  <b>GrowTree Proxy Tunnel</b><br>
  <sub>Private Device Agent · Built for Termux</sub>
</p>
