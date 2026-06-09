# WA Server (Baileys)

Server WhatsApp menggunakan Baileys untuk kirim gambar + pesan.

## Jalankan Lokal

```bash
npm install
node server.js
```

Scan QR code yang muncul di terminal dengan HP WhatsApp pengirim.

## Deploy ke Railway

1. Push folder ini ke GitHub repo terpisah
2. Buka https://railway.app → New Project → Deploy from GitHub
3. Pilih repo ini
4. Railway otomatis jalankan `node server.js`
5. Setelah deploy, buka URL Railway → akan tampil QR code di logs
6. Scan QR dari Railway logs dengan HP WhatsApp pengirim
7. Copy URL Railway (contoh: https://wa-server-xxx.railway.app)
8. Isi di Vercel Environment Variables: `WA_SERVER_URL=https://wa-server-xxx.railway.app`

## API

- `GET /status` — cek koneksi WA
- `POST /send` — kirim pesan + gambar
  ```json
  {
    "number": "081380680631",
    "message": "kode SPNU3012474",
    "imageBase64": "..."
  }
  ```
