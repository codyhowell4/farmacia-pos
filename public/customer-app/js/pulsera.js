// ============================================
// PULSERA M8 - FitPro-protocol smart band over Web Bluetooth
// Protocol reference: Gadgetbridge FitPro implementation
// (gadgetbridge.org/internals/specifics/fitpro-protocol)
// Frame: [0xCD, lenHi, lenLo, group, 0x01, cmd, payloadLenHi, payloadLenLo, ...payload]
// len = 5 + payload.length. No checksum. ACK frames start with 0xDC.
// ============================================

const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9d';
const NUS_TX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9d'; // phone -> band
const NUS_RX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9d'; // band -> phone (notify)
const BATTERY_SVC = 0x180f;
const BATTERY_LVL = 0x2a19;
const DIS_SVC     = 0x180a;
const DIS_FW      = 0x2a26;

const GRP_GENERAL  = 0x12;
const GRP_SPORTS   = 0x15;
const GRP_REQUEST  = 0x1a;
const GRP_BANDINFO = 0x20;

const CMD_SET_TIME     = 0x01;
const CMD_INIT1        = 0x0a;
const CMD_INIT2        = 0x0c;
const CMD_INIT3        = 0xff;
const CMD_FIND_BAND    = 0x0b;
const CMD_SET_LANGUAGE = 0x15;
const CMD_HR_MEASURE   = 0x18;
const CMD_NOTIFY_MSG   = 0x12;
const CMD_DAY_SUMMARY  = 0x06; // request; band replies with cmd 0x0c + may stream 0x02/0x03
const CMD_GET_HW_INFO  = 0x10;
const CMD_BAND_INFO    = 0x02;

const RX_STEP_DATA     = 0x02;
const RX_SLEEP_DATA    = 0x03;
const RX_DAY_TOTALS    = 0x0c;
const RX_HR_DATA       = 0x0e;

const LANG_SPANISH     = 0x06;
const MTU              = 20;

function craftFrame(group, cmd, payload = []) {
  const p = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  const len = 5 + p.length;
  const f = new Uint8Array(8 + p.length);
  f[0] = 0xcd;
  f[1] = (len >> 8) & 0xff;
  f[2] = len & 0xff;
  f[3] = group;
  f[4] = 0x01;
  f[5] = cmd;
  f[6] = (p.length >> 8) & 0xff;
  f[7] = p.length & 0xff;
  f.set(p, 8);
  return f;
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- State ----------------

const Pulsera = {
  device: null,
  tx: null,
  connected: false,
  connecting: false,
  name: '',
  battery: null,
  firmware: null,
  hr: null,          // { bpm, spo2, bpHigh, bpLow, at }
  hrMeasuring: false,
  hrStopTimer: null,
  activity: null,    // { steps, distance, calories, at }
  syncing: false,
};

const debugLines = [];

function dlog(msg, bytes) {
  const line = `${new Date().toLocaleTimeString()} ${msg}${bytes ? '  [ ' + toHex(bytes) + ' ]' : ''}`;
  debugLines.push(line);
  if (debugLines.length > 200) debugLines.shift();
  const pre = document.getElementById('pulsera-debug-pre');
  if (pre) { pre.textContent = debugLines.join('\n'); pre.scrollTop = pre.scrollHeight; }
  console.log('[pulsera]', line);
}

function savePulsera() {
  try {
    localStorage.setItem('pulseraConnection', JSON.stringify({
      name: Pulsera.name,
      battery: Pulsera.battery,
      firmware: Pulsera.firmware,
      hr: Pulsera.hr,
      activity: Pulsera.activity,
    }));
  } catch (e) { /* storage full/blocked — non-fatal */ }
}

function loadSavedPulsera() {
  try {
    return JSON.parse(localStorage.getItem('pulseraConnection') || '{}');
  } catch (e) { return {}; }
}

// ---------------- BLE I/O ----------------

async function bleSend(frame) {
  if (!Pulsera.tx) throw new Error('No conectado');
  dlog('TX', frame);
  for (let start = 0; start < frame.length; start += MTU) {
    const chunk = frame.slice(start, Math.min(start + MTU, frame.length));
    try {
      await Pulsera.tx.writeValueWithoutResponse(chunk);
    } catch (e) {
      await Pulsera.tx.writeValue(chunk);
    }
  }
}

function sendAck(group, lenHi, lenLo) {
  const ack = Uint8Array.from([0xdc, 0x00, 0x05, group, 0x01, lenHi, lenLo, 0x01]);
  bleSend(ack).catch(e => dlog('ACK error: ' + e.message));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function be32(v, off) { return ((v[off] << 24) | (v[off + 1] << 16) | (v[off + 2] << 8) | v[off + 3]) >>> 0; }

function handleRx(event) {
  const bytes = new Uint8Array(event.target.value.buffer);
  dlog('RX', bytes);
  if (bytes.length < 6 || bytes[0] !== 0xcd) return;
  const group = bytes[3];
  const cmd = bytes[5];

  if (group === GRP_SPORTS) {
    if (cmd === RX_HR_DATA && bytes.length >= 20) {
      const bpm = bytes[19];
      const spo2 = bytes[13];
      const bpHigh = bytes[17];
      const bpLow = bytes[18];
      sendAck(group, bytes[1], bytes[2]);
      if (bpm > 0) {
        Pulsera.hr = { bpm, spo2, bpHigh, bpLow, at: Date.now() };
        savePulsera();
        updateHrUI();
        dlog(`FC: ${bpm} lpm · SpO2: ${spo2}% · PA: ${bpHigh}/${bpLow}`);
      }
    } else if (cmd === RX_DAY_TOTALS && bytes.length >= 20) {
      const steps = be32(bytes, 10);
      const distance = be32(bytes, 14);
      const calories = (bytes[18] << 8) | bytes[19];
      sendAck(group, bytes[1], bytes[2]);
      Pulsera.activity = { steps, distance, calories, at: Date.now() };
      savePulsera();
      updateActivityUI();
      setPulseraStatus(`Sincronizado: ${steps.toLocaleString()} pasos hoy.`);
    } else if (cmd === RX_STEP_DATA || cmd === RX_SLEEP_DATA) {
      sendAck(group, bytes[1], bytes[2]);
    } else if (cmd === 0x07 || cmd === 0x08 || cmd === 0x10) {
      sendAck(group, bytes[1], bytes[2]); // acking makes the band stream the data
    }
  } else if (group === GRP_BANDINFO || group === GRP_REQUEST) {
    sendAck(group, bytes[1], bytes[2]);
  }
}

function onGattDisconnected() {
  dlog('Desconectado (GATT)');
  Pulsera.connected = false;
  Pulsera.tx = null;
  Pulsera.hrMeasuring = false;
  if (Pulsera.hrStopTimer) { clearTimeout(Pulsera.hrStopTimer); Pulsera.hrStopTimer = null; }
  savePulsera();
  if (document.getElementById('pulsera-page')) renderPulsera();
}

// ---------------- Commands ----------------

async function initSequence() {
  dlog('Iniciando secuencia de emparejamiento FitPro…');
  await bleSend(craftFrame(GRP_GENERAL, CMD_INIT1, [0x02]));
  await sleep(200);

  const now = new Date();
  const t = (now.getSeconds()) |
    ((now.getFullYear() - 2000) << 26) |
    ((now.getMonth() + 1) << 22) |
    (now.getDate() << 17) |
    (now.getHours() << 12) |
    (now.getMinutes() << 6);
  await bleSend(craftFrame(GRP_GENERAL, CMD_SET_TIME, [(t >>> 24) & 0xff, (t >>> 16) & 0xff, (t >>> 8) & 0xff, t & 0xff]));
  await sleep(200);

  await bleSend(craftFrame(GRP_REQUEST, CMD_INIT1)); await sleep(200);
  await bleSend(craftFrame(GRP_REQUEST, CMD_INIT2)); await sleep(200);
  await bleSend(craftFrame(GRP_GENERAL, CMD_SET_LANGUAGE, [LANG_SPANISH])); await sleep(200);
  await bleSend(craftFrame(GRP_GENERAL, CMD_INIT3, [0x01])); await sleep(200);
  await bleSend(craftFrame(GRP_REQUEST, 0x01)); await sleep(200);
  await bleSend(craftFrame(GRP_REQUEST, 0x0f)); await sleep(200);
  await bleSend(craftFrame(GRP_REQUEST, CMD_GET_HW_INFO)); await sleep(200);
  await bleSend(craftFrame(GRP_BANDINFO, CMD_BAND_INFO)); await sleep(200);
  dlog('Secuencia de inicio enviada.');
}

async function readBattery() {
  try {
    const svc = await Pulsera.device.gatt.getPrimaryService(BATTERY_SVC);
    const ch = await svc.getCharacteristic(BATTERY_LVL);
    const v = await ch.readValue();
    Pulsera.battery = v.getUint8(0);
    dlog('Batería: ' + Pulsera.battery + '%');
  } catch (e) {
    dlog('Batería no disponible: ' + e.message);
  }
}

async function readFirmware() {
  try {
    const svc = await Pulsera.device.gatt.getPrimaryService(DIS_SVC);
    const ch = await svc.getCharacteristic(DIS_FW);
    const v = await ch.readValue();
    Pulsera.firmware = new TextDecoder().decode(v);
    dlog('Firmware: ' + Pulsera.firmware);
  } catch (e) {
    dlog('Firmware no disponible: ' + e.message);
  }
}

// ---------------- UI helpers ----------------

function setPulseraStatus(msg) {
  const el = document.getElementById('pulsera-status');
  if (el) el.textContent = msg;
}

function updateHrUI() {
  const hr = Pulsera.hr;
  if (!hr) return;
  const el = document.getElementById('pulsera-hr-value');
  if (el) el.innerHTML = `${hr.bpm} <span style="font-size: 1rem; font-weight: 500;">lpm</span>`;
  const sub = document.getElementById('pulsera-hr-sub');
  if (sub) sub.textContent = `SpO2 ${hr.spo2}% · PA ${hr.bpHigh}/${hr.bpLow} · ${new Date(hr.at).toLocaleTimeString()}`;
}

function updateActivityUI() {
  const a = Pulsera.activity;
  if (!a) return;
  const s = document.getElementById('pulsera-steps-value');
  if (s) s.textContent = a.steps.toLocaleString();
  const sub = document.getElementById('pulsera-activity-sub');
  if (sub) sub.textContent = `${(a.distance / 1000).toFixed(2)} km · ${a.calories} kcal · ${new Date(a.at).toLocaleTimeString()}`;
}

// ---------------- Page actions (window handlers) ----------------

// These bands rarely advertise the UART service UUID — the FitPro app and
// Gadgetbridge discover them by advertised name instead. Try service+names
// first; if the picker comes back empty, fall back to showing all devices.
const FITPRO_NAME_PREFIXES = ['M8', 'M7', 'M6', 'M5', 'M4', 'Y68', '716', 'D13', 'Watch', 'FitPro', 'Band', 'Smart', 'LX'];

async function requestBand() {
  const optionalServices = [NUS_SERVICE, BATTERY_SVC, DIS_SVC];
  try {
    return await navigator.bluetooth.requestDevice({
      filters: [{ services: [NUS_SERVICE] }, ...FITPRO_NAME_PREFIXES.map(p => ({ namePrefix: p }))],
      optionalServices,
    });
  } catch (e) {
    if (e.name !== 'NotFoundError') throw e;
    dlog('Sin coincidencias por filtro; mostrando todos los dispositivos BLE…');
    setPulseraStatus('Elige tu pulsera en la lista (aparece como M8 o similar).');
    return await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
  }
}

async function connectPulsera() {
  if (Pulsera.connecting || Pulsera.connected) return;
  Pulsera.connecting = true;
  setPulseraStatus('Buscando tu pulsera… (despiértala con un toque)');
  dlog('Solicitando dispositivo…');
  try {
    const device = await requestBand();
    Pulsera.device = device;
    Pulsera.name = device.name || 'Pulsera M8';
    device.addEventListener('gattserverdisconnected', onGattDisconnected);

    setPulseraStatus('Conectando…');
    const server = await device.gatt.connect();
    let svc;
    try {
      svc = await server.getPrimaryService(NUS_SERVICE);
    } catch (e) {
      device.gatt.disconnect();
      throw new Error('ese dispositivo no parece ser una pulsera FitPro/M8');
    }
    const rx = await svc.getCharacteristic(NUS_RX);
    Pulsera.tx = await svc.getCharacteristic(NUS_TX);
    await rx.startNotifications();
    rx.addEventListener('characteristicvaluechanged', handleRx);
    dlog('Conectado a ' + Pulsera.name);

    await readBattery();
    await readFirmware();
    await initSequence();

    Pulsera.connected = true;
    Pulsera.connecting = false;
    savePulsera();
    renderPulsera();
  } catch (e) {
    Pulsera.connecting = false;
    dlog('Error de conexión: ' + e.message);
    if (e.name === 'NotFoundError') {
      setPulseraStatus('Selección cancelada. Intenta de nuevo cuando quieras.');
    } else {
      setPulseraStatus('No se pudo conectar: ' + e.message + '. Acerca la pulsera y reintenta.');
    }
  }
}

async function disconnectPulsera() {
  try {
    if (Pulsera.device && Pulsera.device.gatt.connected) Pulsera.device.gatt.disconnect();
  } catch (e) { dlog('Error al desconectar: ' + e.message); }
  onGattDisconnected();
}

async function measureHR() {
  if (!Pulsera.connected || Pulsera.hrMeasuring) return;
  Pulsera.hrMeasuring = true;
  setPulseraStatus('Midiendo frecuencia cardíaca… quédate quieto (hasta 60 s).');
  try {
    await bleSend(craftFrame(GRP_GENERAL, CMD_HR_MEASURE, [0x01]));
  } catch (e) {
    setPulseraStatus('Error al medir: ' + e.message);
    Pulsera.hrMeasuring = false;
    return;
  }
  Pulsera.hrStopTimer = setTimeout(async () => {
    Pulsera.hrMeasuring = false;
    try { await bleSend(craftFrame(GRP_GENERAL, CMD_HR_MEASURE, [0x00])); } catch (e) { /* ignore */ }
    if (Pulsera.hr) setPulseraStatus('Medición lista.');
    else setPulseraStatus('Sin lectura — ajusta la pulsera en tu muñeca e intenta otra vez.');
  }, 60000);
}

async function syncActivity() {
  if (!Pulsera.connected || Pulsera.syncing) return;
  Pulsera.syncing = true;
  setPulseraStatus('Sincronizando actividad…');
  try {
    await bleSend(craftFrame(GRP_SPORTS, CMD_DAY_SUMMARY, [0x01]));
  } catch (e) {
    setPulseraStatus('Error al sincronizar: ' + e.message);
  }
  setTimeout(() => { Pulsera.syncing = false; }, 5000);
}

async function findBand() {
  if (!Pulsera.connected) return;
  setPulseraStatus('Haciendo vibrar tu pulsera…');
  try {
    await bleSend(craftFrame(GRP_GENERAL, CMD_FIND_BAND, [0x01]));
    await sleep(6000);
    await bleSend(craftFrame(GRP_GENERAL, CMD_FIND_BAND, [0x00]));
  } catch (e) {
    setPulseraStatus('Error: ' + e.message);
  }
}

async function testReminder() {
  if (!Pulsera.connected) return;
  const enc = new TextEncoder();
  const sender = enc.encode('Farmacia Apolo');
  const body = enc.encode('Hora de tu medicamento');
  const payload = new Uint8Array(3 + sender.length + 1 + body.length + 1);
  payload[0] = 0x01; // SMS icon
  payload.set(sender, 3);
  payload[3 + sender.length] = 0x20;
  payload.set(body, 3 + sender.length + 1);
  payload[payload.length - 1] = 0x20;
  try {
    await bleSend(craftFrame(GRP_GENERAL, CMD_NOTIFY_MSG, payload));
    setPulseraStatus('Recordatorio de prueba enviado a tu pulsera.');
  } catch (e) {
    setPulseraStatus('Error al enviar: ' + e.message);
  }
}

function copyDebugLog() {
  const text = debugLines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => setPulseraStatus('Registro copiado.'),
      () => setPulseraStatus('No se pudo copiar el registro.')
    );
  }
}

// ---------------- Page render ----------------

export function renderPulsera() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;
  const saved = loadSavedPulsera();
  const bleOK = !!navigator.bluetooth;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const specItem = (icon, label, value) => `
    <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0;">
      <span style="font-size: 1.1rem;">${icon}</span>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${label}</div>
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">${value}</div>
      </div>
    </div>`;

  const compatCard = `
    <div class="glass-card" style="margin: 1rem; padding: 1.25rem;">
      <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--text-secondary);">⚠️ Este navegador no soporta Bluetooth</div>
      ${isIOS ? `
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 0.5rem;">En iPhone, la conexión con tu pulsera funciona desde el navegador <b>Bluefy</b> (gratis):</p>
        <ol style="font-size: 0.85rem; color: var(--text-muted); margin: 0; padding-left: 1.25rem; line-height: 1.6;">
          <li>Descarga <b>Bluefy – Web BLE Browser</b> del App Store.</li>
          <li>Abre Bluefy y entra a esta misma página de Farmacia Apolo.</li>
          <li>Inicia sesión y regresa a la sección <b>Pulsera</b>.</li>
        </ol>` : `
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">Abre esta página en <b>Google Chrome</b> (Android o computadora) con el Bluetooth encendido para conectar tu pulsera.</p>`}
    </div>`;

  const connectCard = `
    <div class="glass-card" style="margin: 1rem; padding: 1.5rem; text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⌚</div>
      <button onclick="connectPulsera()" style="width: 100%; padding: 1rem 1.5rem; background: #1E2A8A; color: white; border: none; border-radius: 14px; font-size: 1.05rem; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(30,42,138,0.35);">
        Conectar Mi Pulsera
      </button>
      <p id="pulsera-status" style="font-size: 0.8rem; color: var(--text-muted); margin: 0.75rem 0 0;">Despierta tu pulsera con un toque y mantenla cerca del teléfono. Si tienes la app <b>FitPro</b> instalada, ciérrala primero — la pulsera solo se conecta a una app a la vez.</p>
      ${saved.name ? `<p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.5rem 0 0;">Última pulsera vinculada: <b>${escapeHtml(saved.name)}</b></p>` : ''}
    </div>`;

  const act = Pulsera.activity || saved.activity;
  const hr = Pulsera.hr || saved.hr;
  const dashboardCard = `
    <div class="glass-card" style="margin: 1rem; padding: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div>
          <div style="font-weight: 700; color: var(--text-secondary);">⌚ ${escapeHtml(Pulsera.name)}</div>
          <div style="font-size: 0.75rem; color: #359268; font-weight: 600;">● Conectada</div>
        </div>
        <div style="text-align: right; font-size: 0.8rem; color: var(--text-muted);">
          ${Pulsera.battery != null ? `🔋 ${Pulsera.battery}%` : ''}
          ${Pulsera.firmware ? `<div style="font-size: 0.7rem;">fw ${escapeHtml(Pulsera.firmware)}</div>` : ''}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
        <div style="background: #fef2f2; border-radius: 14px; padding: 0.9rem; text-align: center;">
          <div style="font-size: 0.7rem; color: #b91c1c; font-weight: 600;">FRECUENCIA</div>
          <div id="pulsera-hr-value" style="font-size: 1.8rem; font-weight: 800; color: #b91c1c;">${hr ? hr.bpm + ' <span style="font-size: 1rem; font-weight: 500;">lpm</span>' : '—'}</div>
          <div id="pulsera-hr-sub" style="font-size: 0.65rem; color: var(--text-muted);">${hr ? `SpO2 ${hr.spo2}% · PA ${hr.bpHigh}/${hr.bpLow} · ${new Date(hr.at).toLocaleTimeString()}` : 'Sin medición aún'}</div>
        </div>
        <div style="background: #eff6ff; border-radius: 14px; padding: 0.9rem; text-align: center;">
          <div style="font-size: 0.7rem; color: #1E2A8A; font-weight: 600;">PASOS HOY</div>
          <div id="pulsera-steps-value" style="font-size: 1.8rem; font-weight: 800; color: #1E2A8A;">${act ? act.steps.toLocaleString() : '—'}</div>
          <div id="pulsera-activity-sub" style="font-size: 0.65rem; color: var(--text-muted);">${act ? `${(act.distance / 1000).toFixed(2)} km · ${act.calories} kcal · ${new Date(act.at).toLocaleTimeString()}` : 'Sincroniza para ver'}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        <button onclick="pulseraMeasureHR()" style="padding: 0.7rem; background: linear-gradient(135deg, #46AC78, #359268); color: white; border: none; border-radius: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">❤️ Medir frecuencia</button>
        <button onclick="pulseraSync()" style="padding: 0.7rem; background: #1E2A8A; color: white; border: none; border-radius: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">🔄 Sincronizar pasos</button>
        <button onclick="pulseraFind()" style="padding: 0.7rem; background: rgba(30,42,138,0.08); color: #1E2A8A; border: 1px solid rgba(30,42,138,0.2); border-radius: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">📳 Encontrar pulsera</button>
        <button onclick="pulseraTestReminder()" style="padding: 0.7rem; background: rgba(30,42,138,0.08); color: #1E2A8A; border: 1px solid rgba(30,42,138,0.2); border-radius: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">💊 Probar recordatorio</button>
      </div>
      <p id="pulsera-status" style="font-size: 0.8rem; color: var(--text-muted); margin: 0.75rem 0 0; text-align: center;"></p>
      <button onclick="pulseraDisconnect()" style="width: 100%; margin-top: 0.5rem; padding: 0.5rem; background: none; color: #b91c1c; border: none; font-size: 0.8rem; cursor: pointer;">Desconectar</button>
    </div>`;

  mainContent.innerHTML = `
    <div id="pulsera-page">
      <div style="padding: 1rem; background: linear-gradient(120deg, #2B37A5 0%, #1E2A8A 48%, #141B5E 100%); color: white;">
        <h2 style="margin: 0; font-size: 1.3rem;">Mi Pulsera</h2>
        <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Pulsera Inteligente M8 · beneficio de membresía</p>
      </div>

      ${!bleOK ? compatCard : (Pulsera.connected ? dashboardCard : connectCard)}

      <div class="glass-card" style="margin: 1rem; padding: 1.25rem;">
        <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--text-secondary);">⌚ Tu pulsera M8</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 0.5rem;">
          ${specItem('📺', 'Pantalla', '0.96" TFT a color')}
          ${specItem('📶', 'Conexión', 'Bluetooth 4.0 BLE')}
          ${specItem('💧', 'Resistencia', 'IP67 (agua y polvo)')}
          ${specItem('🔋', 'Batería', '4–7 días de uso')}
          ${specItem('⏱️', 'En espera', 'Hasta 45 días')}
          ${specItem('🧲', 'Carga', 'Clip magnético USB')}
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0 0;">Monitorea frecuencia cardíaca, oxígeno (SpO2), presión, sueño y estrés. 30 modos de ejercicio.</p>
      </div>

      <div class="glass-card" style="margin: 1rem; padding: 1.25rem;">
        <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--text-secondary);">📊 Qué monitoreamos</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.7;">
          👟 <b>Pasos</b>, distancia y calorías del día<br>
          ❤️ <b>Frecuencia cardíaca</b> y SpO2 bajo demanda<br>
          😴 <b>Sueño</b> (ligero, profundo, despierto)<br>
          💊 <b>Recordatorios de medicamentos</b> con vibración en tu muñeca
        </div>
        <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0.75rem 0 0; border-top: 1px solid var(--glass-border, #e5e7eb); padding-top: 0.6rem;">
          La pulsera M8 no es un dispositivo médico. Sus mediciones son informativas y no sustituyen
          la consulta con un profesional de la salud. Tus datos se guardan únicamente en tu teléfono.
        </p>
      </div>

      <div class="glass-card" style="margin: 1rem; padding: 1rem;">
        <details>
          <summary style="font-size: 0.8rem; color: var(--text-muted); cursor: pointer;">Registro de conexión (diagnóstico)</summary>
          <pre id="pulsera-debug-pre" style="max-height: 180px; overflow: auto; font-size: 0.65rem; background: #0f172a; color: #a5f3fc; padding: 0.6rem; border-radius: 10px; white-space: pre-wrap; word-break: break-all;">${debugLines.join('\n')}</pre>
          <button onclick="pulseraCopyLog()" style="padding: 0.4rem 0.8rem; background: rgba(30,42,138,0.08); color: #1E2A8A; border: 1px solid rgba(30,42,138,0.2); border-radius: 8px; font-size: 0.75rem; cursor: pointer;">Copiar registro</button>
        </details>
      </div>
    </div>
  `;
}

// Expose handlers for inline onclick
window.connectPulsera = connectPulsera;
window.pulseraDisconnect = disconnectPulsera;
window.pulseraMeasureHR = measureHR;
window.pulseraSync = syncActivity;
window.pulseraFind = findBand;
window.pulseraTestReminder = testReminder;
window.pulseraCopyLog = copyDebugLog;
