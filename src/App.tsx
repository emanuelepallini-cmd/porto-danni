import { useState, useEffect, useRef, useCallback } from "react";

// ─── Supabase config ───────────────────────────────────────────────────────────
const SUPABASE_URL = "https://xmrtrghaiiycbrysrmwn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtcnRyZ2hhaWl5Y2JyeXNybXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjM1NTAsImV4cCI6MjA5NDQ5OTU1MH0.zo52TZvvPWaM4Yrkr0rlM_DhafsUidWxucixP2p8JCc";

async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function getReports()  { return sbFetch("reports?select=*&order=date.desc"); }
async function getResolved() { return sbFetch("resolved?select=*&order=resolved_at.desc"); }
async function getFuoriUso() { return sbFetch("fuori_uso?select=*&order=date_in.desc"); }
async function getMessages() { return sbFetch("messages?select=*&order=created_at.asc&limit=100"); }

async function insertReport(r: Report) {
  return sbFetch("reports", { method: "POST", body: JSON.stringify({
    id: r.id, driver: r.driver, plate: r.plate,
    vehicle_type: r.vehicleType, damage_type: r.damageType,
    description: r.description, date: r.date,
    photo: r.photo || null, has_photo: r.hasPhoto,
  })});
}
async function deleteReport(id: string)   { return sbFetch(`reports?id=eq.${id}`, { method: "DELETE" }); }
async function insertResolved(r: Report)  {
  return sbFetch("resolved", { method: "POST", body: JSON.stringify({
    id: r.id, driver: r.driver, plate: r.plate,
    vehicle_type: r.vehicleType, damage_type: r.damageType,
    description: r.description, date: r.date,
    photo: r.photo || null, has_photo: r.hasPhoto,
    resolved_at: r.resolvedAt, resolve_note: r.resolveNote || "",
  })});
}
async function deleteResolved(id: string) { return sbFetch(`resolved?id=eq.${id}`, { method: "DELETE" }); }
async function insertFuoriUso(f: FuoriUso) {
  return sbFetch("fuori_uso", { method: "POST", body: JSON.stringify({
    id: f.id, plate: f.plate, vehicle_type: f.vehicleType,
    reason: f.reason, date_in: f.dateIn,
    date_expected_out: f.dateExpectedOut || null, note: f.note || "",
  })});
}
async function deleteFuoriUso(id: string) { return sbFetch(`fuori_uso?id=eq.${id}`, { method: "DELETE" }); }
async function insertMessage(author: string, text: string) {
  return sbFetch("messages", { method: "POST", body: JSON.stringify({
    id: "MSG-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase(),
    author, text, created_at: new Date().toISOString()
  })});
}
async function insertFeedback(stars: number, text: string, anonymous: boolean, author: string) {
  return sbFetch("feedback", { method: "POST", body: JSON.stringify({
    id: "FBK-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase(),
    stars, text, author: anonymous ? "Anonimo" : author,
    created_at: new Date().toISOString()
  })});
}
async function getFeedback() { return sbFetch("feedback?select=*&order=created_at.desc"); }
async function resetAllData() {
  const tables = ["reports","resolved","fuori_uso","messages","feedback"];
  for (const t of tables) {
    await sbFetch(`${t}?id=not.is.null`, { method:"DELETE", headers:{ "Prefer":"return=minimal" } }).catch(()=>{});
  }
}

// ─── Haptic + Sound ────────────────────────────────────────────────────────────
function playClick(type: "soft"|"success"|"error" = "soft") {
  try {
    if (navigator.vibrate) {
      if (type === "soft")    navigator.vibrate(8);
      if (type === "success") navigator.vibrate([10, 30, 10]);
      if (type === "error")   navigator.vibrate([20, 20, 20]);
    }
    const ctx = new (window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "soft")    { osc.frequency.value = 600; gain.gain.setValueAtTime(0.06, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06); }
    if (type === "success") { osc.frequency.value = 880; gain.gain.setValueAtTime(0.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12); }
    if (type === "error")   { osc.frequency.value = 220; gain.gain.setValueAtTime(0.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); }
    osc.start(); osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}

function playNewReportSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext)();
    // Suono "ding-dong" tipo notifica mail
    const notes = [
      { freq: 988, start: 0,    dur: 0.15 }, // SI
      { freq: 1319, start: 0.12, dur: 0.25 }, // MI alto
    ];
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime + n.start);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.dur);
      osc.start(ctx.currentTime + n.start);
      osc.stop(ctx.currentTime + n.start + n.dur);
    });
    setTimeout(() => ctx.close(), 600);
    if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
  } catch {}
}

function dbToReport(r: Record<string, unknown>): Report {
  return { id: r.id as string, driver: r.driver as string, plate: r.plate as string, vehicleType: r.vehicle_type as string, damageType: r.damage_type as string, description: r.description as string, date: r.date as string, photo: r.photo as string | null, hasPhoto: r.has_photo as boolean };
}
function dbToResolved(r: Record<string, unknown>): Report {
  return { ...dbToReport(r), resolvedAt: r.resolved_at as string, resolveNote: r.resolve_note as string };
}
function dbToFuoriUso(r: Record<string, unknown>): FuoriUso {
  return { id: r.id as string, plate: r.plate as string, vehicleType: r.vehicle_type as string, reason: r.reason as string, dateIn: r.date_in as string, dateExpectedOut: r.date_expected_out as string | undefined, note: r.note as string | undefined };
}

// ─── Push notifications ────────────────────────────────────────────────────────
async function requestNotifPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}
function sendNotif(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "https://em-content.zobj.net/source/apple/391/anchor_2693.png" }); } catch {}
}

// ─── OpenWeatherMap config ─────────────────────────────────────────────────────
const OWM_KEY  = "183c56fa8c7c89d75d4d5a5d01bd6c0e";
const OWM_LAT  = 42.9196;
const OWM_LON  = 10.5317;

interface ForecastSlot { time: string; temp: number; icon: string; rain: number; windSpeed: number; }
interface WeatherData {
  temp: number; feels: number; humidity: number;
  description: string; icon: string;
  windSpeed: number; windDeg: number;
  city: string; sunrise: number; sunset: number;
  uvi: number; rainProb: number;
  forecast: ForecastSlot[];
}
async function fetchWeather(): Promise<WeatherData> {
  const [cur, fore, uv] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${OWM_LAT}&lon=${OWM_LON}&appid=${OWM_KEY}&units=metric&lang=it`).then(r=>r.json()),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${OWM_LAT}&lon=${OWM_LON}&appid=${OWM_KEY}&units=metric&lang=it&cnt=4`).then(r=>r.json()),
    fetch(`https://api.openweathermap.org/data/2.5/uvi?lat=${OWM_LAT}&lon=${OWM_LON}&appid=${OWM_KEY}`).then(r=>r.json()),
  ]);
  const forecast: ForecastSlot[] = (fore.list || []).slice(1,4).map((f: Record<string,unknown>) => {
    const main = f.main as Record<string,number>;
    const weather = (f.weather as Record<string,unknown>[])[0] as Record<string,string>;
    const wind = f.wind as Record<string,number>;
    return {
      time: new Date((f.dt as number)*1000).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}),
      temp: Math.round(main.temp),
      icon: weather.icon,
      rain: Math.round(((f.pop as number)||0)*100),
      windSpeed: Math.round((wind.speed||0)*3.6),
    };
  });
  return {
    temp: Math.round(cur.main.temp),
    feels: Math.round(cur.main.feels_like),
    humidity: cur.main.humidity,
    description: cur.weather[0].description,
    icon: cur.weather[0].icon,
    windSpeed: Math.round(cur.wind.speed * 3.6),
    windDeg: cur.wind.deg || 0,
    city: cur.name,
    sunrise: cur.sys.sunrise,
    sunset: cur.sys.sunset,
    uvi: Math.round(uv.value || 0),
    rainProb: Math.round(((fore.list?.[0]?.pop)||0)*100),
    forecast,
  };
}
function uviLabel(uvi: number) {
  if (uvi >= 11) return { label:"ESTREMO", color:"#7c3aed" };
  if (uvi >= 8)  return { label:"MOLTO ALTO", color:"#ef4444" };
  if (uvi >= 6)  return { label:"ALTO", color:"#f97316" };
  if (uvi >= 3)  return { label:"MODERATO", color:"#eab308" };
  return { label:"BASSO", color:"#22c55e" };
}
function windDir(deg: number) {
  const dirs = ["N","NE","E","SE","S","SW","O","NO"];
  return dirs[Math.round(deg / 45) % 8];
}
function windAlert(speed: number) {
  if (speed >= 60) return { label:"PERICOLO", color:"#ef4444" };
  if (speed >= 40) return { label:"ATTENZIONE", color:"#f97316" };
  if (speed >= 25) return { label:"MODERATO", color:"#eab308" };
  return { label:"REGOLARE", color:"#22c55e" };
}

// ─── Costanti ──────────────────────────────────────────────────────────────────
const VEHICLE_TYPES  = ["Gru","Motopala","Muletto","Escavatore","Macchina","Carroponte","Camion","Rimorchio","Attrezzatura di Sollevamento","Tramoggia"];
const DAMAGE_TYPES   = ["Carrozzeria","Impianto Idraulico","Motore / Meccanica","Impianto Elettrico","Pneumatici / Cingoli","Struttura / Telaio","Braccio / Benna","Cabina / Interno","Sistema di Sollevamento","Altro"];
const ADMIN_PASSWORD = "porto2026";
const BLUE    = "#0369a1";
const BLUE_LT = "#0ea5e9";
const ORANGE  = "#f97316";
const GREEN   = "#22c55e";
const RED     = "#ef4444";
const YELLOW  = "#eab308";
const BG      = "#080f1c";
const CARD    = "#0d1526";
const BORDER  = "#162035";
const APP_VERSION   = "v1.3.4";
const LOGO_BASE64   = "data:image/jpeg;base64,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";
const RESET_PASSWORD = "RESET2026";
const CRITICAL = ["Motore / Meccanica","Impianto Idraulico","Struttura / Telaio","Sistema di Sollevamento"];
const MEDIUM   = ["Impianto Elettrico","Braccio / Benna","Pneumatici / Cingoli"];

function genId() { return "PRT-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase(); }
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"}) + " • " + d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}) + " " + d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});
}
async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface Report {
  id: string; driver: string; plate: string; vehicleType: string;
  damageType: string; description: string; date: string;
  photo: string | null; hasPhoto: boolean;
  resolvedAt?: string; resolveNote?: string;
}
interface FuoriUso {
  id: string; plate: string; vehicleType: string; reason: string;
  dateIn: string; dateExpectedOut?: string; note?: string;
}
interface Message {
  id: string; author: string; text: string; created_at: string;
}

// ─── Componenti base ───────────────────────────────────────────────────────────
function SeverityBadge({ type }: { type: string }) {
  const color = CRITICAL.includes(type) ? RED : MEDIUM.includes(type) ? ORANGE : BLUE_LT;
  const label = CRITICAL.includes(type) ? "CRITICO" : MEDIUM.includes(type) ? "MEDIO" : "LIEVE";
  return <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.5, padding:"3px 9px", borderRadius:3, background:color+"22", color, border:`1px solid ${color}55` }}>{label}</span>;
}
function Label({ text }: { text: string }) {
  return <div style={{ fontSize:11, color:"var(--sub)", letterSpacing:1.8, fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>{text}</div>;
}
function FieldInput({ value, onChange, placeholder, error, style={} }: { value: string; onChange: (v: string) => void; placeholder: string; error?: boolean; style?: React.CSSProperties }) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${error?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", ...style }} />;
}
function InfoCard({ icon, label, value, accent, small, green, extra }: { icon: string; label: string; value: string; accent?: boolean; small?: boolean; green?: boolean; extra?: React.ReactNode }) {
  const top = accent ? ORANGE : green ? GREEN : BLUE+"88";
  const col = accent ? ORANGE : green ? GREEN : "#d0e4f7";
  return (
    <div style={{ background:"var(--card)", borderRadius:10, padding:"13px 15px", border:`1px solid var(--border)`, borderTop:`2px solid ${top}` }}>
      <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:5 }}>{icon} {label.toUpperCase()}</div>
      <div style={{ fontSize:small?13:17, fontWeight:800, fontFamily:"Barlow Condensed, sans-serif", color:col, letterSpacing:accent||green?2:0 }}>{value}</div>
      {extra && <div style={{ marginTop:6 }}>{extra}</div>}
    </div>
  );
}
function Modal({ show, onClose, borderColor=RED, icon, title, titleColor, children }: { show: boolean; onClose: () => void; borderColor?: string; icon: string; title: string; titleColor?: string; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000cc", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0a1525", border:`1px solid ${borderColor}44`, borderTop:`3px solid ${borderColor}`, borderRadius:14, padding:"28px 24px", maxWidth:400, width:"100%", boxShadow:"0 20px 60px #00000099" }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:34, marginBottom:10 }}>{icon}</div>
          <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:titleColor||borderColor, letterSpacing:1.5 }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
function SuccessBanner({ toast, onClose }: { toast: { id: number; title: string; sub: string } | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div style={{ marginBottom:20, borderRadius:12, padding:"16px 18px", background:"#041a0c", border:`1px solid ${GREEN}55`, borderLeft:`5px solid ${GREEN}`, display:"flex", alignItems:"center", gap:14 }}>
      <span style={{ fontSize:26, flexShrink:0 }}>✅</span>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:16, letterSpacing:1.5, color:GREEN, marginBottom:2 }}>{toast.title}</div>
        <div style={{ fontSize:12, color:"#4a8a5a" }}>{toast.sub}</div>
      </div>
      <button onClick={onClose} style={{ background:"none", border:"none", color:"#2a4a2a", fontSize:18, cursor:"pointer" }}>✕</button>
    </div>
  );
}

// ─── Chat Panel ────────────────────────────────────────────────────────────────
function ChatPanel({ onClose, userName }: { onClose: () => void; userName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMsgs() {
    try { const m = await getMessages(); setMessages(m); } catch {}
  }
  useEffect(() => { loadMsgs(); const t = setInterval(loadMsgs, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try { await insertMessage(userName, text.trim()); setText(""); await loadMsgs(); } catch {}
    setSending(false);
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000cc", zIndex:998, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"var(--card)", border:`1px solid var(--border)`, borderTop:`3px solid ${BLUE_LT}`, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:740, height:"75vh", display:"flex", flexDirection:"column", boxShadow:"0 -8px 40px #00000088" }}>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:GREEN, boxShadow:`0 0 8px ${GREEN}` }} />
            <div>
              <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:17, letterSpacing:2, color:"#e8f4ff" }}>💬 CHAT OPERATORI</div>
              <div style={{ fontSize:10, color:"var(--sub)" }}>COMPAGNIA PORTUALI — aggiornamento ogni 8s</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--sub)", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"6px 20px", borderBottom:`1px solid var(--border)`, background:"var(--input-bg)", flexShrink:0 }}>
          <span style={{ fontSize:11, color:"var(--sub)" }}>Stai chattando come: <span style={{ color:ORANGE, fontWeight:700 }}>{userName}</span></span>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"14px 18px", display:"flex", flexDirection:"column", gap:10 }}>
          {messages.length === 0 && (
            <div style={{ textAlign:"center", padding:40, color:"#1e3a5f" }}>
              <div style={{ fontSize:30, marginBottom:8 }}>💬</div>
              <div style={{ fontSize:13 }}>Nessun messaggio ancora. Scrivi il primo!</div>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems: m.author===userName ? "flex-end" : "flex-start" }}>
              <div style={{ fontSize:10, color: m.author==="🤖 Sistema" ? GREEN : "#3b6fa0", marginBottom:3 }}>
                {m.author===userName ? "Tu" : m.author} • {formatTime(m.created_at)}
              </div>
              <div style={{
                maxWidth:"80%", padding:"10px 14px",
                borderRadius: m.author===userName ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.author==="🤖 Sistema" ? "#041a0c" : m.author===userName ? `linear-gradient(135deg,${BLUE},${BLUE_LT})` : "#0d1a2e",
                border: m.author==="🤖 Sistema" ? `1px solid ${GREEN}44` : m.author===userName ? "none" : `1px solid ${BORDER}`,
                fontSize:13, color: m.author==="🤖 Sistema" ? "#6ee87d" : "#e2eaf5", lineHeight:1.5,
              }}>{m.text}</div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
        <div style={{ padding:"12px 16px", borderTop:`1px solid ${BORDER}`, display:"flex", gap:10, flexShrink:0 }}>
          <input value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="Scrivi un messaggio…"
            style={{ flex:1, background:"var(--input-bg)", color:"var(--text)", border:`1px solid var(--border)`, borderRadius:10, padding:"11px 14px", fontSize:14, fontFamily:"inherit" }}/>
          <button onClick={send} disabled={sending||!text.trim()}
            style={{ background:text.trim()&&!sending?BLUE_LT:"#1a2a3a", color:"#fff", border:"none", borderRadius:10, padding:"11px 18px", cursor:text.trim()&&!sending?"pointer":"default", fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, fontSize:14 }}>
            {sending ? "…" : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────────────────────
function StatsTab({ reports, resolved, fuoriUso }: { reports: Report[]; resolved: Report[]; fuoriUso: FuoriUso[] }) {
  const PURPLE = "#a855f7";
  const all = [...reports, ...resolved];

  // Guasti per tipo mezzo
  const byVehicle = VEHICLE_TYPES.map(v => ({
    label: v, count: all.filter(r => r.vehicleType === v).length
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count);

  // Guasti per tipo danno
  const byDamage = DAMAGE_TYPES.map(d => ({
    label: d, count: all.filter(r => r.damageType === d).length,
    color: CRITICAL.includes(d) ? RED : MEDIUM.includes(d) ? ORANGE : BLUE_LT
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count);

  // Guasti ultimi 7 giorni
  const last7 = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i));
    const label = d.toLocaleDateString("it-IT",{weekday:"short"});
    const count = all.filter(r => new Date(r.date).toDateString() === d.toDateString()).length;
    return { label, count };
  });
  const maxDay = Math.max(...last7.map(d=>d.count), 1);

  // Tasso risoluzione
  const totale = all.length;
  const risolti = resolved.length;
  const pctRisolti = totale ? Math.round(risolti/totale*100) : 0;

  const maxV = Math.max(...byVehicle.map(v=>v.count), 1);
  const maxD = Math.max(...byDamage.map(d=>d.count), 1);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* KPI row */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        {[
          { label:"Totale segnalazioni", value:totale, color:PURPLE, icon:"📋" },
          { label:"Tasso risoluzione", value:`${pctRisolti}%`, color:GREEN, icon:"✅" },
          { label:"Mezzi fuori uso", value:fuoriUso.length, color:"var(--fuori-uso-text)", icon:"🔧" },
          { label:"Critici attivi", value:reports.filter(r=>CRITICAL.includes(r.damageType)).length, color:RED, icon:"🚨" },
        ].map(k => (
          <div key={k.label} style={{ flex:1, minWidth:120, background:"var(--card)", border:`1px solid ${k.color}33`, borderTop:`3px solid ${k.color}`, borderRadius:10, padding:"12px" }}>
            <div style={{ fontSize:9, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{k.icon} {k.label.toUpperCase()}</div>
            <div style={{ fontSize:26, fontWeight:900, color:k.color, fontFamily:"Barlow Condensed, sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Grafico ultimi 7 giorni */}
      <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderTop:`3px solid ${PURPLE}` }}>
        <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:14 }}>📅 GUASTI ULTIMI 7 GIORNI</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80 }}>
          {last7.map((d,i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ fontSize:10, color:PURPLE, fontWeight:700 }}>{d.count > 0 ? d.count : ""}</div>
              <div style={{ width:"100%", background:d.count>0?PURPLE:BORDER, borderRadius:"4px 4px 0 0", height:`${Math.max(4, d.count/maxDay*60)}px`, transition:"height .4s", opacity:d.count>0?1:0.3 }}/>
              <div style={{ fontSize:9, color:"var(--sub)", textTransform:"capitalize" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mezzi più problematici */}
      {byVehicle.length > 0 && (
        <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderTop:`3px solid ${ORANGE}` }}>
          <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:14 }}>🏗 MEZZI PIÙ PROBLEMATICI</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {byVehicle.slice(0,6).map((v,i) => (
              <div key={v.label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:11, color:i===0?ORANGE:"#3b6fa0", fontWeight:700, width:16 }}>{i+1}</div>
                <div style={{ fontSize:12, color:"var(--text-dim)", width:160, flexShrink:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{v.label}</div>
                <div style={{ flex:1, height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${v.count/maxV*100}%`, height:"100%", background:i===0?ORANGE:BLUE_LT, borderRadius:4, transition:"width .5s" }}/>
                </div>
                <div style={{ fontSize:12, fontWeight:800, color:i===0?ORANGE:BLUE_LT, width:20, textAlign:"right" }}>{v.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tipi di danno */}
      {byDamage.length > 0 && (
        <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderTop:`3px solid ${RED}` }}>
          <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:14 }}>🔧 TIPI DI DANNO PIÙ FREQUENTI</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {byDamage.slice(0,6).map(d => (
              <div key={d.label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:12, color:"var(--text-dim)", width:180, flexShrink:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.label}</div>
                <div style={{ flex:1, height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${d.count/maxD*100}%`, height:"100%", background:d.color, borderRadius:4, transition:"width .5s" }}/>
                </div>
                <div style={{ fontSize:12, fontWeight:800, color:d.color, width:20, textAlign:"right" }}>{d.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totale === 0 && (
        <div style={{ textAlign:"center", padding:50 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:15, color:"#1e3a5f", fontFamily:"Barlow Condensed, sans-serif", fontWeight:800 }}>NESSUN DATO ANCORA</div>
          <div style={{ fontSize:12, color:"#1e3a5f", marginTop:8 }}>Le statistiche appariranno dopo le prime segnalazioni.</div>
        </div>
      )}
    </div>
  );
}

// ─── Feedback Panel ────────────────────────────────────────────────────────────
function FeedbackPanel({ onClose, userName }: { onClose: () => void; userName: string }) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (stars === 0 || sending) return;
    playClick("success");
    setSending(true);
    try { await insertFeedback(stars, text.trim(), anonymous, userName); setSent(true); }
    catch { playClick("error"); alert("Errore nell'invio. Riprova."); }
    setSending(false);
  }

  const starLabels = ["","Pessima","Scarsa","Nella media","Buona","Eccellente"];
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000cc", zIndex:998, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"var(--bg)", border:`1px solid var(--border)`, borderTop:`3px solid ${ORANGE}`, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:740, padding:"24px 20px 32px", boxShadow:"0 -8px 40px #00000088" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, letterSpacing:2, color:"#e8f4ff" }}>💡 FEEDBACK</div>
            <div style={{ fontSize:11, color:"var(--sub)", marginTop:2 }}>Aiutaci a migliorare l'app</div>
          </div>
          <button onClick={()=>{ playClick("soft"); onClose(); }} style={{ background:"none", border:"none", color:"var(--sub)", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>
        {sent ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:GREEN, letterSpacing:2, marginBottom:8 }}>GRAZIE!</div>
            <div style={{ fontSize:13, color:"var(--sub)", marginBottom:20 }}>Il tuo feedback è stato inviato.</div>
            <button onClick={()=>{ playClick("soft"); onClose(); }} style={{ padding:"10px 28px", background:ORANGE, color:"#fff", border:"none", borderRadius:8, fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, fontSize:14, letterSpacing:1.5, cursor:"pointer" }}>Chiudi</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom:20, textAlign:"center" }}>
              <div style={{ fontSize:11, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:12 }}>COME VALUTI L'APP?</div>
              <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:8 }}>
                {[1,2,3,4,5].map(s => (
                  <span key={s} onMouseEnter={()=>setHovered(s)} onMouseLeave={()=>setHovered(0)}
                    onClick={()=>{ playClick("soft"); setStars(s); }}
                    style={{ fontSize:38, cursor:"pointer", transition:"transform .1s", transform:(hovered||stars)>=s?"scale(1.2)":"scale(1)", filter:(hovered||stars)>=s?"none":"grayscale(1) opacity(0.3)" }}>⭐</span>
                ))}
              </div>
              {(hovered||stars)>0 && <div style={{ fontSize:13, color:ORANGE, fontWeight:700, letterSpacing:1 }}>{starLabels[hovered||stars]}</div>}
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>COSA MIGLIORERESTI? (opzionale)</div>
              <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Es. Vorrei poter filtrare per data…" rows={3}
                style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid var(--border)`, borderRadius:8, padding:"11px 13px", fontSize:13, lineHeight:1.6, resize:"none", fontFamily:"inherit" }}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
              <div onClick={()=>{ playClick("soft"); setAnonymous(a=>!a); }}
                style={{ width:40, height:22, borderRadius:11, background:anonymous?BLUE_LT:BORDER, cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                <div style={{ position:"absolute", top:3, left:anonymous?20:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
              </div>
              <span style={{ fontSize:12, color:"var(--sub)" }}>Invia <span style={{ color:anonymous?BLUE_LT:"#3b6fa0", fontWeight:700 }}>{anonymous?"in modo anonimo":"con il mio nome"}</span></span>
            </div>
            <button onClick={send} disabled={stars===0||sending}
              style={{ width:"100%", padding:"13px", borderRadius:8, background:stars===0?"#1a2a3a":ORANGE, color:"#fff", border:"none", cursor:stars===0?"default":"pointer", fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, fontSize:15, letterSpacing:1.5, transition:"background .2s" }}>
              {sending?"Invio…":stars===0?"Seleziona una valutazione":"📤 INVIA FEEDBACK"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Feedback Admin Tab ────────────────────────────────────────────────────────
function FeedbackAdminTab() {
  const [items, setItems] = useState<{id:string;stars:number;text:string;author:string;created_at:string}[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getFeedback().then(d=>{setItems(d);setLoading(false);}).catch(()=>setLoading(false)); }, []);
  const avg = items.length ? (items.reduce((a,b)=>a+b.stars,0)/items.length).toFixed(1) : "—";
  return (
    <div>
      {loading ? <div style={{ textAlign:"center", padding:40, color:"var(--sub)" }}>Caricamento…</div>
      : items.length===0 ? (
        <div style={{ textAlign:"center", padding:50 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💡</div>
          <div style={{ fontSize:15, color:"#1e3a5f", fontFamily:"Barlow Condensed, sans-serif", fontWeight:800 }}>NESSUN FEEDBACK ANCORA</div>
        </div>
      ) : (
        <>
          <div style={{ background:"var(--card)", borderRadius:12, padding:"16px 20px", border:`1px solid var(--border)`, borderTop:`3px solid #f59e0b`, marginBottom:16, display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:40, color:"#f59e0b", lineHeight:1 }}>{avg}</div>
              <div style={{ fontSize:11, color:"var(--sub)", marginTop:2 }}>su {items.length} feedback</div>
            </div>
            <div style={{ flex:1 }}>
              {[5,4,3,2,1].map(s=>{ const c=items.filter(i=>i.stars===s).length; const p=items.length?(c/items.length*100):0; return (
                <div key={s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"var(--sub)", width:12 }}>{s}</span>
                  <span style={{ fontSize:12 }}>⭐</span>
                  <div style={{ flex:1, height:6, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${p}%`, height:"100%", background:"#f59e0b", borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:"var(--sub)", width:16 }}>{c}</span>
                </div>
              );})}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {items.map(f=>(
              <div key={f.id} style={{ background:"var(--card)", border:`1px solid var(--border)`, borderRadius:10, padding:"13px 15px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:f.text?6:0 }}>
                  <span style={{ fontSize:16 }}>{"⭐".repeat(f.stars)}</span>
                  <span style={{ fontSize:11, color:"var(--sub)", marginLeft:"auto" }}>👤 {f.author} · {formatDate(f.created_at)}</span>
                </div>
                {f.text && <div style={{ fontSize:13, color:"var(--text-dim)", lineHeight:1.6, fontStyle:"italic" }}>"{f.text}"</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Nome utente modal ─────────────────────────────────────────────────────────
function NameModal({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{ position:"fixed", inset:0, background:"#000000ee", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"var(--card)", border:`1px solid var(--border)`, borderTop:`3px solid ${BLUE_LT}`, borderRadius:14, padding:"28px 24px", maxWidth:360, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:34, marginBottom:10 }}>👤</div>
          <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:"var(--text-bright)", letterSpacing:1.5 }}>COME TI CHIAMI?</div>
          <div style={{ fontSize:12, color:"var(--sub)", marginTop:4 }}>Verrà mostrato nelle segnalazioni e in chat</div>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onConfirm(name.trim())}
          placeholder="Es. Mario Rossi"
          style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid var(--border)`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", marginBottom:16 }}/>
        <button onClick={()=>name.trim()&&onConfirm(name.trim())} disabled={!name.trim()}
          style={{ width:"100%", padding:"12px", borderRadius:8, background:name.trim()?ORANGE:"#1a2a3a", color:"#fff", border:"none", cursor:name.trim()?"pointer":"default", fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, fontSize:15, letterSpacing:1.5 }}>
          Entra nell'app →
        </button>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]         = useState("dashboard");
  const [reports, setReports]   = useState<Report[]>([]);
  const [resolved, setResolved] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [booting, setBooting]   = useState(true);
  const [isAdmin, setIsAdmin]   = useState(false);
  const [adminTab, setAdminTab] = useState("active");
  const [dashTab, setDashTab]       = useState("active");
  const [filterCritical, setFilterCritical] = useState(false);
  const [filterToday, setFilterToday]       = useState(false);
  const [filterType, setFilterType] = useState("Tutti");
  const [filterDate, setFilterDate] = useState({ from:"", to:"" });
  const [search, setSearch]     = useState("");
  const [fuoriUso, setFuoriUso] = useState<FuoriUso[]>([]);
  const [fuForm, setFuForm]     = useState({ plate:"", vehicleType:"", reason:"", dateExpectedOut:"", note:"" });
  const [fuErrors, setFuErrors] = useState<Record<string,boolean>>({});
  const [showFuForm, setShowFuForm] = useState(false);
  const [toast, setToast]       = useState<{ id: number; title: string; sub: string } | null>(null);
  const [busy, setBusy]         = useState(false);
  const [modal, setModal]       = useState<{ type: string; report?: Report; fuoriUso?: FuoriUso; note?: string } | null>(null);
  const [form, setForm]         = useState({ driver:"", plate:"", vehicleType:"", damageType:"", description:"", photo: null as string | null });
  const [errors, setErrors]     = useState<Record<string, boolean>>({});
  const [pwd, setPwd]           = useState("");
  const [pwdErr, setPwdErr]     = useState(false);
  const [loadErr, setLoadErr]   = useState(false);
  // Chat & notifiche
  const [showChat, setShowChat] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem("cp_username") || "");
  const [showNameModal, setShowNameModal] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [lastMsgCount, setLastMsgCount] = useState(0);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showMenu, setShowMenu]         = useState(false);
  const [showReset, setShowReset]       = useState(false);
  const [resetPwd, setResetPwd]         = useState("");
  const [resetPwdErr, setResetPwdErr]   = useState(false);
  const [resetting, setResetting]       = useState(false);
  const [darkMode, setDarkMode]       = useState<boolean>(() => {
    const saved = localStorage.getItem("cp_theme");
    if (saved !== null) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [weather, setWeather]   = useState<WeatherData | null>(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [wxError, setWxError]   = useState(false);

  const loadWeather = useCallback(async () => {
    setWxLoading(true); setWxError(false);
    try { setWeather(await fetchWeather()); } catch { setWxError(true); }
    setWxLoading(false);
  }, []);

  useEffect(() => { loadWeather(); const t = setInterval(loadWeather, 600000); return () => clearInterval(t); }, [loadWeather]);

  const fileRef  = useRef<HTMLInputElement>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevReportsLen = useRef(0);

  const goHome = useCallback((toastData?: { title: string; sub: string } | null) => {
    setView("dashboard"); setSelected(null); setIsAdmin(false);
    if (toastRef.current) clearTimeout(toastRef.current);
    if (toastData) {
      setToast({ ...toastData, id: Date.now() });
      toastRef.current = setTimeout(() => setToast(null), 5000);
    }
  }, []);

  // Mostra modal nome se non salvato
  useEffect(() => { if (!userName) setShowNameModal(true); }, [userName]);

  // Richiedi permesso notifiche
  useEffect(() => { requestNotifPermission().then(ok => setNotifEnabled(ok)); }, []);

  const loadData = useCallback(async () => {
    setLoadErr(false);
    try {
      const [reps, res, fu] = await Promise.all([getReports(), getResolved(), getFuoriUso()]);
      const newReps = reps.map(dbToReport);
      if (prevReportsLen.current > 0 && newReps.length > prevReportsLen.current) {
        const newest = newReps[0];
        sendNotif("🚨 Nuova Segnalazione", `${newest.plate} — ${newest.vehicleType} — ${newest.damageType}`);
        playNewReportSound();
      }
      prevReportsLen.current = newReps.length;
      setReports(newReps);
      setResolved(res.map(dbToResolved));
      setFuoriUso(fu.map(dbToFuoriUso));
    } catch(e) { console.error(e); setLoadErr(true); }
    setBooting(false);
  }, []);

  // Controlla nuovi messaggi chat
  const checkChat = useCallback(async () => {
    if (showChat) return;
    try {
      const msgs: Message[] = await getMessages();
      if (msgs.length > lastMsgCount && lastMsgCount > 0) {
        const newest = msgs[msgs.length - 1];
        if (newest.author !== userName && newest.author !== "🤖 Sistema") {
          setUnreadChat(u => u + (msgs.length - lastMsgCount));
          sendNotif("💬 Nuovo messaggio", `${newest.author}: ${newest.text.slice(0,60)}`);
        }
      }
      setLastMsgCount(msgs.length);
    } catch {}
  }, [showChat, lastMsgCount, userName]);

  // Segui cambio tema di sistema se l'utente non ha impostato preferenza manuale
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("cp_theme") === null) setDarkMode(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("cp_theme", next ? "dark" : "light");
  }

  // Colori tema
  const TBG    = darkMode ? "#080f1c" : "#f0f4f8";
  const TCARD  = darkMode ? "#0d1526" : "#ffffff";
  const TBORDER = darkMode ? "#162035" : "#d0dce8";
  const TTEXT  = darkMode ? "#cce0f5" : "#1a2a3a";
  const TSUB   = darkMode ? "#3b6fa0" : "#6a8faf";
  useEffect(() => { const t = setInterval(loadData, 30000); return () => clearInterval(t); }, [loadData]);
  useEffect(() => { const t = setInterval(checkChat, 15000); return () => clearInterval(t); }, [checkChat]);

  function handleSetName(name: string) {
    setUserName(name); localStorage.setItem("cp_username", name); setShowNameModal(false);
    requestNotifPermission().then(ok => { setNotifEnabled(ok); if (!ok) setTimeout(() => requestNotifPermission().then(setNotifEnabled), 500); });
  }

  async function handleSave() {
    const errs: Record<string, boolean> = {};
    if (!form.driver.trim()) errs.driver = true;
    if (!form.plate.trim())  errs.plate = true;
    if (!form.vehicleType)   errs.vehicleType = true;
    if (!form.damageType)    errs.damageType = true;
    if (!form.description.trim()) errs.description = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (busy) return;
    setBusy(true);
    try {
      const id = genId();
      const rep: Report = { id, driver:form.driver.trim(), plate:form.plate.trim().toUpperCase(), vehicleType:form.vehicleType, damageType:form.damageType, description:form.description.trim(), date:new Date().toISOString(), photo:form.photo, hasPhoto:!!form.photo };
      await insertReport(rep);
      await insertMessage("🤖 Sistema", `🚨 Nuova segnalazione: ${rep.plate} (${rep.vehicleType}) — ${rep.damageType} — segnalato da ${rep.driver}`);
      playNewReportSound();
      setReports(prev => [rep, ...prev]);
      prevReportsLen.current = reports.length + 1;
      setForm({ driver:"", plate:"", vehicleType:"", damageType:"", description:"", photo:null });
      setErrors({});
      goHome({ title:"SEGNALAZIONE SALVATA", sub:`La scheda ${id} è stata registrata e condivisa con tutti.` });
    } catch(e) { console.error(e); alert("Errore nel salvataggio. Controlla la connessione."); }
    setBusy(false);
  }

  async function confirmDelete() {
    const rep = modal?.report; if (!rep || busy) return;
    setBusy(true);
    try {
      await deleteReport(rep.id);
      await insertMessage("🤖 Sistema", `🗑 Segnalazione eliminata: ${rep.plate} (${rep.vehicleType})`);
      setReports(prev => prev.filter(r => r.id !== rep.id));
      setModal(null);
      goHome({ title:"SEGNALAZIONE ELIMINATA", sub:`La scheda ${rep.id} è stata rimossa correttamente.` });
    } catch(e) { console.error(e); alert("Errore nell'eliminazione."); }
    setBusy(false);
  }

  async function confirmResolve() {
    const rep = modal?.report; const note = modal?.note || ""; if (!rep || busy) return;
    setBusy(true);
    try {
      const resolvedRep: Report = { ...rep, resolvedAt:new Date().toISOString(), resolveNote:note };
      await deleteReport(rep.id);
      await insertResolved(resolvedRep);
      await insertMessage("🤖 Sistema", `✅ Guasto risolto: ${rep.plate} (${rep.vehicleType}) — ${rep.damageType}${note?" — Note: "+note:""}`);
      sendNotif("✅ Guasto Risolto", `${rep.plate} — ${rep.vehicleType} — ${rep.damageType}`);
      setReports(prev => prev.filter(r => r.id !== rep.id));
      setResolved(prev => [resolvedRep, ...prev]);
      setModal(null);
      goHome({ title:"GUASTO RISOLTO", sub:`La scheda ${rep.id} è stata spostata nello storico risolti.` });
    } catch(e) { console.error(e); alert("Errore. Controlla la connessione."); }
    setBusy(false);
  }

  async function confirmDeleteResolved() {
    const rep = modal?.report; if (!rep || busy) return;
    setBusy(true);
    try {
      await deleteResolved(rep.id);
      setResolved(prev => prev.filter(r => r.id !== rep.id));
      setModal(null);
      goHome({ title:"ELIMINATO DALLO STORICO", sub:`La scheda ${rep.id} è stata rimossa dallo storico.` });
    } catch(e) { console.error(e); alert("Errore nell'eliminazione."); }
    setBusy(false);
  }

  async function confirmDeleteFuoriUso() {
    const fu = modal?.fuoriUso; if (!fu || busy) return;
    setBusy(true);
    try {
      await deleteFuoriUso(fu.id);
      await insertMessage("🤖 Sistema", `✅ Mezzo rientrato: ${fu.plate} (${fu.vehicleType})`);
      setFuoriUso(prev => prev.filter(f => f.id !== fu.id));
      setModal(null);
      goHome({ title:"MEZZO RIENTRATO", sub:`Il mezzo ${fu.plate} è stato rimosso dalla lista fuori uso.` });
    } catch(e) { console.error(e); alert("Errore nell'eliminazione."); }
    setBusy(false);
  }

  async function handleAddFuoriUso() {
    const errs: Record<string,boolean> = {};
    if (!fuForm.plate.trim())  errs.plate = true;
    if (!fuForm.vehicleType)   errs.vehicleType = true;
    if (!fuForm.reason.trim()) errs.reason = true;
    setFuErrors(errs);
    if (Object.keys(errs).length) return;
    if (busy) return;
    setBusy(true);
    try {
      const entry: FuoriUso = { id: genId(), plate: fuForm.plate.trim().toUpperCase(), vehicleType: fuForm.vehicleType, reason: fuForm.reason.trim(), dateIn: new Date().toISOString(), dateExpectedOut: fuForm.dateExpectedOut || undefined, note: fuForm.note.trim() || undefined };
      await insertFuoriUso(entry);
      await insertMessage("🤖 Sistema", `🔧 Mezzo fuori uso: ${entry.plate} (${entry.vehicleType}) — ${entry.reason}`);
      sendNotif("🔧 Mezzo Fuori Uso", `${entry.plate} (${entry.vehicleType}) — ${entry.reason}`);
      setFuoriUso(prev => [entry, ...prev]);
      setFuForm({ plate:"", vehicleType:"", reason:"", dateExpectedOut:"", note:"" });
      setFuErrors({}); setShowFuForm(false);
    } catch(e) { console.error(e); alert("Errore nel salvataggio."); }
    setBusy(false);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setForm(f => ({ ...f, photo:"loading" }));
    const c = await compressImage(file);
    setForm(f => ({ ...f, photo:c }));
  }

  function exportCSV(data: Report[], filename: string) {
    const SEVERITY = (t: string) => CRITICAL.includes(t) ? "CRITICO" : MEDIUM.includes(t) ? "MEDIO" : "LIEVE";
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const isResolved = data.some(r => r.resolvedAt);
    const headers = ["ID","Data Segnalazione","Operatore","Targa","Tipo Mezzo","Tipo Danno","Severità","Descrizione",...(isResolved?["Data Risoluzione","Note Risoluzione"]:[])];
    const rows = data.map(r => [esc(r.id),esc(formatDate(r.date)),esc(r.driver),esc(r.plate),esc(r.vehicleType),esc(r.damageType),esc(SEVERITY(r.damageType)),esc(r.description),...(isResolved?[esc(r.resolvedAt?formatDate(r.resolvedAt):""),esc(r.resolveNote||"")]:[])] );
    const csv = [headers.join(";"),...rows.map(r=>r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  }

  const criticalCount = reports.filter(r => CRITICAL.includes(r.damageType)).length;
  const todayCount    = reports.filter(r => new Date(r.date).toDateString() === new Date().toDateString()).length;
  const searchLower   = search.toLowerCase().trim();
  const fromDate = filterDate.from ? new Date(filterDate.from) : null;
  const toDate   = filterDate.to   ? new Date(filterDate.to + "T23:59:59") : null;
  const filtered = reports
    .filter(r => filterType === "Tutti" || r.vehicleType === filterType)
    .filter(r => !searchLower || [r.plate,r.driver,r.description,r.vehicleType,r.damageType].some(f=>f.toLowerCase().includes(searchLower)))
    .filter(r => !fromDate || new Date(r.date) >= fromDate)
    .filter(r => !toDate   || new Date(r.date) <= toDate)
    .filter(r => !filterCritical || CRITICAL.includes(r.damageType))
    .filter(r => !filterToday || new Date(r.date).toDateString() === new Date().toDateString());
  const hasFilters = filterType !== "Tutti" || filterDate.from || filterDate.to || search;
  const isAdminView   = ["admin","adminDetail","adminLogin"].includes(view) || (view==="resolvedDetail" && isAdmin);
  const btn: React.CSSProperties = { fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, cursor:"pointer" };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", fontFamily:"'Barlow','Barlow Condensed',sans-serif", color:TTEXT }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Barlow+Condensed:wght@500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        :root {
          --bg: ${TBG};
          --card: ${TCARD};
          --border: ${TBORDER};
          --text: ${TTEXT};
          --sub: ${TSUB};
          --input-bg: ${darkMode ? "#060d1a" : "#f8fafc"};
          --header-bg: ${darkMode ? "linear-gradient(135deg,#060d1a,#0a1628)" : "linear-gradient(135deg,#1a3a5c,#1e4976)"};
          --card-hover: ${darkMode ? "#111e33" : "#eef4fb"};
          --text-dim: ${darkMode ? "#7bacd4" : "#4a7a9b"};
          --text-bright: ${darkMode ? "#d0e8ff" : "#0d2137"};
          --modal-overlay: ${darkMode ? "#000000dd" : "#00000077"};
          --fuori-uso-bg: ${darkMode ? "#120e00" : "#fffbeb"};
          --fuori-uso-text: ${darkMode ? "#eab308" : "#92400e"};
        }
        *{box-sizing:border-box;margin:0;padding:0}
        input,textarea,select{font-family:inherit;background:var(--input-bg)!important;color:var(--text)!important;border-color:var(--border)!important}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
        .card:hover{background:var(--card-hover)!important;transform:translateY(-1px)}
        .card{transition:all .15s;cursor:pointer;background:var(--card)!important;border-color:var(--border)!important;color:var(--text)!important}
        input:focus,textarea:focus,select:focus{outline:none;border-color:${BLUE_LT}!important;box-shadow:0 0 0 2px ${BLUE_LT}22!important}
        .back-btn:hover{color:${ORANGE}!important}
        .upload-btn:hover{border-color:${ORANGE}!important;color:${ORANGE}!important}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .anim{animation:fadeIn .22s ease both}
        @keyframes wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .wave{animation:wave 3s ease-in-out infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite;display:inline-block}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
        button{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        input,select,textarea{font-size:16px!important}
        @media(max-width:600px){
          .meteo-row{flex-wrap:wrap;gap:6px!important;padding:8px 12px!important}
          .meteo-sep{display:none!important}
          .meteo-forecast{padding:6px 12px!important;gap:10px!important;overflow-x:auto}
          .header-title{font-size:13px!important;letter-spacing:1px!important}
          .header-sub{display:none!important}
          .header-text{display:none!important}
          .header-logo{width:34px!important;height:34px!important;font-size:16px!important}
          .hide-mobile{display:none!important}
          .stat-card{padding:10px 8px!important}
          .stat-val{font-size:22px!important}
          .main-pad{padding:14px 10px!important}
        }
        @media(max-width:380px){
          .header-logo{display:none!important}
        }
      `}</style>

      {showNameModal && <NameModal onConfirm={handleSetName} />}
      {showChat && <ChatPanel onClose={()=>{ playClick("soft"); setShowChat(false); setUnreadChat(0); }} userName={userName} />}
      {showFeedback && <FeedbackPanel onClose={()=>setShowFeedback(false)} userName={userName} />}

      {/* MODALS */}
      <Modal show={modal?.type==="deleteFuoriUso"} onClose={()=>setModal(null)} borderColor={GREEN} icon="✅" title="MEZZO RIENTRATO" titleColor={GREEN}>
        <div style={{ fontSize:13, color:"var(--text-dim)", textAlign:"center", marginBottom:4 }}>Confermi il rientro del mezzo</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:18, color:"var(--fuori-uso-text)", textAlign:"center", letterSpacing:2, marginBottom:2 }}>{modal?.fuoriUso?.plate}</div>
        <div style={{ fontSize:13, color:"var(--sub)", textAlign:"center", marginBottom:22 }}>{modal?.fuoriUso?.vehicleType}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>{ playClick("soft"); setModal(null); }} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, fontSize:14 }}>Annulla</button>
          <button onClick={()=>{ playClick("success"); confirmDeleteFuoriUso(); }} disabled={busy} style={{ ...btn, flex:2, padding:"11px", borderRadius:8, background:busy?"#555":GREEN, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"✓ Conferma Rientro"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="delete"} onClose={()=>setModal(null)} borderColor={RED} icon="🗑" title="ELIMINA SEGNALAZIONE" titleColor={RED}>
        <div style={{ fontSize:13, color:"var(--text-dim)", textAlign:"center", marginBottom:4 }}>Stai per eliminare la segnalazione</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:ORANGE, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"var(--sub)", textAlign:"center", marginBottom:22 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmDelete} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:busy?"#555":RED, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"Elimina"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="deleteResolved"} onClose={()=>setModal(null)} borderColor={RED} icon="🗑" title="ELIMINA DALLO STORICO" titleColor={RED}>
        <div style={{ fontSize:13, color:"var(--text-dim)", textAlign:"center", marginBottom:4 }}>Stai per eliminare definitivamente</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:GREEN, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"var(--sub)", textAlign:"center", marginBottom:22 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmDeleteResolved} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:busy?"#555":RED, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"Elimina"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="resolve"} onClose={()=>setModal(null)} borderColor={GREEN} icon="✅" title="SEGNA COME RISOLTO" titleColor={GREEN}>
        <div style={{ fontSize:13, color:"var(--text-dim)", textAlign:"center", marginBottom:4 }}>Segnalazione</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:ORANGE, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"var(--sub)", textAlign:"center", marginBottom:18 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <Label text="Note di risoluzione (opzionale)" />
        <textarea value={modal?.note||""} onChange={e=>setModal(m=>m?({...m,note:e.target.value}):m)}
          placeholder="Es. Riparato in officina…" rows={3}
          style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid var(--border)`, borderRadius:8, padding:"11px 13px", fontSize:13, lineHeight:1.6, resize:"none", marginBottom:18 }}/>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmResolve} disabled={busy} style={{ ...btn, flex:2, padding:"11px", borderRadius:8, background:busy?"#555":GREEN, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"✓ Conferma Risolto"}</button>
        </div>
      </Modal>

      {/* HEADER */}
      <header style={{ background:darkMode?"linear-gradient(135deg,#060d1a,#0a1628)":"linear-gradient(135deg,#1a3a5c,#1e4976)", borderBottom:`3px solid ${ORANGE}`, padding:"0 12px", height:68, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 24px #00000088", gap:8 }}>
        <div className="header-left" style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flexShrink:1 }}>
          {view !== "dashboard" && (
            <button className="back-btn" onClick={()=>{ playClick("soft"); goHome(null); }} style={{ background:"none", border:"none", color:"var(--sub)", fontSize:24, cursor:"pointer", lineHeight:1, transition:"color .15s", padding:"4px 8px", flexShrink:0 }}>←</button>
          )}
          <div className="header-logo" style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg,${BLUE},${BLUE_LT})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
            <img src={LOGO_BASE64} style={{width:"100%",height:"100%",objectFit:"contain"}} alt="Logo"/>
          </div>
          <div className="header-text" style={{ minWidth:0, overflow:"hidden" }}>
            <div className="header-title" style={{ fontSize:16, fontWeight:900, letterSpacing:2, fontFamily:"Barlow Condensed, sans-serif", color:isAdminView?"#fbbf24":"#e8f4ff", lineHeight:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {isAdminView ? "🔐 ADMIN" : "SEGNALAZIONE"}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div className="header-sub" style={{ fontSize:9, color:ORANGE, letterSpacing:2.5, fontWeight:700, marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>COMPAGNIA PORTUALI{userName?" • "+userName:""}</div>
              <span style={{ fontSize:8, fontWeight:800, color:"#1e3a5f", background:"var(--input-bg)", border:`1px solid #162035`, borderRadius:4, padding:"1px 5px", letterSpacing:1, flexShrink:0 }}>{APP_VERSION}</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:5, alignItems:"center", flexShrink:0 }}>
          {/* Chat button - rimane in header perché ha badge notifiche */}
          <button onClick={()=>{ playClick("soft"); setShowChat(true); setUnreadChat(0); }}
            style={{ position:"relative", background:"transparent", color:BLUE_LT, border:`1px solid var(--border)`, borderRadius:7, padding:"7px 9px", cursor:"pointer", fontSize:15 }}>
            💬
            {unreadChat > 0 && (
              <span style={{ position:"absolute", top:-6, right:-6, background:RED, color:"#fff", borderRadius:"50%", width:18, height:18, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, animation:"pulse 1s ease-in-out infinite" }}>{unreadChat}</span>
            )}
          </button>
          {/* HAMBURGER MENU */}
          <div style={{ position:"relative" }}>
            <button onClick={()=>setShowMenu(m=>!m)}
              style={{ background:"transparent", border:`1px solid var(--border)`, borderRadius:7, padding:"7px 10px", cursor:"pointer", display:"flex", flexDirection:"column", gap:4, alignItems:"center", justifyContent:"center" }}>
              <span style={{ display:"block", width:16, height:2, background:"var(--text)", borderRadius:2 }}/>
              <span style={{ display:"block", width:16, height:2, background:"var(--text)", borderRadius:2 }}/>
              <span style={{ display:"block", width:16, height:2, background:"var(--text)", borderRadius:2 }}/>
            </button>
            {showMenu && (
              <>
                {/* overlay per chiudere cliccando fuori */}
                <div onClick={()=>setShowMenu(false)} style={{ position:"fixed", inset:0, zIndex:199 }}/>
                <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, zIndex:200, background:"var(--card)", border:`1px solid var(--border)`, borderRadius:12, boxShadow:"0 8px 32px #00000044", minWidth:200, overflow:"hidden" }}>
                  {/* Tema */}
                  <button onClick={()=>{ toggleTheme(); setShowMenu(false); }}
                    style={{ ...btn, width:"100%", display:"flex", alignItems:"center", gap:12, padding:"13px 16px", background:"transparent", border:"none", borderBottom:`1px solid var(--border)`, color:"var(--text)", fontSize:13, textAlign:"left" as const, cursor:"pointer" }}>
                    <span style={{ fontSize:18 }}>{darkMode ? "☀️" : "🌙"}</span>
                    <div>
                      <div style={{ fontWeight:700, letterSpacing:0.5 }}>{darkMode ? "Tema Chiaro" : "Tema Scuro"}</div>
                      <div style={{ fontSize:10, color:"var(--sub)" }}>Ora: {darkMode ? "🌙 Scuro" : "☀️ Chiaro"}</div>
                    </div>
                  </button>
                  {/* Feedback */}
                  <button onClick={()=>{ playClick("soft"); setShowFeedback(true); setShowMenu(false); }}
                    style={{ ...btn, width:"100%", display:"flex", alignItems:"center", gap:12, padding:"13px 16px", background:"transparent", border:"none", borderBottom:`1px solid var(--border)`, color:"var(--text)", fontSize:13, textAlign:"left" as const, cursor:"pointer" }}>
                    <span style={{ fontSize:18 }}>💡</span>
                    <div>
                      <div style={{ fontWeight:700, letterSpacing:0.5 }}>Invia Feedback</div>
                      <div style={{ fontSize:10, color:"var(--sub)" }}>Suggerimenti e segnalazioni</div>
                    </div>
                  </button>
                  {/* Aggiorna */}
                  {view === "dashboard" && (
                    <button onClick={()=>{ playClick("soft"); loadData(); setShowMenu(false); }}
                      style={{ ...btn, width:"100%", display:"flex", alignItems:"center", gap:12, padding:"13px 16px", background:"transparent", border:"none", borderBottom:`1px solid var(--border)`, color:"var(--text)", fontSize:13, textAlign:"left" as const, cursor:"pointer" }}>
                      <span style={{ fontSize:18 }}>🔄</span>
                      <div>
                        <div style={{ fontWeight:700, letterSpacing:0.5 }}>Aggiorna Dati</div>
                        <div style={{ fontSize:10, color:"var(--sub)" }}>Ricarica dal database</div>
                      </div>
                    </button>
                  )}
                  {/* Versione */}
                  <div style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:18 }}>ℹ️</span>
                    <div>
                      <div style={{ fontSize:11, color:"var(--sub)", letterSpacing:0.5 }}>Versione app</div>
                      <div style={{ fontSize:12, fontWeight:800, color:ORANGE, letterSpacing:1 }}>{APP_VERSION}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          {view === "dashboard" && <>
            <button onClick={()=>{ playClick("soft"); setView("adminLogin"); }} style={{ ...btn, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, borderRadius:7, padding:"7px 9px", fontSize:14 }} title="Admin">🔐</button>
            <button onClick={()=>{ playClick("soft"); setView("new"); }} style={{ ...btn, background:ORANGE, color:"#fff", border:"none", borderRadius:7, padding:"8px 12px", fontSize:12, letterSpacing:1, boxShadow:`0 4px 14px ${ORANGE}44`, whiteSpace:"nowrap" }}>+ Nuova Segnalazione</button>
          </>}
          {view === "admin" && (
            <button onClick={()=>{ playClick("soft"); goHome(null); }} style={{ ...btn, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, borderRadius:7, padding:"7px 11px", fontSize:11 }}>Esci</button>
          )}
        </div>
      </header>

      {/* STRIPE */}
      {(view==="dashboard"||view==="admin") && (
        <div style={{ background:`linear-gradient(90deg,${BLUE}22,transparent 60%)`, borderBottom:`1px solid var(--border)`, padding:"7px 20px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:GREEN, boxShadow:`0 0 8px ${GREEN}` }} />
          <span style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700 }}>
            {view==="admin" ? "🔐 MODALITÀ AMMINISTRATORE" : "🌐 DATABASE CONDIVISO — AGGIORNAMENTO AUTOMATICO"}
          </span>
          {!notifEnabled && view==="dashboard" && (
            <button onClick={()=>requestNotifPermission().then(ok=>setNotifEnabled(ok))}
              style={{ marginLeft:"auto", fontSize:10, color:ORANGE, background:"transparent", border:`1px solid ${ORANGE}44`, borderRadius:4, padding:"3px 8px", cursor:"pointer", fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, letterSpacing:1 }}>
              🔔 Attiva notifiche
            </button>
          )}
        </div>
      )}

      {/* BARRA METEO FISSA */}
      {weather && (() => {
        const wa = windAlert(weather.windSpeed);
        const uv = uviLabel(weather.uvi);
        return (
          <div style={{ background: weather.windSpeed>=40 ? wa.color+"18" : "#0a1628", borderBottom:`1px solid ${weather.windSpeed>=40 ? wa.color+"55" : BORDER}` }}>
            {/* Riga principale */}
            <div className="meteo-row" style={{ padding:"8px 20px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" style={{ width:32, height:32, flexShrink:0 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:18, color:"#e8f4ff" }}>{weather.temp}°C</span>
                <span style={{ fontSize:11, color:"var(--sub)", textTransform:"capitalize" }}>{weather.description}</span>
              </div>
              <div className="meteo-sep" style={{ width:1, height:20, background:"var(--border)", flexShrink:0 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                <span style={{ fontSize:11, color:"var(--sub)" }}>💨</span>
                <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:15, color:wa.color }}>{weather.windSpeed} km/h</span>
                <span style={{ fontSize:10, color:"var(--sub)" }}>{windDir(weather.windDeg)}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:3, background:wa.color+"22", color:wa.color, border:`1px solid ${wa.color}44` }}>{wa.label}</span>
              </div>
              <div className="meteo-sep" style={{ width:1, height:20, background:"var(--border)", flexShrink:0 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                <span style={{ fontSize:11, color:"var(--sub)" }}>☀️</span>
                <span style={{ fontSize:11, color:uv.color, fontWeight:700 }}>UV {weather.uvi}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:3, background:uv.color+"22", color:uv.color, border:`1px solid ${uv.color}44` }}>{uv.label}</span>
              </div>
              <div className="meteo-sep" style={{ width:1, height:20, background:"var(--border)", flexShrink:0 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                <span style={{ fontSize:11, color:"var(--sub)" }}>🌧️</span>
                <span style={{ fontSize:11, color: weather.rainProb>=70?"#60a5fa":weather.rainProb>=40?"#93c5fd":"#3b6fa0", fontWeight:700 }}>{weather.rainProb}%</span>
                <span style={{ fontSize:10, color:"var(--sub)" }}>pioggia</span>
              </div>
              {weather.windSpeed>=40 && (
                <>
                  <div className="meteo-sep" style={{ width:1, height:20, background:"var(--border)", flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:wa.color, fontWeight:700 }}>⚠ Verificare condizioni sollevamento</span>
                </>
              )}
              <div style={{ marginLeft:"auto", fontSize:10, color:"#1e3a5f" }}>📍 Piombino</div>
            </div>
            {/* Previsione prossime 3 ore */}
            {weather.forecast.length > 0 && (
              <div className="meteo-forecast" style={{ borderTop:`1px solid ${BORDER}`, padding:"6px 20px", display:"flex", gap:16, alignItems:"center", overflowX:"auto" }}>
                <span style={{ fontSize:9, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, flexShrink:0 }}>PROSSIME ORE</span>
                {weather.forecast.map((f,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:10, color:"var(--sub)" }}>{f.time}</span>
                    <img src={`https://openweathermap.org/img/wn/${f.icon}.png`} alt="" style={{ width:22, height:22 }}/>
                    <span style={{ fontSize:12, fontWeight:700, color:"#e8f4ff", fontFamily:"Barlow Condensed, sans-serif" }}>{f.temp}°</span>
                    {f.rain > 0 && <span style={{ fontSize:10, color:"#60a5fa" }}>💧{f.rain}%</span>}
                    {i < weather.forecast.length-1 && <div style={{ width:1, height:14, background:"var(--border)", marginLeft:4 }}/>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <main className="main-pad" style={{ maxWidth:740, margin:"0 auto", padding:"20px 14px" }}>

        {/* ════════ DASHBOARD ════════ */}
        {view === "dashboard" && (
          <div className="anim">
            <SuccessBanner toast={toast} onClose={()=>setToast(null)} />
            {loadErr && (
              <div style={{ marginBottom:20, padding:"12px 16px", background:"#1a0808", border:`1px solid ${RED}44`, borderLeft:`4px solid ${RED}`, borderRadius:10, fontSize:13, color:"#f87171", display:"flex", alignItems:"center", gap:12 }}>
                ⚠️ Errore di connessione al database.
                <button onClick={loadData} style={{ ...btn, background:RED, color:"#fff", border:"none", borderRadius:6, padding:"4px 10px", fontSize:12 }}>Riprova</button>
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
              {[
                { label:"Attivi",   value:reports.length,   color:BLUE_LT,                    icon:"📋", tab:"active",   critical:false, today:false },
                { label:"Critici",  value:criticalCount,    color:RED,                         icon:"🚨", tab:"active",   critical:true,  today:false },
                { label:"Fuori Uso",value:fuoriUso.length,  color:"var(--fuori-uso-text)",     icon:"🔧", tab:"fuoriuso", critical:false, today:false },
                { label:"Oggi",     value:todayCount,       color:ORANGE,                      icon:"📅", tab:"active",   critical:false, today:true  },
              ].map(s=>{
                const isActive = dashTab===s.tab && (s.critical===filterCritical) && (s.today===filterToday);
                return (
                  <div key={s.label} onClick={()=>{ setDashTab(s.tab); setFilterCritical(s.critical); setFilterToday(s.today); }}
                    style={{ flex:1, minWidth:70, background: isActive ? s.color+"22" : "var(--card)",
                      border:`1px solid ${isActive ? s.color : s.color+"33"}`,
                      borderTop:`3px solid ${s.color}`, borderRadius:10, padding:"13px 11px",
                      cursor:"pointer", transition:"all .15s", transform: isActive ? "translateY(-2px)" : "none",
                      boxShadow: isActive ? `0 4px 16px ${s.color}33` : "none" }}>
                    <div style={{ fontSize:9, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{s.icon} {s.label.toUpperCase()}</div>
                    <div style={{ fontSize:28, fontWeight:900, color:s.color, fontFamily:"Barlow Condensed, sans-serif", lineHeight:1 }}>{booting ? "…" : s.value}</div>
                    {isActive && <div style={{ fontSize:8, color:s.color, marginTop:4, letterSpacing:1, fontWeight:700 }}>▼ SELEZIONATO</div>}
                  </div>
                );
              })}
            </div>

            {/* TAB FUORI USO */}
            {dashTab==="fuoriuso" && (
              fuoriUso.length===0 ? (
                <div style={{ textAlign:"center", padding:"50px 20px" }}>
                  <div style={{ fontSize:46, marginBottom:12 }}>🔧</div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#4a3a00", fontFamily:"Barlow Condensed, sans-serif", letterSpacing:2 }}>NESSUN MEZZO FUORI USO</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {fuoriUso.map((f,i)=>(
                    <div key={f.id} style={{ background:"var(--fuori-uso-bg)", border:"1px solid var(--fuori-uso-text)33", borderLeft:"3px solid var(--fuori-uso-text)", borderRadius:10, padding:"14px 16px", animationDelay:i*.03+"s" }} className="anim">
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:"var(--fuori-uso-text)", letterSpacing:2 }}>{f.plate}</span>
                        <span style={{ fontSize:10, fontWeight:800, padding:"2px 9px", borderRadius:3, background:"var(--fuori-uso-bg)", color:"var(--fuori-uso-text)", border:"1px solid var(--fuori-uso-text)44" }}>FUORI USO</span>
                        <span style={{ fontSize:11, color:"#6a5a00", marginLeft:"auto" }}>🔧 {f.vehicleType}</span>
                      </div>
                      <div style={{ fontSize:13, color:"#a08000", marginBottom:4 }}>⚠ {f.reason}</div>
                      <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                        <div style={{ fontSize:11, color:"#4a3a00" }}>📅 In officina dal {formatDate(f.dateIn)}</div>
                        {f.dateExpectedOut && <div style={{ fontSize:11, color:"#6a5a00" }}>🔜 Rientro previsto: {f.dateExpectedOut}</div>}
                      </div>
                      {f.note && <div style={{ fontSize:12, color:"#5a4a00", marginTop:6, fontStyle:"italic" }}>📝 {f.note}</div>}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* TAB STORICO RISOLTI */}
            {dashTab==="resolved" && (
              resolved.length===0 ? (
                <div style={{ textAlign:"center", padding:"50px 20px" }}>
                  <div style={{ fontSize:46, marginBottom:12 }}>📂</div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#1e4a2a", fontFamily:"Barlow Condensed, sans-serif", letterSpacing:2 }}>NESSUN GUASTO RISOLTO</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {resolved.map((r,i)=>(
                    <div key={r.id} className="card" onClick={()=>{ setSelected(r); setView("resolvedDetail"); }}
                      style={{ background:"#071a0f", border:`1px solid ${GREEN}22`, borderLeft:`3px solid ${GREEN}44`, borderRadius:10, padding:"13px 15px", display:"flex", gap:13, alignItems:"flex-start", animationDelay:i*.03+"s" }}>
                      <div style={{ width:52, height:52, borderRadius:8, flexShrink:0, overflow:"hidden", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${GREEN}33` }}>
                        {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:"grayscale(20%)" }}/> : <span style={{ fontSize:22 }}>✅</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                          <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:17, color:GREEN, letterSpacing:1.5 }}>{r.plate}</span>
                          <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:3, background:GREEN+"22", color:GREEN, border:`1px solid ${GREEN}44` }}>RISOLTO</span>
                        </div>
                        <div style={{ fontSize:12, color:"#4a7a5a", fontWeight:600, marginBottom:2 }}>{r.vehicleType} — {r.damageType}</div>
                        <div style={{ fontSize:11, color:"#1e4a2a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.description}</div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:10, color:"#1e4a2a" }}>✅ {r.resolvedAt ? formatDate(r.resolvedAt) : ""}</div>
                        <div style={{ fontSize:11, color:"#2a5a3a", marginTop:3, fontWeight:600 }}>👤 {r.driver}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* TAB GUASTI ATTIVI */}
            {dashTab==="active" && <>
              {reports.length > 0 && (
                <div style={{ position:"relative", marginBottom:12 }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none", opacity:0.4 }}>🔍</span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca per targa, operatore, tipo danno…"
                    style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${search?BLUE_LT:BORDER}`, borderRadius:9, padding:"10px 36px 10px 40px", fontSize:13, fontFamily:"inherit" }}/>
                  {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--sub)", cursor:"pointer", fontSize:15 }}>✕</button>}
                </div>
              )}
              {reports.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                  {/* Filtro per mezzo */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {["Tutti",...VEHICLE_TYPES].filter(t=>t==="Tutti"||reports.some(r=>r.vehicleType===t)).map(t=>(
                      <button key={t} onClick={()=>setFilterType(t)} style={{ ...btn, padding:"5px 12px", borderRadius:5, fontSize:11, letterSpacing:0.5, whiteSpace:"nowrap", minWidth:"fit-content", background:filterType===t?BLUE:"transparent", color:filterType===t?"#fff":"var(--sub)", border:`1px solid ${filterType===t?BLUE:"var(--border)"}` }}>{t}</button>
                    ))}
                  </div>
                  {/* Filtro per data */}
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, flexShrink:0 }}>📅 DAL</span>
                    <input type="date" value={filterDate.from} onChange={e=>setFilterDate(f=>({...f,from:e.target.value}))}
                      style={{ background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${filterDate.from?BLUE_LT:BORDER}`, borderRadius:7, padding:"6px 10px", fontSize:12, fontFamily:"inherit" }}/>
                    <span style={{ fontSize:10, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, flexShrink:0 }}>AL</span>
                    <input type="date" value={filterDate.to} onChange={e=>setFilterDate(f=>({...f,to:e.target.value}))}
                      style={{ background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${filterDate.to?BLUE_LT:BORDER}`, borderRadius:7, padding:"6px 10px", fontSize:12, fontFamily:"inherit" }}/>
                    {hasFilters && (
                      <button onClick={()=>{ setFilterType("Tutti"); setFilterDate({from:"",to:""}); setSearch(""); setFilterCritical(false); setFilterToday(false); }}
                        style={{ ...btn, background:RED+"22", border:`1px solid ${RED}44`, color:RED, borderRadius:6, padding:"5px 10px", fontSize:10, letterSpacing:1 }}>✕ RESET</button>
                    )}
                  </div>
                </div>
              )}
              {booting ? (
                <div style={{ textAlign:"center", padding:60, color:"var(--sub)" }}>
                  <div className="spin" style={{ fontSize:32, marginBottom:12 }}>⚓</div>
                  <div style={{ fontSize:13 }}>Connessione al database…</div>
                </div>
              ) : reports.length===0 ? (
                <div style={{ textAlign:"center", padding:"50px 20px" }}>
                  <div style={{ fontSize:56, marginBottom:14 }}>⚓</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#1e4976", marginBottom:8, fontFamily:"Barlow Condensed, sans-serif", letterSpacing:2 }}>NESSUNA SEGNALAZIONE ATTIVA</div>
                  <div style={{ fontSize:13, color:"#1e3a5f", marginBottom:24 }}>Registra il primo danno premendo "+ Nuova".</div>
                  <button onClick={()=>setView("new")} style={{ ...btn, background:ORANGE, color:"#fff", border:"none", borderRadius:7, padding:"11px 26px", fontSize:14, letterSpacing:1.5 }}>+ Nuova Segnalazione</button>
                </div>
              ) : filtered.length===0 ? (
                <div style={{ textAlign:"center", padding:40, color:"#1e3a5f" }}>Nessuna segnalazione trovata.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {filtered.map((r,i)=>(
                    <div key={r.id} className="card" onClick={()=>{ setSelected(r); setView("detail"); }}
                      style={{ background:"var(--card)", border:`1px solid var(--border)`, borderRadius:10, padding:"13px 14px", display:"flex", gap:12, alignItems:"flex-start", animationDelay:i*.03+"s" }}>
                      <div style={{ width:52, height:52, borderRadius:8, flexShrink:0, overflow:"hidden", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid var(--border)` }}>
                        {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:22 }}>🚢</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                          <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:18, color:ORANGE, letterSpacing:1.5 }}>{r.plate}</span>
                          <SeverityBadge type={r.damageType}/>
                        </div>
                        <div style={{ fontSize:12, color:"var(--text-dim)", fontWeight:600, marginBottom:2 }}>{r.vehicleType} — {r.damageType}</div>
                        <div style={{ fontSize:11, color:"#2a4a6e", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.description}</div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:10, color:"#1e3a5f" }}>{formatDate(r.date)}</div>
                        <div style={{ fontSize:11, color:"var(--sub)", marginTop:3, fontWeight:600 }}>👤 {r.driver}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>}
          </div>
        )}

        {/* NUOVO FORM */}
        {view === "new" && (
          <div className="anim">
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, color:ORANGE, letterSpacing:3, fontWeight:700, marginBottom:5 }}>⚓ COMPAGNIA PORTUALI</div>
              <h2 style={{ fontFamily:"Barlow Condensed, sans-serif", fontSize:28, fontWeight:900, letterSpacing:2, color:"var(--text-bright)" }}>NUOVA SEGNALAZIONE</h2>
              <p style={{ color:"#2a4a6e", fontSize:13, marginTop:4 }}>Compila tutti i campi obbligatori *</p>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:180 }}>
                  <Label text="Nome Conducente / Operatore *"/>
                  <FieldInput placeholder="Es. Mario Rossi" value={form.driver} onChange={v=>setForm(f=>({...f,driver:v}))} error={errors.driver}/>
                  {errors.driver && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
                </div>
                <div style={{ flex:1, minWidth:140 }}>
                  <Label text="Targa / ID Mezzo *"/>
                  <FieldInput placeholder="Es. PRT-0042" value={form.plate} onChange={v=>setForm(f=>({...f,plate:v}))} error={errors.plate}
                    style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:17, letterSpacing:3, textTransform:"uppercase", color:ORANGE }}/>
                  {errors.plate && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
                </div>
              </div>
              <div>
                <Label text="Tipo di Mezzo *"/>
                <select value={form.vehicleType} onChange={e=>setForm(f=>({...f,vehicleType:e.target.value}))}
                  style={{ width:"100%", background:"var(--input-bg)", color:form.vehicleType?"#cce0f5":"#2a4a6e", border:`1px solid ${errors.vehicleType?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14 }}>
                  <option value="">— Seleziona tipo di mezzo —</option>
                  {VEHICLE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {errors.vehicleType && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
              </div>
              <div>
                <Label text="Tipo di Danno *"/>
                <select value={form.damageType} onChange={e=>setForm(f=>({...f,damageType:e.target.value}))}
                  style={{ width:"100%", background:"var(--input-bg)", color:form.damageType?"#cce0f5":"#2a4a6e", border:`1px solid ${errors.damageType?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14 }}>
                  <option value="">— Seleziona tipo di danno —</option>
                  {DAMAGE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {errors.damageType && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
              </div>
              <div>
                <Label text="Descrizione del Danno *"/>
                <textarea placeholder="Descrivi dove si trova il danno, come si è verificato e la sua entità…"
                  value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={4}
                  style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${errors.description?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, lineHeight:1.6, resize:"vertical" }}/>
                {errors.description && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
              </div>
              <div>
                <Label text="Foto del Danno"/>
                <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handlePhoto} style={{ display:"none" }}/>
                {form.photo && form.photo !== "loading" ? (
                  <div style={{ position:"relative" }}>
                    <img src={form.photo} alt="" style={{ width:"100%", maxHeight:220, objectFit:"cover", borderRadius:10, border:`1px solid ${ORANGE}44`, display:"block" }}/>
                    <button onClick={()=>setForm(f=>({...f,photo:null}))} style={{ position:"absolute", top:10, right:10, background:"#000c", color:"#fff", border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>
                  </div>
                ) : (
                  <button className="upload-btn" onClick={()=>fileRef.current?.click()}
                    style={{ width:"100%", padding:"26px 20px", background:"var(--input-bg)", border:`2px dashed ${BORDER}`, borderRadius:10, color:"#2a4a6e", cursor:"pointer", fontSize:14, transition:"all .15s" }}>
                    {form.photo==="loading" ? "⏳  Compressione…" : "📷  Scatta foto o carica immagine"}
                  </button>
                )}
              </div>
              <div style={{ display:"flex", gap:12, paddingTop:4 }}>
                <button onClick={()=>{ playClick("soft"); goHome(null); }} style={{ ...btn, flex:1, padding:"12px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`2px solid ${BORDER}`, fontSize:14, letterSpacing:1.5, textTransform:"uppercase" }}>Annulla</button>
                <button onClick={()=>{ playClick("success"); handleSave(); }} disabled={busy}
                  style={{ ...btn, flex:2, padding:"12px", borderRadius:8, background:busy?"#555":ORANGE, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14, letterSpacing:1.5, textTransform:"uppercase", transition:"background .15s" }}>
                  {busy ? "Salvataggio…" : "✓ Salva Segnalazione"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DETTAGLIO UTENTE */}
        {view === "detail" && selected && (
          <div className="anim">
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10, color:"#2a4a6e", letterSpacing:2.5, fontWeight:700, marginBottom:4 }}>SCHEDA SEGNALAZIONE</div>
              <div style={{ fontSize:15, color:ORANGE, fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, letterSpacing:2 }}>{selected.id}</div>
            </div>
            {selected.photo && <div style={{ marginBottom:18, borderRadius:12, overflow:"hidden", border:`1px solid var(--border)` }}><img src={selected.photo} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", display:"block" }}/></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <InfoCard icon="🚢" label="Targa / ID" value={selected.plate} accent/>
              <InfoCard icon="🏗" label="Tipo Mezzo" value={selected.vehicleType||"—"}/>
              <InfoCard icon="👤" label="Operatore" value={selected.driver}/>
              <InfoCard icon="🔧" label="Tipo Danno" value={selected.damageType} extra={<SeverityBadge type={selected.damageType}/>}/>
              <InfoCard icon="📅" label="Data / Ora" value={formatDate(selected.date)} small/>
            </div>
            <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderLeft:`4px solid ${BLUE_LT}`, marginBottom:12 }}>
              <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE</div>
              <p style={{ fontSize:14, color:"var(--text-dim)", lineHeight:1.8 }}>{selected.description}</p>
            </div>
            <button onClick={()=>setModal({ type:"delete", report:selected })}
              style={{ ...btn, width:"100%", padding:"11px", borderRadius:8, background:"transparent", color:RED, border:`1px solid ${RED}44`, fontSize:12, letterSpacing:1.5, textTransform:"uppercase" }}>
              🗑 Elimina segnalazione (pubblicata per errore)
            </button>
          </div>
        )}

        {/* ADMIN LOGIN */}
        {view === "adminLogin" && (
          <div className="anim" style={{ maxWidth:380, margin:"50px auto 0" }}>
            <div style={{ background:"var(--card)", border:`1px solid var(--border)`, borderTop:`3px solid ${ORANGE}`, borderRadius:14, padding:"28px 24px" }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🔐</div>
                <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:22, letterSpacing:2, color:"var(--text-bright)" }}>AREA AMMINISTRATORE</div>
                <div style={{ fontSize:12, color:"var(--sub)", marginTop:3 }}>COMPAGNIA PORTUALI</div>
              </div>
              <Label text="Password Admin"/>
              <input type="password" value={pwd} onChange={e=>{ setPwd(e.target.value); setPwdErr(false); }}
                onKeyDown={e=>{ if(e.key==="Enter"){ if(pwd===ADMIN_PASSWORD){setPwd("");setIsAdmin(true);setView("admin");}else{setPwdErr(true);setPwd("");} } }}
                placeholder="Inserisci la password…"
                style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${pwdErr?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", marginBottom:6 }}/>
              {pwdErr && <div style={{ fontSize:11, color:RED, marginBottom:10 }}>⚠ Password errata</div>}
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                <button onClick={()=>{ setPwd(""); setPwdErr(false); goHome(null); }} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"var(--sub)", border:`1px solid var(--border)`, fontSize:14 }}>Indietro</button>
                <button onClick={()=>{ if(pwd===ADMIN_PASSWORD){setPwd("");setPwdErr(false);setIsAdmin(true);setView("admin");}else{setPwdErr(true);setPwd("");} }}
                  style={{ ...btn, flex:2, padding:"11px", borderRadius:8, background:ORANGE, color:"#fff", border:"none", fontSize:14 }}>Accedi</button>
              </div>
            </div>
          </div>
        )}

        {/* ADMIN PANEL */}
        {view === "admin" && isAdmin && (
          <div className="anim">
            <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
              {[{label:"Attivi",value:reports.length,color:BLUE_LT,icon:"📋"},{label:"Critici",value:criticalCount,color:RED,icon:"🚨"},{label:"Fuori Uso",value:fuoriUso.length,color:"var(--fuori-uso-text)",icon:"🔧"},{label:"Oggi",value:todayCount,color:ORANGE,icon:"📅"}].map(s=>(
                <div key={s.label} style={{ flex:1, minWidth:70, background:"var(--card)", border:`1px solid ${s.color}33`, borderTop:`3px solid ${s.color}`, borderRadius:10, padding:"13px 11px" }}>
                  <div style={{ fontSize:9, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{s.icon} {s.label.toUpperCase()}</div>
                  <div style={{ fontSize:28, fontWeight:900, color:s.color, fontFamily:"Barlow Condensed, sans-serif", lineHeight:1 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", marginBottom:16, border:`1px solid var(--border)`, borderRadius:10, overflow:"hidden" }}>
              {[{key:"active",label:"⚠ ATTIVI",color:ORANGE,count:reports.length},{key:"fuoriuso",label:"🔧 FUORI USO",color:"var(--fuori-uso-text)",count:fuoriUso.length},{key:"resolved",label:"✅ RISOLTI",color:GREEN,count:resolved.length},{key:"stats",label:"📊 STATS",color:"#a855f7",count:0},{key:"feedback",label:"💡 FEEDBACK",color:BLUE_LT,count:0}].map(t=>(
                <button key={t.key} onClick={()=>setAdminTab(t.key)}
                  style={{ ...btn, flex:1, padding:"11px 4px", border:"none", fontSize:10, letterSpacing:0.8, transition:"all .15s",
                    background:adminTab===t.key?t.color+"22":"transparent", color:adminTab===t.key?t.color:"#2a4a6e",
                    borderBottom:adminTab===t.key?`2px solid ${t.color}`:"2px solid transparent" }}>
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
            {/* RESET DATABASE BUTTON */}
            <div style={{ marginBottom:16 }}>
              <button onClick={()=>{ setShowReset(true); setResetPwd(""); setResetPwdErr(false); }}
                style={{ ...btn, width:"100%", background:RED+"11", border:`1px solid ${RED}44`, color:RED, borderRadius:8, padding:"10px", fontSize:12, letterSpacing:1.5, fontFamily:"Barlow Condensed, sans-serif", fontWeight:800 }}>
                🗑 RESET COMPLETO DATABASE
              </button>
            </div>

            {adminTab==="active" && (reports.length===0 ? (
              <div style={{ textAlign:"center", padding:50, color:"#1e3a5f" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
                <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:15 }}>Nessun guasto attivo!</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
                  <button onClick={()=>exportCSV(reports,`guasti_attivi_${new Date().toISOString().slice(0,10)}.csv`)}
                    style={{ ...btn, background:BLUE+"22", border:`1px solid ${BLUE}55`, color:BLUE_LT, borderRadius:7, padding:"6px 12px", fontSize:11, letterSpacing:1 }}>
                    ⬇ Esporta CSV ({reports.length})
                  </button>
                </div>
                {reports.map(r=>(
                  <div key={r.id} style={{ background:"var(--card)", border:`1px solid var(--border)`, borderRadius:10, padding:"11px 13px", display:"flex", gap:11, alignItems:"center" }}>
                    <div style={{ width:44, height:44, borderRadius:8, flexShrink:0, overflow:"hidden", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid var(--border)`, cursor:"pointer" }}
                      onClick={()=>{ setSelected(r); setView("adminDetail"); }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:18 }}>🚢</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={()=>{ setSelected(r); setView("adminDetail"); }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:15, color:ORANGE, letterSpacing:1.5 }}>{r.plate}</span>
                        <SeverityBadge type={r.damageType}/>
                      </div>
                      <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>{r.vehicleType} — {r.damageType} — 👤 {r.driver}</div>
                      <div style={{ fontSize:10, color:"#1e3a5f" }}>{formatDate(r.date)}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:5, flexShrink:0 }}>
                      <button onClick={()=>setModal({ type:"resolve", report:r, note:"" })}
                        style={{ ...btn, background:GREEN+"18", border:`1px solid ${GREEN}55`, color:GREEN, borderRadius:6, padding:"5px 10px", fontSize:11 }}>✓ Risolto</button>
                      <button onClick={()=>setModal({ type:"delete", report:r })}
                        style={{ ...btn, background:RED+"11", border:`1px solid ${RED}44`, color:RED, borderRadius:6, padding:"5px 10px", fontSize:11 }}>🗑 Elimina</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {adminTab==="fuoriuso" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"var(--fuori-uso-text)", letterSpacing:1.5, fontWeight:700 }}>🔧 MEZZI IN RIPARAZIONE</span>
                  <button onClick={()=>{ setShowFuForm(f=>!f); setFuErrors({}); }}
                    style={{ ...btn, background:"var(--fuori-uso-bg)", border:"1px solid var(--fuori-uso-text)44", color:"var(--fuori-uso-text)", borderRadius:7, padding:"6px 12px", fontSize:11 }}>
                    {showFuForm ? "✕ Annulla" : "+ Aggiungi Mezzo"}
                  </button>
                </div>
                {showFuForm && (
                  <div style={{ background:"var(--fuori-uso-bg)", border:"1px solid var(--fuori-uso-text)33", borderRadius:10, padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:130 }}>
                        <Label text="Targa / ID Mezzo *"/>
                        <FieldInput placeholder="Es. PRT-0042" value={fuForm.plate} onChange={v=>setFuForm(f=>({...f,plate:v}))} error={fuErrors.plate}
                          style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, letterSpacing:3, textTransform:"uppercase", color:YELLOW }}/>
                        {fuErrors.plate && <div style={{ fontSize:11, color:RED, marginTop:4 }}>⚠ Obbligatorio</div>}
                      </div>
                      <div style={{ flex:1, minWidth:150 }}>
                        <Label text="Tipo Mezzo *"/>
                        <select value={fuForm.vehicleType} onChange={e=>setFuForm(f=>({...f,vehicleType:e.target.value}))}
                          style={{ width:"100%", background:"var(--input-bg)", color:fuForm.vehicleType?"#cce0f5":"#2a4a6e", border:`1px solid ${fuErrors.vehicleType?RED:BORDER}`, borderRadius:8, padding:"11px 12px", fontSize:14 }}>
                          <option value="">— Tipo —</option>
                          {VEHICLE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                        {fuErrors.vehicleType && <div style={{ fontSize:11, color:RED, marginTop:4 }}>⚠ Obbligatorio</div>}
                      </div>
                    </div>
                    <div>
                      <Label text="Motivo / Tipo Riparazione *"/>
                      <FieldInput placeholder="Es. Revisione motore, sostituzione pneumatici…" value={fuForm.reason} onChange={v=>setFuForm(f=>({...f,reason:v}))} error={fuErrors.reason}/>
                      {fuErrors.reason && <div style={{ fontSize:11, color:RED, marginTop:4 }}>⚠ Obbligatorio</div>}
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:150 }}>
                        <Label text="Data Prevista Rientro (opz)"/>
                        <FieldInput placeholder="Es. 20/05/2026" value={fuForm.dateExpectedOut} onChange={v=>setFuForm(f=>({...f,dateExpectedOut:v}))}/>
                      </div>
                      <div style={{ flex:2, minWidth:180 }}>
                        <Label text="Note (opzionale)"/>
                        <FieldInput placeholder="Ulteriori dettagli…" value={fuForm.note} onChange={v=>setFuForm(f=>({...f,note:v}))}/>
                      </div>
                    </div>
                    <button onClick={handleAddFuoriUso} disabled={busy}
                      style={{ ...btn, background:busy?"#555":YELLOW, color:"#000", border:"none", borderRadius:8, padding:"11px", fontSize:14, fontWeight:800 }}>
                      {busy ? "…" : "🔧 Aggiungi Mezzo Fuori Uso"}
                    </button>
                  </div>
                )}
                {fuoriUso.length===0 ? (
                  <div style={{ textAlign:"center", padding:40, color:"#4a3a00" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
                    <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:14 }}>Tutti i mezzi sono operativi!</div>
                  </div>
                ) : fuoriUso.map(f=>(
                  <div key={f.id} style={{ background:"var(--fuori-uso-bg)", border:"1px solid var(--fuori-uso-text)33", borderLeft:"3px solid var(--fuori-uso-text)", borderRadius:10, padding:"12px 13px", display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:16, color:"var(--fuori-uso-text)", letterSpacing:1.5 }}>{f.plate}</span>
                        <span style={{ fontSize:11, color:"#6a5a00" }}>🔧 {f.vehicleType}</span>
                      </div>
                      <div style={{ fontSize:12, color:"#a08000" }}>⚠ {f.reason}</div>
                      <div style={{ fontSize:10, color:"#4a3a00", marginTop:2 }}>📅 Dal {formatDate(f.dateIn)}{f.dateExpectedOut?` · Rientro: ${f.dateExpectedOut}`:""}</div>
                      {f.note && <div style={{ fontSize:10, color:"#5a4a00", marginTop:2, fontStyle:"italic" }}>📝 {f.note}</div>}
                    </div>
                    <button onClick={()=>setModal({ type:"deleteFuoriUso", fuoriUso:f })}
                      style={{ ...btn, background:GREEN+"18", border:`1px solid ${GREEN}44`, color:GREEN, borderRadius:6, padding:"6px 10px", fontSize:11, flexShrink:0 }}>✓ Rientrato</button>
                  </div>
                ))}
              </div>
            )}

            {adminTab==="resolved" && (resolved.length===0 ? (
              <div style={{ textAlign:"center", padding:50, color:"#1e3a5f" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
                <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:15 }}>Nessun guasto risolto ancora.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
                  <button onClick={()=>exportCSV(resolved,`storico_risolti_${new Date().toISOString().slice(0,10)}.csv`)}
                    style={{ ...btn, background:GREEN+"18", border:`1px solid ${GREEN}44`, color:GREEN, borderRadius:7, padding:"6px 12px", fontSize:11, letterSpacing:1 }}>
                    ⬇ Esporta CSV ({resolved.length})
                  </button>
                </div>
                {resolved.map(r=>(
                  <div key={r.id} style={{ background:"#071a0f", border:`1px solid ${GREEN}22`, borderLeft:`3px solid ${GREEN}44`, borderRadius:10, padding:"11px 13px", display:"flex", gap:11, alignItems:"center" }}>
                    <div style={{ width:44, height:44, borderRadius:8, flexShrink:0, overflow:"hidden", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${GREEN}33`, cursor:"pointer" }}
                      onClick={()=>{ setSelected(r); setView("resolvedDetail"); }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:18 }}>✅</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={()=>{ setSelected(r); setView("resolvedDetail"); }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:15, color:GREEN, letterSpacing:1.5 }}>{r.plate}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:3, background:GREEN+"22", color:GREEN, border:`1px solid ${GREEN}44` }}>RISOLTO</span>
                      </div>
                      <div style={{ fontSize:11, color:"#4a7a5a", marginTop:2 }}>{r.vehicleType} — {r.damageType} — 👤 {r.driver}</div>
                      <div style={{ fontSize:10, color:"#1e4a2a" }}>✅ {r.resolvedAt?formatDate(r.resolvedAt):""}</div>
                    </div>
                    <button onClick={()=>setModal({ type:"deleteResolved", report:r })}
                      style={{ ...btn, background:RED+"11", border:`1px solid ${RED}44`, color:RED, borderRadius:6, padding:"5px 10px", fontSize:11, flexShrink:0 }}>🗑 Elimina</button>
                  </div>
                ))}
              </div>
            ))}

            {adminTab==="stats" && <StatsTab reports={reports} resolved={resolved} fuoriUso={fuoriUso} />}
            {adminTab==="feedback" && <FeedbackAdminTab />}
          </div>
        )}

        {/* ADMIN DETAIL */}
        {view === "adminDetail" && selected && isAdmin && (
          <div className="anim">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, gap:10, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:10, color:"#2a4a6e", letterSpacing:2.5, fontWeight:700, marginBottom:4 }}>SCHEDA ATTIVA — ADMIN</div>
                <div style={{ fontSize:15, color:ORANGE, fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, letterSpacing:2 }}>{selected.id}</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setModal({ type:"resolve", report:selected, note:"" })}
                  style={{ ...btn, background:GREEN+"18", border:`1px solid ${GREEN}55`, color:GREEN, borderRadius:7, padding:"8px 13px", fontSize:12 }}>✓ Risolto</button>
                <button onClick={()=>setModal({ type:"delete", report:selected })}
                  style={{ ...btn, background:RED+"11", border:`1px solid ${RED}44`, color:RED, borderRadius:7, padding:"8px 13px", fontSize:12 }}>🗑 Elimina</button>
              </div>
            </div>
            {selected.photo && <div style={{ marginBottom:18, borderRadius:12, overflow:"hidden", border:`1px solid var(--border)` }}><img src={selected.photo} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", display:"block" }}/></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <InfoCard icon="🚢" label="Targa / ID" value={selected.plate} accent/>
              <InfoCard icon="🏗" label="Tipo Mezzo" value={selected.vehicleType||"—"}/>
              <InfoCard icon="👤" label="Operatore" value={selected.driver}/>
              <InfoCard icon="🔧" label="Tipo Danno" value={selected.damageType} extra={<SeverityBadge type={selected.damageType}/>}/>
              <InfoCard icon="📅" label="Data / Ora" value={formatDate(selected.date)} small/>
            </div>
            <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderLeft:`4px solid ${BLUE_LT}` }}>
              <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE</div>
              <p style={{ fontSize:14, color:"var(--text-dim)", lineHeight:1.8 }}>{selected.description}</p>
            </div>
          </div>
        )}

        {/* RESOLVED DETAIL */}
        {view === "resolvedDetail" && selected && (
          <div className="anim">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, gap:10, flexWrap:"wrap" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:10, color:"#2a4a6e", letterSpacing:2.5, fontWeight:700 }}>STORICO RISOLTI</span>
                  <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:3, background:GREEN+"22", color:GREEN, border:`1px solid ${GREEN}44` }}>RISOLTO</span>
                </div>
                <div style={{ fontSize:15, color:GREEN, fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, letterSpacing:2 }}>{selected.id}</div>
              </div>
              {isAdmin && (
                <button onClick={()=>setModal({ type:"deleteResolved", report:selected })}
                  style={{ ...btn, background:RED+"11", border:`1px solid ${RED}44`, color:RED, borderRadius:7, padding:"8px 13px", fontSize:12 }}>🗑 Elimina dallo storico</button>
              )}
            </div>
            {selected.photo && <div style={{ marginBottom:18, borderRadius:12, overflow:"hidden", border:`1px solid ${GREEN}33` }}><img src={selected.photo} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", display:"block", filter:"grayscale(20%)" }}/></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <InfoCard icon="🚢" label="Targa / ID" value={selected.plate} accent/>
              <InfoCard icon="🏗" label="Tipo Mezzo" value={selected.vehicleType||"—"}/>
              <InfoCard icon="👤" label="Operatore" value={selected.driver}/>
              <InfoCard icon="🔧" label="Tipo Danno" value={selected.damageType} extra={<SeverityBadge type={selected.damageType}/>}/>
              <InfoCard icon="📅" label="Data Segnalazione" value={formatDate(selected.date)} small/>
              {selected.resolvedAt && <InfoCard icon="✅" label="Data Risoluzione" value={formatDate(selected.resolvedAt)} small green/>}
            </div>
            <div style={{ background:"var(--card)", borderRadius:12, padding:"16px", border:`1px solid var(--border)`, borderLeft:`4px solid ${BLUE_LT}`, marginBottom:12 }}>
              <div style={{ fontSize:10, color:"var(--sub)", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE DANNO</div>
              <p style={{ fontSize:14, color:"var(--text-dim)", lineHeight:1.8 }}>{selected.description}</p>
            </div>
            {selected.resolveNote && (
              <div style={{ background:"#071a0f", borderRadius:12, padding:"16px", border:`1px solid ${GREEN}33`, borderLeft:`4px solid ${GREEN}` }}>
                <div style={{ fontSize:10, color:GREEN, letterSpacing:2, fontWeight:700, marginBottom:8 }}>✅ NOTE DI RISOLUZIONE</div>
                <p style={{ fontSize:14, color:"#6ee87d", lineHeight:1.8 }}>{selected.resolveNote}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ═══ MODAL RESET DATABASE ═══ */}
      {showReset && (
        <div style={{ position:"fixed", inset:0, background:"#000000dd", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#0a1525", border:`1px solid ${RED}55`, borderTop:`3px solid ${RED}`, borderRadius:14, padding:"28px 24px", maxWidth:380, width:"100%", boxShadow:"0 20px 60px #00000099" }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:42, marginBottom:10 }}>⚠️</div>
              <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:22, color:RED, letterSpacing:2, marginBottom:8 }}>RESET COMPLETO</div>
              <div style={{ fontSize:13, color:"var(--text-dim)", lineHeight:1.6 }}>
                Questa operazione eliminerà <strong style={{ color:RED }}>definitivamente</strong> tutti i dati:<br/>
                segnalazioni, risolti, fuori uso, messaggi e feedback.
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"var(--sub)", letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>🔑 PASSWORD DI RESET</div>
              <input
                type="password"
                value={resetPwd}
                onChange={e=>{ setResetPwd(e.target.value); setResetPwdErr(false); }}
                placeholder="Inserisci la password speciale…"
                style={{ width:"100%", background:"var(--input-bg)", color:"var(--text)", border:`1px solid ${resetPwdErr?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", boxSizing:"border-box" }}
              />
              {resetPwdErr && <div style={{ fontSize:11, color:RED, marginTop:6 }}>⚠ Password errata</div>}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ setShowReset(false); setResetPwd(""); setResetPwdErr(false); }}
                style={{ ...btn, flex:1, background:"transparent", border:`1px solid var(--border)`, color:"var(--sub)", borderRadius:8, padding:"12px", fontSize:13 }}>
                Annulla
              </button>
              <button disabled={resetting} onClick={async ()=>{
                if (resetPwd !== RESET_PASSWORD) { setResetPwdErr(true); return; }
                setResetting(true);
                try {
                  await resetAllData();
                  setReports([]); setResolved([]); setFuoriUso([]);
                  setShowReset(false); setResetPwd("");
                  playClick("success");
                  setToast({ id:Date.now(), title:"✅ RESET COMPLETATO", sub:"Tutti i dati sono stati eliminati." });
                } catch { playClick("error"); }
                setResetting(false);
              }}
                style={{ ...btn, flex:1, background:resetting?"#2a0808":RED, color:"#fff", border:"none", borderRadius:8, padding:"12px", fontSize:13, fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, letterSpacing:1, cursor:resetting?"wait":"pointer" }}>
                {resetting ? "⏳ Reset…" : "🗑 CONFERMA RESET"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
