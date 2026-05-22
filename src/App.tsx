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

interface WeatherData {
  temp: number; feels: number; humidity: number;
  description: string; icon: string;
  windSpeed: number; windDeg: number;
  city: string; sunrise: number; sunset: number;
}
async function fetchWeather(): Promise<WeatherData> {
  const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${OWM_LAT}&lon=${OWM_LON}&appid=${OWM_KEY}&units=metric&lang=it`);
  if (!r.ok) throw new Error("meteo non disponibile");
  const d = await r.json();
  return {
    temp: Math.round(d.main.temp),
    feels: Math.round(d.main.feels_like),
    humidity: d.main.humidity,
    description: d.weather[0].description,
    icon: d.weather[0].icon,
    windSpeed: Math.round(d.wind.speed * 3.6),
    windDeg: d.wind.deg || 0,
    city: d.name,
    sunrise: d.sys.sunrise,
    sunset: d.sys.sunset,
  };
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
  return <div style={{ fontSize:11, color:"#3b6fa0", letterSpacing:1.8, fontWeight:700, marginBottom:8, textTransform:"uppercase" }}>{text}</div>;
}
function FieldInput({ value, onChange, placeholder, error, style={} }: { value: string; onChange: (v: string) => void; placeholder: string; error?: boolean; style?: React.CSSProperties }) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ width:"100%", background:"#0a1628", color:"#e2eaf5", border:`1px solid ${error?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", ...style }} />;
}
function InfoCard({ icon, label, value, accent, small, green, extra }: { icon: string; label: string; value: string; accent?: boolean; small?: boolean; green?: boolean; extra?: React.ReactNode }) {
  const top = accent ? ORANGE : green ? GREEN : BLUE+"88";
  const col = accent ? ORANGE : green ? GREEN : "#d0e4f7";
  return (
    <div style={{ background:CARD, borderRadius:10, padding:"13px 15px", border:`1px solid ${BORDER}`, borderTop:`2px solid ${top}` }}>
      <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:5 }}>{icon} {label.toUpperCase()}</div>
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
      <div style={{ background:BG, border:`1px solid ${BORDER}`, borderTop:`3px solid ${BLUE_LT}`, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:740, height:"75vh", display:"flex", flexDirection:"column", boxShadow:"0 -8px 40px #00000088" }}>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:GREEN, boxShadow:`0 0 8px ${GREEN}` }} />
            <div>
              <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:17, letterSpacing:2, color:"#e8f4ff" }}>💬 CHAT OPERATORI</div>
              <div style={{ fontSize:10, color:"#3b6fa0" }}>COMPAGNIA PORTUALI — aggiornamento ogni 8s</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#3b6fa0", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"6px 20px", borderBottom:`1px solid ${BORDER}`, background:"#0a1628", flexShrink:0 }}>
          <span style={{ fontSize:11, color:"#3b6fa0" }}>Stai chattando come: <span style={{ color:ORANGE, fontWeight:700 }}>{userName}</span></span>
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
            style={{ flex:1, background:"#0a1628", color:"#e2eaf5", border:`1px solid ${BORDER}`, borderRadius:10, padding:"11px 14px", fontSize:14, fontFamily:"inherit" }}/>
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
          { label:"Mezzi fuori uso", value:fuoriUso.length, color:YELLOW, icon:"🔧" },
          { label:"Critici attivi", value:reports.filter(r=>CRITICAL.includes(r.damageType)).length, color:RED, icon:"🚨" },
        ].map(k => (
          <div key={k.label} style={{ flex:1, minWidth:120, background:CARD, border:`1px solid ${k.color}33`, borderTop:`3px solid ${k.color}`, borderRadius:10, padding:"12px" }}>
            <div style={{ fontSize:9, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{k.icon} {k.label.toUpperCase()}</div>
            <div style={{ fontSize:26, fontWeight:900, color:k.color, fontFamily:"Barlow Condensed, sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Grafico ultimi 7 giorni */}
      <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderTop:`3px solid ${PURPLE}` }}>
        <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:14 }}>📅 GUASTI ULTIMI 7 GIORNI</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80 }}>
          {last7.map((d,i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ fontSize:10, color:PURPLE, fontWeight:700 }}>{d.count > 0 ? d.count : ""}</div>
              <div style={{ width:"100%", background:d.count>0?PURPLE:BORDER, borderRadius:"4px 4px 0 0", height:`${Math.max(4, d.count/maxDay*60)}px`, transition:"height .4s", opacity:d.count>0?1:0.3 }}/>
              <div style={{ fontSize:9, color:"#3b6fa0", textTransform:"capitalize" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mezzi più problematici */}
      {byVehicle.length > 0 && (
        <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderTop:`3px solid ${ORANGE}` }}>
          <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:14 }}>🏗 MEZZI PIÙ PROBLEMATICI</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {byVehicle.slice(0,6).map((v,i) => (
              <div key={v.label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:11, color:i===0?ORANGE:"#3b6fa0", fontWeight:700, width:16 }}>{i+1}</div>
                <div style={{ fontSize:12, color:"#a0c4e8", width:160, flexShrink:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{v.label}</div>
                <div style={{ flex:1, height:8, background:BORDER, borderRadius:4, overflow:"hidden" }}>
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
        <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderTop:`3px solid ${RED}` }}>
          <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:14 }}>🔧 TIPI DI DANNO PIÙ FREQUENTI</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {byDamage.slice(0,6).map(d => (
              <div key={d.label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:12, color:"#a0c4e8", width:180, flexShrink:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.label}</div>
                <div style={{ flex:1, height:8, background:BORDER, borderRadius:4, overflow:"hidden" }}>
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
      <div style={{ background:BG, border:`1px solid ${BORDER}`, borderTop:`3px solid ${ORANGE}`, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:740, padding:"24px 20px 32px", boxShadow:"0 -8px 40px #00000088" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, letterSpacing:2, color:"#e8f4ff" }}>💡 FEEDBACK</div>
            <div style={{ fontSize:11, color:"#3b6fa0", marginTop:2 }}>Aiutaci a migliorare l'app</div>
          </div>
          <button onClick={()=>{ playClick("soft"); onClose(); }} style={{ background:"none", border:"none", color:"#3b6fa0", fontSize:22, cursor:"pointer" }}>✕</button>
        </div>
        {sent ? (
          <div style={{ textAlign:"center", padding:"30px 0" }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:GREEN, letterSpacing:2, marginBottom:8 }}>GRAZIE!</div>
            <div style={{ fontSize:13, color:"#3b6fa0", marginBottom:20 }}>Il tuo feedback è stato inviato.</div>
            <button onClick={()=>{ playClick("soft"); onClose(); }} style={{ padding:"10px 28px", background:ORANGE, color:"#fff", border:"none", borderRadius:8, fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, fontSize:14, letterSpacing:1.5, cursor:"pointer" }}>Chiudi</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom:20, textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:12 }}>COME VALUTI L'APP?</div>
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
              <div style={{ fontSize:11, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:8 }}>COSA MIGLIORERESTI? (opzionale)</div>
              <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Es. Vorrei poter filtrare per data…" rows={3}
                style={{ width:"100%", background:"#0a1628", color:"#cce0f5", border:`1px solid ${BORDER}`, borderRadius:8, padding:"11px 13px", fontSize:13, lineHeight:1.6, resize:"none", fontFamily:"inherit" }}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
              <div onClick={()=>{ playClick("soft"); setAnonymous(a=>!a); }}
                style={{ width:40, height:22, borderRadius:11, background:anonymous?BLUE_LT:BORDER, cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                <div style={{ position:"absolute", top:3, left:anonymous?20:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
              </div>
              <span style={{ fontSize:12, color:"#3b6fa0" }}>Invia <span style={{ color:anonymous?BLUE_LT:"#3b6fa0", fontWeight:700 }}>{anonymous?"in modo anonimo":"con il mio nome"}</span></span>
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
      {loading ? <div style={{ textAlign:"center", padding:40, color:"#3b6fa0" }}>Caricamento…</div>
      : items.length===0 ? (
        <div style={{ textAlign:"center", padding:50 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💡</div>
          <div style={{ fontSize:15, color:"#1e3a5f", fontFamily:"Barlow Condensed, sans-serif", fontWeight:800 }}>NESSUN FEEDBACK ANCORA</div>
        </div>
      ) : (
        <>
          <div style={{ background:CARD, borderRadius:12, padding:"16px 20px", border:`1px solid ${BORDER}`, borderTop:`3px solid #f59e0b`, marginBottom:16, display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:40, color:"#f59e0b", lineHeight:1 }}>{avg}</div>
              <div style={{ fontSize:11, color:"#3b6fa0", marginTop:2 }}>su {items.length} feedback</div>
            </div>
            <div style={{ flex:1 }}>
              {[5,4,3,2,1].map(s=>{ const c=items.filter(i=>i.stars===s).length; const p=items.length?(c/items.length*100):0; return (
                <div key={s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"#3b6fa0", width:12 }}>{s}</span>
                  <span style={{ fontSize:12 }}>⭐</span>
                  <div style={{ flex:1, height:6, background:BORDER, borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:`${p}%`, height:"100%", background:"#f59e0b", borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:"#3b6fa0", width:16 }}>{c}</span>
                </div>
              );})}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {items.map(f=>(
              <div key={f.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:"13px 15px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:f.text?6:0 }}>
                  <span style={{ fontSize:16 }}>{"⭐".repeat(f.stars)}</span>
                  <span style={{ fontSize:11, color:"#3b6fa0", marginLeft:"auto" }}>👤 {f.author} · {formatDate(f.created_at)}</span>
                </div>
                {f.text && <div style={{ fontSize:13, color:"#a0c4e8", lineHeight:1.6, fontStyle:"italic" }}>"{f.text}"</div>}
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
      <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderTop:`3px solid ${BLUE_LT}`, borderRadius:14, padding:"28px 24px", maxWidth:360, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:34, marginBottom:10 }}>👤</div>
          <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:"#d0e8ff", letterSpacing:1.5 }}>COME TI CHIAMI?</div>
          <div style={{ fontSize:12, color:"#3b6fa0", marginTop:4 }}>Verrà mostrato nelle segnalazioni e in chat</div>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onConfirm(name.trim())}
          placeholder="Es. Mario Rossi"
          style={{ width:"100%", background:"#0a1628", color:"#e2eaf5", border:`1px solid ${BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", marginBottom:16 }}/>
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
  const [dashTab, setDashTab]   = useState("active");
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

  useEffect(() => { loadData(); }, [loadData]);
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
    .filter(r => !toDate   || new Date(r.date) <= toDate);
  const hasFilters = filterType !== "Tutti" || filterDate.from || filterDate.to || search;
  const isAdminView   = ["admin","adminDetail","adminLogin"].includes(view) || (view==="resolvedDetail" && isAdmin);
  const btn: React.CSSProperties = { fontFamily:"Barlow Condensed, sans-serif", fontWeight:700, cursor:"pointer" };

  return (
    <div style={{ minHeight:"100vh", background:BG, fontFamily:"'Barlow','Barlow Condensed',sans-serif", color:"#cce0f5" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Barlow+Condensed:wght@500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        input,textarea,select{font-family:inherit}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${BG}}::-webkit-scrollbar-thumb{background:#162035;border-radius:4px}
        .card:hover{background:#111e33!important;transform:translateY(-1px)}
        .card{transition:all .15s;cursor:pointer}
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
      `}</style>

      {showNameModal && <NameModal onConfirm={handleSetName} />}
      {showChat && <ChatPanel onClose={()=>{ playClick("soft"); setShowChat(false); setUnreadChat(0); }} userName={userName} />}
      {showFeedback && <FeedbackPanel onClose={()=>setShowFeedback(false)} userName={userName} />}

      {/* MODALS */}
      <Modal show={modal?.type==="deleteFuoriUso"} onClose={()=>setModal(null)} borderColor={GREEN} icon="✅" title="MEZZO RIENTRATO" titleColor={GREEN}>
        <div style={{ fontSize:13, color:"#7bacd4", textAlign:"center", marginBottom:4 }}>Confermi il rientro del mezzo</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:18, color:YELLOW, textAlign:"center", letterSpacing:2, marginBottom:2 }}>{modal?.fuoriUso?.plate}</div>
        <div style={{ fontSize:13, color:"#3b6fa0", textAlign:"center", marginBottom:22 }}>{modal?.fuoriUso?.vehicleType}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmDeleteFuoriUso} disabled={busy} style={{ ...btn, flex:2, padding:"11px", borderRadius:8, background:busy?"#555":GREEN, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"✓ Conferma Rientro"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="delete"} onClose={()=>setModal(null)} borderColor={RED} icon="🗑" title="ELIMINA SEGNALAZIONE" titleColor={RED}>
        <div style={{ fontSize:13, color:"#7bacd4", textAlign:"center", marginBottom:4 }}>Stai per eliminare la segnalazione</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:ORANGE, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"#3b6fa0", textAlign:"center", marginBottom:22 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmDelete} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:busy?"#555":RED, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"Elimina"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="deleteResolved"} onClose={()=>setModal(null)} borderColor={RED} icon="🗑" title="ELIMINA DALLO STORICO" titleColor={RED}>
        <div style={{ fontSize:13, color:"#7bacd4", textAlign:"center", marginBottom:4 }}>Stai per eliminare definitivamente</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:GREEN, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"#3b6fa0", textAlign:"center", marginBottom:22 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmDeleteResolved} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:busy?"#555":RED, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"Elimina"}</button>
        </div>
      </Modal>
      <Modal show={modal?.type==="resolve"} onClose={()=>setModal(null)} borderColor={GREEN} icon="✅" title="SEGNA COME RISOLTO" titleColor={GREEN}>
        <div style={{ fontSize:13, color:"#7bacd4", textAlign:"center", marginBottom:4 }}>Segnalazione</div>
        <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:16, color:ORANGE, textAlign:"center", letterSpacing:1.5, marginBottom:2 }}>{modal?.report?.id}</div>
        <div style={{ fontSize:13, color:"#3b6fa0", textAlign:"center", marginBottom:18 }}>{modal?.report?.vehicleType} — {modal?.report?.plate}</div>
        <Label text="Note di risoluzione (opzionale)" />
        <textarea value={modal?.note||""} onChange={e=>setModal(m=>m?({...m,note:e.target.value}):m)}
          placeholder="Es. Riparato in officina…" rows={3}
          style={{ width:"100%", background:"#0a1628", color:"#cce0f5", border:`1px solid ${BORDER}`, borderRadius:8, padding:"11px 13px", fontSize:13, lineHeight:1.6, resize:"none", marginBottom:18 }}/>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={()=>setModal(null)} disabled={busy} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, fontSize:14 }}>Annulla</button>
          <button onClick={confirmResolve} disabled={busy} style={{ ...btn, flex:2, padding:"11px", borderRadius:8, background:busy?"#555":GREEN, color:"#fff", border:"none", cursor:busy?"default":"pointer", fontSize:14 }}>{busy?"…":"✓ Conferma Risolto"}</button>
        </div>
      </Modal>

      {/* HEADER */}
      <header style={{ background:"linear-gradient(135deg,#060d1a,#0a1628)", borderBottom:`3px solid ${ORANGE}`, padding:"0 16px", height:68, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 24px #00000088" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {view !== "dashboard" && (
            <button className="back-btn" onClick={()=>goHome(null)} style={{ background:"none", border:"none", color:"#3b6fa0", fontSize:24, cursor:"pointer", lineHeight:1, transition:"color .15s", padding:"4px 8px" }}>←</button>
          )}
          <div style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg,${BLUE},${BLUE_LT})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
            <span className="wave">⚓</span>
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:900, letterSpacing:2, fontFamily:"Barlow Condensed, sans-serif", color:isAdminView?"#fbbf24":"#e8f4ff", lineHeight:1 }}>
              {isAdminView ? "🔐 PANNELLO ADMIN" : "SEGNALAZIONE DANNI"}
            </div>
            <div style={{ fontSize:9, color:ORANGE, letterSpacing:2.5, fontWeight:700, marginTop:1 }}>COMPAGNIA PORTUALI{userName?" • "+userName:""}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {/* Chat button */}
          <button onClick={()=>{ playClick("soft"); setShowChat(true); setUnreadChat(0); }}
            style={{ position:"relative", background:"transparent", color:BLUE_LT, border:`1px solid ${BORDER}`, borderRadius:7, padding:"7px 11px", cursor:"pointer", fontSize:16 }}>
            💬
            {unreadChat > 0 && (
              <span style={{ position:"absolute", top:-6, right:-6, background:RED, color:"#fff", borderRadius:"50%", width:18, height:18, fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, animation:"pulse 1s ease-in-out infinite" }}>{unreadChat}</span>
            )}
          </button>
          <button onClick={()=>{ playClick("soft"); setShowFeedback(true); }}
            style={{ background:"transparent", color:ORANGE, border:`1px solid ${ORANGE}44`, borderRadius:7, padding:"7px 11px", cursor:"pointer", fontSize:16 }} title="Invia feedback">
            💡
          </button>
          {view === "dashboard" && <>
            <button onClick={()=>{ playClick("soft"); loadData(); }} style={{ ...btn, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, borderRadius:7, padding:"7px 11px", fontSize:15 }} title="Aggiorna">🔄</button>
            <button onClick={()=>{ playClick("soft"); setView("adminLogin"); }} style={{ ...btn, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, borderRadius:7, padding:"7px 11px", fontSize:11, letterSpacing:1 }}>🔐 Admin</button>
            <button onClick={()=>{ playClick("soft"); setView("new"); }} style={{ ...btn, background:ORANGE, color:"#fff", border:"none", borderRadius:7, padding:"8px 14px", fontSize:12, letterSpacing:1.5, boxShadow:`0 4px 14px ${ORANGE}44` }}>+ Nuova</button>
          </>}
          {view === "admin" && (
            <button onClick={()=>goHome(null)} style={{ ...btn, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, borderRadius:7, padding:"7px 11px", fontSize:11 }}>Esci da Admin</button>
          )}
        </div>
      </header>

      {/* STRIPE */}
      {(view==="dashboard"||view==="admin") && (
        <div style={{ background:`linear-gradient(90deg,${BLUE}22,transparent 60%)`, borderBottom:`1px solid ${BORDER}`, padding:"7px 20px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:GREEN, boxShadow:`0 0 8px ${GREEN}` }} />
          <span style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700 }}>
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
        return (
          <div style={{ background: weather.windSpeed>=40 ? wa.color+"18" : "#0a1628", borderBottom:`1px solid ${weather.windSpeed>=40 ? wa.color+"55" : BORDER}`, padding:"8px 20px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" style={{ width:32, height:32, flexShrink:0 }}/>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:18, color:"#e8f4ff" }}>{weather.temp}°C</span>
              <span style={{ fontSize:11, color:"#3b6fa0", textTransform:"capitalize" }}>{weather.description}</span>
            </div>
            <div style={{ width:1, height:20, background:BORDER, flexShrink:0 }}/>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <span style={{ fontSize:11, color:"#3b6fa0" }}>💨</span>
              <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:800, fontSize:15, color:wa.color }}>{weather.windSpeed} km/h</span>
              <span style={{ fontSize:10, color:"#3b6fa0" }}>{windDir(weather.windDeg)}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:3, background:wa.color+"22", color:wa.color, border:`1px solid ${wa.color}44`, letterSpacing:1 }}>{wa.label}</span>
            </div>
            {weather.windSpeed>=40 && (
              <>
                <div style={{ width:1, height:20, background:BORDER, flexShrink:0 }}/>
                <span style={{ fontSize:11, color:wa.color, fontWeight:700 }}>⚠ Verificare condizioni sollevamento</span>
              </>
            )}
            <div style={{ marginLeft:"auto", fontSize:10, color:"#1e3a5f" }}>📍 Piombino</div>
          </div>
        );
      })()}

      <main style={{ maxWidth:740, margin:"0 auto", padding:"20px 14px" }}>

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
              {[{label:"Attivi",value:reports.length,color:BLUE_LT,icon:"📋"},{label:"Critici",value:criticalCount,color:RED,icon:"🚨"},{label:"Fuori Uso",value:fuoriUso.length,color:YELLOW,icon:"🔧"},{label:"Oggi",value:todayCount,color:ORANGE,icon:"📅"}].map(s=>(
                <div key={s.label} style={{ flex:1, minWidth:70, background:CARD, border:`1px solid ${s.color}33`, borderTop:`3px solid ${s.color}`, borderRadius:10, padding:"13px 11px" }}>
                  <div style={{ fontSize:9, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{s.icon} {s.label.toUpperCase()}</div>
                  <div style={{ fontSize:28, fontWeight:900, color:s.color, fontFamily:"Barlow Condensed, sans-serif", lineHeight:1 }}>{booting ? "…" : s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", marginBottom:18, border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
              {[{key:"active",label:"⚠ GUASTI",color:ORANGE,count:reports.length},{key:"fuoriuso",label:"🔧 FUORI USO",color:YELLOW,count:fuoriUso.length},{key:"resolved",label:"✅ RISOLTI",color:GREEN,count:resolved.length}].map(t=>(
                <button key={t.key} onClick={()=>setDashTab(t.key)}
                  style={{ ...btn, flex:1, padding:"11px 4px", border:"none", fontSize:10, letterSpacing:0.8, transition:"all .15s",
                    background:dashTab===t.key?t.color+"22":"transparent", color:dashTab===t.key?t.color:"#2a4a6e",
                    borderBottom:dashTab===t.key?`2px solid ${t.color}`:"2px solid transparent" }}>
                  {t.label} ({t.count})
                </button>
              ))}
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
                    <div key={f.id} style={{ background:"#120e00", border:`1px solid ${YELLOW}33`, borderLeft:`3px solid ${YELLOW}55`, borderRadius:10, padding:"14px 16px", animationDelay:i*.03+"s" }} className="anim">
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:20, color:YELLOW, letterSpacing:2 }}>{f.plate}</span>
                        <span style={{ fontSize:10, fontWeight:800, padding:"2px 9px", borderRadius:3, background:YELLOW+"22", color:YELLOW, border:`1px solid ${YELLOW}55` }}>FUORI USO</span>
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
                      <div style={{ width:52, height:52, borderRadius:8, flexShrink:0, overflow:"hidden", background:"#0a1628", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${GREEN}33` }}>
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
                    style={{ width:"100%", background:"#0a1628", color:"#e2eaf5", border:`1px solid ${search?BLUE_LT:BORDER}`, borderRadius:9, padding:"10px 36px 10px 40px", fontSize:13, fontFamily:"inherit" }}/>
                  {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#3b6fa0", cursor:"pointer", fontSize:15 }}>✕</button>}
                </div>
              )}
              {reports.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                  {/* Filtro per mezzo */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {["Tutti",...VEHICLE_TYPES].filter(t=>t==="Tutti"||reports.some(r=>r.vehicleType===t)).map(t=>(
                      <button key={t} onClick={()=>setFilterType(t)} style={{ ...btn, padding:"4px 10px", borderRadius:5, fontSize:10, letterSpacing:1, textTransform:"uppercase", background:filterType===t?BLUE:"transparent", color:filterType===t?"#fff":"#3b6fa0", border:`1px solid ${filterType===t?BLUE:BORDER}` }}>{t}</button>
                    ))}
                  </div>
                  {/* Filtro per data */}
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, flexShrink:0 }}>📅 DAL</span>
                    <input type="date" value={filterDate.from} onChange={e=>setFilterDate(f=>({...f,from:e.target.value}))}
                      style={{ background:"#0a1628", color:"#e2eaf5", border:`1px solid ${filterDate.from?BLUE_LT:BORDER}`, borderRadius:7, padding:"6px 10px", fontSize:12, fontFamily:"inherit" }}/>
                    <span style={{ fontSize:10, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, flexShrink:0 }}>AL</span>
                    <input type="date" value={filterDate.to} onChange={e=>setFilterDate(f=>({...f,to:e.target.value}))}
                      style={{ background:"#0a1628", color:"#e2eaf5", border:`1px solid ${filterDate.to?BLUE_LT:BORDER}`, borderRadius:7, padding:"6px 10px", fontSize:12, fontFamily:"inherit" }}/>
                    {hasFilters && (
                      <button onClick={()=>{ setFilterType("Tutti"); setFilterDate({from:"",to:""}); setSearch(""); }}
                        style={{ ...btn, background:RED+"22", border:`1px solid ${RED}44`, color:RED, borderRadius:6, padding:"5px 10px", fontSize:10, letterSpacing:1 }}>✕ RESET</button>
                    )}
                  </div>
                </div>
              )}
              {booting ? (
                <div style={{ textAlign:"center", padding:60, color:"#3b6fa0" }}>
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
                      style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:"13px 14px", display:"flex", gap:12, alignItems:"flex-start", animationDelay:i*.03+"s" }}>
                      <div style={{ width:52, height:52, borderRadius:8, flexShrink:0, overflow:"hidden", background:"#0a1628", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${BORDER}` }}>
                        {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:22 }}>🚢</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                          <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:18, color:ORANGE, letterSpacing:1.5 }}>{r.plate}</span>
                          <SeverityBadge type={r.damageType}/>
                        </div>
                        <div style={{ fontSize:12, color:"#7bacd4", fontWeight:600, marginBottom:2 }}>{r.vehicleType} — {r.damageType}</div>
                        <div style={{ fontSize:11, color:"#2a4a6e", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.description}</div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:10, color:"#1e3a5f" }}>{formatDate(r.date)}</div>
                        <div style={{ fontSize:11, color:"#3b6fa0", marginTop:3, fontWeight:600 }}>👤 {r.driver}</div>
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
              <h2 style={{ fontFamily:"Barlow Condensed, sans-serif", fontSize:28, fontWeight:900, letterSpacing:2, color:"#d0e8ff" }}>NUOVA SEGNALAZIONE</h2>
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
                  style={{ width:"100%", background:"#0a1628", color:form.vehicleType?"#cce0f5":"#2a4a6e", border:`1px solid ${errors.vehicleType?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14 }}>
                  <option value="">— Seleziona tipo di mezzo —</option>
                  {VEHICLE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {errors.vehicleType && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
              </div>
              <div>
                <Label text="Tipo di Danno *"/>
                <select value={form.damageType} onChange={e=>setForm(f=>({...f,damageType:e.target.value}))}
                  style={{ width:"100%", background:"#0a1628", color:form.damageType?"#cce0f5":"#2a4a6e", border:`1px solid ${errors.damageType?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14 }}>
                  <option value="">— Seleziona tipo di danno —</option>
                  {DAMAGE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {errors.damageType && <div style={{ fontSize:11, color:RED, marginTop:5 }}>⚠ Campo obbligatorio</div>}
              </div>
              <div>
                <Label text="Descrizione del Danno *"/>
                <textarea placeholder="Descrivi dove si trova il danno, come si è verificato e la sua entità…"
                  value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={4}
                  style={{ width:"100%", background:"#0a1628", color:"#cce0f5", border:`1px solid ${errors.description?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, lineHeight:1.6, resize:"vertical" }}/>
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
                    style={{ width:"100%", padding:"26px 20px", background:"#0a1628", border:`2px dashed ${BORDER}`, borderRadius:10, color:"#2a4a6e", cursor:"pointer", fontSize:14, transition:"all .15s" }}>
                    {form.photo==="loading" ? "⏳  Compressione…" : "📷  Scatta foto o carica immagine"}
                  </button>
                )}
              </div>
              <div style={{ display:"flex", gap:12, paddingTop:4 }}>
                <button onClick={()=>{ playClick("soft"); goHome(null); }} style={{ ...btn, flex:1, padding:"12px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`2px solid ${BORDER}`, fontSize:14, letterSpacing:1.5, textTransform:"uppercase" }}>Annulla</button>
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
            {selected.photo && <div style={{ marginBottom:18, borderRadius:12, overflow:"hidden", border:`1px solid ${BORDER}` }}><img src={selected.photo} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", display:"block" }}/></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <InfoCard icon="🚢" label="Targa / ID" value={selected.plate} accent/>
              <InfoCard icon="🏗" label="Tipo Mezzo" value={selected.vehicleType||"—"}/>
              <InfoCard icon="👤" label="Operatore" value={selected.driver}/>
              <InfoCard icon="🔧" label="Tipo Danno" value={selected.damageType} extra={<SeverityBadge type={selected.damageType}/>}/>
              <InfoCard icon="📅" label="Data / Ora" value={formatDate(selected.date)} small/>
            </div>
            <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderLeft:`4px solid ${BLUE_LT}`, marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE</div>
              <p style={{ fontSize:14, color:"#a0c4e8", lineHeight:1.8 }}>{selected.description}</p>
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
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderTop:`3px solid ${ORANGE}`, borderRadius:14, padding:"28px 24px" }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🔐</div>
                <div style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:22, letterSpacing:2, color:"#d0e8ff" }}>AREA AMMINISTRATORE</div>
                <div style={{ fontSize:12, color:"#3b6fa0", marginTop:3 }}>COMPAGNIA PORTUALI</div>
              </div>
              <Label text="Password Admin"/>
              <input type="password" value={pwd} onChange={e=>{ setPwd(e.target.value); setPwdErr(false); }}
                onKeyDown={e=>{ if(e.key==="Enter"){ if(pwd===ADMIN_PASSWORD){setPwd("");setIsAdmin(true);setView("admin");}else{setPwdErr(true);setPwd("");} } }}
                placeholder="Inserisci la password…"
                style={{ width:"100%", background:"#0a1628", color:"#e2eaf5", border:`1px solid ${pwdErr?RED:BORDER}`, borderRadius:8, padding:"12px 14px", fontSize:14, fontFamily:"inherit", marginBottom:6 }}/>
              {pwdErr && <div style={{ fontSize:11, color:RED, marginBottom:10 }}>⚠ Password errata</div>}
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                <button onClick={()=>{ setPwd(""); setPwdErr(false); goHome(null); }} style={{ ...btn, flex:1, padding:"11px", borderRadius:8, background:"transparent", color:"#3b6fa0", border:`1px solid ${BORDER}`, fontSize:14 }}>Indietro</button>
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
              {[{label:"Attivi",value:reports.length,color:BLUE_LT,icon:"📋"},{label:"Critici",value:criticalCount,color:RED,icon:"🚨"},{label:"Fuori Uso",value:fuoriUso.length,color:YELLOW,icon:"🔧"},{label:"Oggi",value:todayCount,color:ORANGE,icon:"📅"}].map(s=>(
                <div key={s.label} style={{ flex:1, minWidth:70, background:CARD, border:`1px solid ${s.color}33`, borderTop:`3px solid ${s.color}`, borderRadius:10, padding:"13px 11px" }}>
                  <div style={{ fontSize:9, color:"#3b6fa0", letterSpacing:1.5, fontWeight:700, marginBottom:4 }}>{s.icon} {s.label.toUpperCase()}</div>
                  <div style={{ fontSize:28, fontWeight:900, color:s.color, fontFamily:"Barlow Condensed, sans-serif", lineHeight:1 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", marginBottom:16, border:`1px solid ${BORDER}`, borderRadius:10, overflow:"hidden" }}>
              {[{key:"active",label:"⚠ ATTIVI",color:ORANGE,count:reports.length},{key:"fuoriuso",label:"🔧 FUORI USO",color:YELLOW,count:fuoriUso.length},{key:"resolved",label:"✅ RISOLTI",color:GREEN,count:resolved.length},{key:"stats",label:"📊 STATS",color:"#a855f7",count:0},{key:"feedback",label:"💡 FEEDBACK",color:BLUE_LT,count:0}].map(t=>(
                <button key={t.key} onClick={()=>setAdminTab(t.key)}
                  style={{ ...btn, flex:1, padding:"11px 4px", border:"none", fontSize:10, letterSpacing:0.8, transition:"all .15s",
                    background:adminTab===t.key?t.color+"22":"transparent", color:adminTab===t.key?t.color:"#2a4a6e",
                    borderBottom:adminTab===t.key?`2px solid ${t.color}`:"2px solid transparent" }}>
                  {t.label} ({t.count})
                </button>
              ))}
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
                  <div key={r.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:"11px 13px", display:"flex", gap:11, alignItems:"center" }}>
                    <div style={{ width:44, height:44, borderRadius:8, flexShrink:0, overflow:"hidden", background:"#0a1628", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${BORDER}`, cursor:"pointer" }}
                      onClick={()=>{ setSelected(r); setView("adminDetail"); }}>
                      {r.photo ? <img src={r.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:18 }}>🚢</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={()=>{ setSelected(r); setView("adminDetail"); }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:15, color:ORANGE, letterSpacing:1.5 }}>{r.plate}</span>
                        <SeverityBadge type={r.damageType}/>
                      </div>
                      <div style={{ fontSize:11, color:"#7bacd4", marginTop:2 }}>{r.vehicleType} — {r.damageType} — 👤 {r.driver}</div>
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
                  <span style={{ fontSize:11, color:"#4a3a00", letterSpacing:1.5, fontWeight:700 }}>🔧 MEZZI IN RIPARAZIONE</span>
                  <button onClick={()=>{ setShowFuForm(f=>!f); setFuErrors({}); }}
                    style={{ ...btn, background:YELLOW+"22", border:`1px solid ${YELLOW}55`, color:YELLOW, borderRadius:7, padding:"6px 12px", fontSize:11 }}>
                    {showFuForm ? "✕ Annulla" : "+ Aggiungi Mezzo"}
                  </button>
                </div>
                {showFuForm && (
                  <div style={{ background:"#120e00", border:`1px solid ${YELLOW}33`, borderRadius:10, padding:"16px", display:"flex", flexDirection:"column", gap:12 }}>
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
                          style={{ width:"100%", background:"#0a1628", color:fuForm.vehicleType?"#cce0f5":"#2a4a6e", border:`1px solid ${fuErrors.vehicleType?RED:BORDER}`, borderRadius:8, padding:"11px 12px", fontSize:14 }}>
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
                  <div key={f.id} style={{ background:"#120e00", border:`1px solid ${YELLOW}33`, borderLeft:`3px solid ${YELLOW}55`, borderRadius:10, padding:"12px 13px", display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:3 }}>
                        <span style={{ fontFamily:"Barlow Condensed, sans-serif", fontWeight:900, fontSize:16, color:YELLOW, letterSpacing:1.5 }}>{f.plate}</span>
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
                    <div style={{ width:44, height:44, borderRadius:8, flexShrink:0, overflow:"hidden", background:"#0a1628", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${GREEN}33`, cursor:"pointer" }}
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
            {selected.photo && <div style={{ marginBottom:18, borderRadius:12, overflow:"hidden", border:`1px solid ${BORDER}` }}><img src={selected.photo} alt="" style={{ width:"100%", maxHeight:280, objectFit:"cover", display:"block" }}/></div>}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <InfoCard icon="🚢" label="Targa / ID" value={selected.plate} accent/>
              <InfoCard icon="🏗" label="Tipo Mezzo" value={selected.vehicleType||"—"}/>
              <InfoCard icon="👤" label="Operatore" value={selected.driver}/>
              <InfoCard icon="🔧" label="Tipo Danno" value={selected.damageType} extra={<SeverityBadge type={selected.damageType}/>}/>
              <InfoCard icon="📅" label="Data / Ora" value={formatDate(selected.date)} small/>
            </div>
            <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderLeft:`4px solid ${BLUE_LT}` }}>
              <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE</div>
              <p style={{ fontSize:14, color:"#a0c4e8", lineHeight:1.8 }}>{selected.description}</p>
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
            <div style={{ background:CARD, borderRadius:12, padding:"16px", border:`1px solid ${BORDER}`, borderLeft:`4px solid ${BLUE_LT}`, marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#3b6fa0", letterSpacing:2, fontWeight:700, marginBottom:8 }}>📝 DESCRIZIONE DANNO</div>
              <p style={{ fontSize:14, color:"#a0c4e8", lineHeight:1.8 }}>{selected.description}</p>
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
    </div>
  );
}
