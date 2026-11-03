// Promemoria giornaliero "Presa visione"
// File: api/promemoria.ts
// Lo fa partire Vercel ogni giorno verso le 13 (vedi vercel.json, orario in UTC).
// Manda UNA notifica a ogni persona che non ha ancora confermato una o più
// comunicazioni degli ultimi 7 giorni. Non parte due volte nello stesso giorno.
// Con ?prova=1 restituisce solo l'elenco di chi lo riceverebbe, senza inviare nulla.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const GIORNI_PROMEMORIA = 7;      // dopo 7 giorni il promemoria si ferma
const ORE_PRIMA_DEL_PRIMO = 12;   // una comunicazione appena inviata non genera subito un promemoria

const SUPABASE_URL = 'https://xmrtrghaiiycbrysrmwn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtcnRyZ2hhaWl5Y2JyeXNybXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjM1NTAsImV4cCI6MjA5NDQ5OTU1MH0.zo52TZvvPWaM4Yrkr0rlM_DhafsUidWxucixP2p8JCc';
const sbHeaders = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

// Stessa gestione della chiave usata in api/notify.ts
function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  if (k.startsWith('{')) {
    try { k = JSON.parse(k).private_key || k; } catch { /* non è JSON */ }
  }
  k = k.replace(/^['"]+|['"]+$/g, '');
  k = k.replace(/\\n/g, '\n').replace(/\r/g, '');
  return k.trim() + '\n';
}
function ensureFirebase() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || ''),
    }),
  });
}

async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> || {}) } });
  if (!r.ok) throw Object.assign(new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`), { status: r.status });
  const t = await r.text();
  return (t ? JSON.parse(t) : []) as T;
}

export interface ComRow { id: string; titolo: string; autore: string; creata_at: string; destinatari: { elenco?: string[] } | null; }
export interface LetturaRow { comunicazione_id: string; username: string; }
export interface TokenRow { token: string; username: string | null; }
export interface Promemoria { nome: string; tokens: string[]; comunicazioni: { id: string; titolo: string }[]; }

const k = (s: string | null | undefined) => String(s || '').trim().toLowerCase();

// Calcolo puro: chi deve ricevere il promemoria e per quali comunicazioni
export function pianificaPromemoria(com: ComRow[], letture: LetturaRow[], tokens: TokenRow[], adesso = Date.now()): Promemoria[] {
  const limiteVecchie = adesso - GIORNI_PROMEMORIA * 86400000;
  const limiteNuove = adesso - ORE_PRIMA_DEL_PRIMO * 3600000;
  // Telefoni per persona (solo chi ha le notifiche attive può ricevere il promemoria)
  const telefoni = new Map<string, { nome: string; tokens: Set<string> }>();
  tokens.forEach((t) => {
    if (!t.token || !k(t.username)) return;
    const e = telefoni.get(k(t.username)) || { nome: String(t.username).trim(), tokens: new Set<string>() };
    e.tokens.add(t.token); telefoni.set(k(t.username), e);
  });
  const confermate = new Set(letture.map((l) => `${l.comunicazione_id}|${k(l.username)}`));
  const perPersona = new Map<string, { id: string; titolo: string }[]>();
  com.forEach((c) => {
    const t = new Date(c.creata_at).getTime();
    if (!(t >= limiteVecchie && t <= limiteNuove)) return;
    // A chi era rivolta: elenco del gruppo, oppure tutti quelli con il telefono registrato
    const elenco = c.destinatari && Array.isArray(c.destinatari.elenco) ? c.destinatari.elenco : Array.from(telefoni.values()).map((x) => x.nome);
    const visti = new Set<string>();
    elenco.forEach((nome) => {
      const n = k(nome);
      if (!n || visti.has(n) || n === k(c.autore) || confermate.has(`${c.id}|${n}`)) return;
      visti.add(n);
      const lista = perPersona.get(n) || [];
      lista.push({ id: c.id, titolo: c.titolo }); perPersona.set(n, lista);
    });
  });
  const out: Promemoria[] = [];
  perPersona.forEach((lista, n) => {
    const tel = telefoni.get(n);
    if (tel && tel.tokens.size) out.push({ nome: tel.nome, tokens: Array.from(tel.tokens), comunicazioni: lista });
  });
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

export function testoPromemoria(p: Promemoria) {
  const n = p.comunicazioni.length;
  const primo = p.comunicazioni[0];
  return {
    title: n === 1 ? '📢 Comunicazione da confermare' : `📢 ${n} comunicazioni da confermare`,
    body: n === 1
      ? `«${primo.titolo}» — aprila e tocca "Presa visione".`
      : `«${primo.titolo}» e altre ${n - 1} — aprile e tocca "Presa visione".`,
    url: n === 1 ? `/?com=${primo.id}` : '/?tab=comunicazioni',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const prova = String(req.query?.prova || '') === '1';
  const giorno = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // AAAA-MM-GG ora italiana
  try {
    // Una volta sola al giorno: se la riga di oggi esiste già, ci si ferma
    if (!prova) {
      try {
        await sb('promemoria_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ giorno }) });
      } catch (e) {
        if ((e as { status?: number }).status === 409) return res.status(200).json({ giorno, giaInviato: true });
        throw e;
      }
    }
    const da = new Date(Date.now() - GIORNI_PROMEMORIA * 86400000).toISOString();
    const com = await sb<ComRow[]>(`comunicazioni?select=id,titolo,autore,creata_at,destinatari&creata_at=gte.${da}`);
    if (!com.length) return res.status(200).json({ giorno, persone: 0, notifiche: 0 });
    const ids = com.map((c) => `"${c.id}"`).join(',');
    const [letture, tokens] = await Promise.all([
      sb<LetturaRow[]>(`comunicazioni_letture?select=comunicazione_id,username&comunicazione_id=in.(${encodeURIComponent(ids)})`),
      sb<TokenRow[]>('fcm_tokens?select=token,username'),
    ]);
    const piano = pianificaPromemoria(com, letture, tokens);
    if (prova) return res.status(200).json({ giorno, prova: true, persone: piano.map((p) => ({ nome: p.nome, telefoni: p.tokens.length, comunicazioni: p.comunicazioni.map((c) => c.titolo) })) });

    ensureFirebase();
    let ok = 0; const nonValidi: string[] = [];
    for (const p of piano) {
      const t = testoPromemoria(p);
      const r = await getMessaging().sendEachForMulticast({
        tokens: p.tokens,
        data: { title: t.title, body: t.body, url: t.url, tag: `promemoria-${giorno}` },
        webpush: { headers: { Urgency: 'high', TTL: '43200' } },
      });
      ok += r.successCount;
      r.responses.forEach((x, i) => {
        const code = x.error?.code || '';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') nonValidi.push(p.tokens[i]);
      });
    }
    // Pulizia dei telefoni non più validi (come in api/notify.ts)
    if (nonValidi.length) {
      const list = nonValidi.map((t) => `"${t}"`).join(',');
      await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?token=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' } }).catch(() => {});
    }
    await sb(`promemoria_log?giorno=eq.${giorno}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ persone: piano.length, notifiche: ok }) }).catch(() => {});
    console.log(`Promemoria ${giorno}: ${piano.length} persone, ${ok} notifiche consegnate`);
    return res.status(200).json({ giorno, persone: piano.length, notifiche: ok });
  } catch (e) {
    console.error('Promemoria non riuscito:', e);
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
