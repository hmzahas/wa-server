require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;
const AUTH_SECRET = process.env.AUTH_SECRET || 'gatesend_secret_2024';
const AUTH_PATH = path.join(__dirname, 'auth');

let currentQR = null;
let isConnected = false;
let qrTimeout = null;
let client = null;

function clearQRTimeout() {
  if (qrTimeout) { clearTimeout(qrTimeout); qrTimeout = null; }
}

function deleteSession() {
  try { fs.rmSync(AUTH_PATH, { recursive: true, force: true }); } catch {}
}

async function destroyClient() {
  if (!client) return;
  try { client.removeAllListeners(); await client.destroy(); } catch {}
  client = null;
}

async function restartClient() {
  clearQRTimeout();
  isConnected = false;
  currentQR = null;
  await destroyClient();
  setTimeout(() => createClient(), 3000);
}

async function startFresh() {
  clearQRTimeout();
  isConnected = false;
  currentQR = null;
  await destroyClient();
  deleteSession();
  setTimeout(() => createClient(), 2000);
}

function createClient() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './auth' }),
    restartOnAuthFail: true,
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--no-first-run', '--disable-extensions',
        '--disable-background-networking', '--disable-default-apps',
        '--disable-sync', '--disable-translate', '--mute-audio',
        '--single-process', '--no-zygote', '--disable-accelerated-2d-canvas',
        '--disable-web-security', '--memory-pressure-off',
      ]
    }
  });

  client.on('qr', qr => {
    currentQR = qr;
    isConnected = false;
    console.log('QR baru tersedia, buka /qr untuk scan');
  });

  client.on('ready', () => {
    isConnected = true;
    currentQR = null;
    clearQRTimeout();
    console.log('✅ WhatsApp Connected!');
  });

  client.on('auth_failure', () => console.log('Auth gagal.'));

  client.on('disconnected', reason => {
    console.log('Disconnected:', reason);
    isConnected = false;
  });

  client.initialize();
}

// Start pertama kali
createClient();

app.get('/', (_, res) => res.json({ status: 'WA Server running', connected: isConnected }));

app.get('/status', (_, res) => res.json({ connected: isConnected }));

app.get('/qr', async (req, res) => {
  const resetBtn = `<form method="POST" action="/reset" style="margin-top:12px"><button type="submit" style="background:#f97316;color:white;border:none;padding:8px 20px;border-radius:10px;font-size:13px;cursor:pointer">🔄 Reset Session</button></form>`;
  const logoutBtn = `<form method="POST" action="/logout" style="margin-top:8px"><button type="submit" style="background:#ef4444;color:white;border:none;padding:8px 20px;border-radius:10px;font-size:13px;cursor:pointer">🔌 Putuskan WhatsApp</button></form>`;

  if (isConnected) return res.send(`<html><body style="text-align:center;font-family:sans-serif;padding:40px"><h2 style="color:green">✅ WhatsApp sudah terkoneksi!</h2>${logoutBtn}${resetBtn}</body></html>`);

  if (!currentQR) return res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h2>⏳ Memuat QR...</h2>
      <div style="width:40px;height:40px;border:4px solid #16a34a;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:20px auto"></div>
      <p style="color:gray;font-size:13px">Mohon tunggu.. sedang membuat QR baru</p>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      ${resetBtn}
      <script>setTimeout(()=>location.reload(), 3000)</script>
    </body></html>
  `);

  const qrImage = await QRCode.toDataURL(currentQR);
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif;padding:40px">
      <h2>Scan QR ini dengan WhatsApp</h2>
      <p>WhatsApp → titik tiga → <b>Linked Devices</b> → <b>Link a Device</b></p>
      <img src="${qrImage}" style="width:300px;height:300px"/>
      <p style="color:gray;font-size:12px">QR expired dalam 60 detik. Halaman auto-refresh.</p>
      ${resetBtn}
      <script>setTimeout(()=>location.reload(), 20000)</script>
    </body></html>
  `);
});

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
    isConnected = false;
    res.status(500).json({ error: errMsg });
  }
});

app.post('/logout', async (req, res) => {
  try { await client.logout(); } catch {}
  await startFresh();
  res.redirect('/qr');
});

app.post('/reset', async (req, res) => {
  await startFresh();
  res.redirect('/qr');
});

app.listen(PORT, () => {
  console.log(`WA Server jalan di port ${PORT}`);
  console.log(`Buka /qr untuk scan QR`);
});
