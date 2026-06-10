const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;
const AUTH_SECRET = process.env.AUTH_SECRET || 'secret123';

let currentQR = null;
let isConnected = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './auth' }),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ]
  }
});

client.on('qr', async qr => {
  currentQR = qr;
  isConnected = false;
  console.log('QR baru tersedia, buka /qr untuk scan');
});

client.on('ready', () => {
  isConnected = true;
  currentQR = null;
  console.log('✅ WhatsApp Connected!');
});

client.on('disconnected', () => {
  isConnected = false;
  console.log('Disconnected, mencoba reconnect...');
  client.initialize();
});

// Auto reset session jika 30 detik tidak ada QR dan tidak connected
client.initialize();
setTimeout(async () => {
  if (!isConnected && !currentQR) {
    console.log('Timeout: hapus session corrupt dan restart...');
    try { await client.destroy(); } catch {}
    try { fs.rmSync(path.join(__dirname, 'auth'), { recursive: true, force: true }); } catch {}
    setTimeout(() => process.exit(0), 500);
  }
}, 30000);

app.get('/', (_, res) => res.json({ status: 'WA Server running', connected: isConnected }));

app.get('/qr', async (req, res) => {
  const logoutBtn = `<form method="POST" action="/logout" style="margin-top:20px"><button type="submit" style="background:#ef4444;color:white;border:none;padding:10px 24px;border-radius:12px;font-size:14px;cursor:pointer">🔌 Putuskan WhatsApp</button></form>`;

  if (isConnected) return res.send(`<html><body style="text-align:center;font-family:sans-serif;padding:40px"><h2 style="color:green">✅ WhatsApp sudah terkoneksi!</h2>${logoutBtn}</body></html>`);
  if (!currentQR) return res.send('<h2 style="font-family:sans-serif">⏳ Menunggu QR... Refresh halaman ini.</h2><script>setTimeout(()=>location.reload(),3000)</script>');
  const qrImage = await QRCode.toDataURL(currentQR);
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h2>Scan QR ini dengan WhatsApp</h2>
      <p>WhatsApp → titik tiga → <b>Linked Devices</b> → <b>Link a Device</b></p>
      <img src="${qrImage}" style="width:300px;height:300px"/>
      <p style="color:gray;font-size:12px">QR expired dalam 60 detik. Halaman auto-refresh.</p>
      <script>setTimeout(()=>location.reload(), 30000)</script>
    </body></html>
  `);
});

app.get('/status', (_, res) => res.json({ connected: isConnected }));

app.post('/send', async (req, res) => {
  if (req.headers['x-auth-secret'] !== AUTH_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { number, message, imageBase64 } = req.body;
  if (!isConnected) return res.status(503).json({ error: 'WA belum terkoneksi' });

  try {
    const raw = number.replace(/[^0-9]/g, '');
    const jid = (raw.startsWith('0') ? '62' + raw.slice(1) : raw) + '@c.us';
    if (imageBase64) {
      const media = new MessageMedia('image/jpeg', imageBase64, 'gambar.jpg');
      await client.sendMessage(jid, media, { caption: message });
    } else {
      await client.sendMessage(jid, message);
    }
    res.json({ success: true });
  } catch (err) {
    const errMsg = err?.message || JSON.stringify(err);
    console.error('SEND ERROR:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

app.get('/logout', async (req, res) => {
  try {
    await client.logout();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

app.post('/logout', async (req, res) => {
  try {
    await client.logout();
  } catch {}
  isConnected = false;
  currentQR = null;
  res.redirect('/qr');
});

app.get('/reset', async (req, res) => {
  try {
    await client.destroy();
  } catch {}
  try {
    fs.rmSync(path.join(__dirname, 'auth'), { recursive: true, force: true });
  } catch {}
  res.send('<h2>Session dihapus. <a href="/qr">Klik di sini untuk scan QR baru</a></h2>');
  setTimeout(() => process.exit(0), 1000);
});

app.listen(PORT, () => {
  console.log(`WA Server jalan di port ${PORT}`);
  console.log(`Buka /qr untuk scan QR`);
});
