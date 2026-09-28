// Vercel Serverless Function per inviare notifiche push
// File: api/notify.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Inizializza Firebase Admin (una sola volta) — API modulare di firebase-admin v12+
// (la vecchia forma admin.apps / admin.credential / admin.messaging() non esiste più nella v14
//  e faceva fallire il server ad ogni invio)
// Accetta la chiave in qualsiasi formato incollato su Vercel:
// con virgolette, con \\n letterali, con a capo veri, o l'intero JSON del service account
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
      // La chiave privata su Vercel ha \n come stringa letterale — va convertita
      privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || ''),
    }),
  });
}

// Lista telefoni registrati (stessa chiave pubblica "anon" già usata dall'app)
const SUPABASE_URL = 'https://xmrtrghaiiycbrysrmwn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtcnRyZ2hhaWl5Y2JyeXNybXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjM1NTAsImV4cCI6MjA5NDQ5OTU1MH0.zo52TZvvPWaM4Yrkr0rlM_DhafsUidWxucixP2p8JCc';
const sbHeaders = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

async function loadAllTokens(): Promise<string[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?select=token`, { headers: sbHeaders });
  if (!r.ok) throw new Error('Lettura token fallita: ' + r.status);
  const rows = (await r.json()) as { token: string }[];
  return Array.from(new Set(rows.map((x) => x.token).filter(Boolean)));
}

async function deleteTokens(tokens: string[]) {
  if (!tokens.length) return;
  const list = tokens.map((t) => `"${t}"`).join(',');
  await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?token=in.(${encodeURIComponent(list)})`, {
    method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
  }).catch(() => {});
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, url, delay, all, exclude, dryRun } = req.body as {
    dryRun?: boolean;    // true = verifica i telefoni senza consegnare nulla
    tokens?: string[];
    all?: boolean;       // true = invia a tutti i telefoni registrati
    exclude?: string;    // token da escludere (chi ha generato l'evento)
    title: string;
    body: string;
    url?: string;
    delay?: number; // secondi di attesa (solo per la notifica di prova, max 8)
  };

  // Diagnosi: controlla che le variabili Firebase esistano su Vercel (mostra solo i NOMI, mai i valori)
  const missing = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: 'Variabili mancanti su Vercel: ' + missing.join(', ') });
  }

  let tokens: string[] = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
  if (all) {
    try { tokens = await loadAllTokens(); } catch (e) { return res.status(500).json({ error: String(e) }); }
  }
  if (exclude) tokens = tokens.filter((t) => t !== exclude);
  if (tokens.length === 0) {
    return res.status(200).json({ successCount: 0, failureCount: 0, invalidTokens: [], errors: [] });
  }

  const wait = Math.min(Math.max(Number(delay) || 0, 0), 8);
  if (wait) await new Promise((r) => setTimeout(r, wait * 1000));

  try {
    // Messaggio "data-only": il banner lo costruisce il service worker,
    // così non ci sono doppioni e funziona uguale su iPhone, Android e PC.
    const pk = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');
    if (!pk.includes('-----BEGIN PRIVATE KEY-----') || !pk.includes('-----END PRIVATE KEY-----')) {
      // Solo diagnosi di formato: la chiave non viene mai mostrata
      return res.status(500).json({ error: `Chiave su Vercel non valida: BEGIN=${pk.includes('BEGIN PRIVATE KEY')} END=${pk.includes('END PRIVATE KEY')} lunghezza=${pk.length}` });
    }
    ensureFirebase();
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        title: String(title || 'Porto Danni'),
        body: String(body || ''),
        url: String(url || '/'),
        tag: 'porto-' + Date.now(),
      },
      webpush: {
        headers: {
          Urgency: 'high', // consegna immediata anche con telefono in standby
          TTL: '86400',    // se il telefono è spento, consegna entro 24 ore
        },
      },
    }, dryRun === true);

    console.log(`Notifiche inviate: ${response.successCount} ok, ${response.failureCount} fallite`);

    // Raccogli token non validi per poterli rimuovere
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        console.warn('Token fallito:', code);
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    await deleteTokens(invalidTokens); // pulizia automatica telefoni non più validi

    const errors = response.responses
      .map((r) => (r.success ? null : `${r.error?.code || 'errore'}: ${r.error?.message || ''}`.slice(0, 200)))
      .filter(Boolean);

    return res.status(200).json({
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
      errors,
    });
  } catch (err) {
    console.error('Errore invio notifiche:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg.slice(0, 300) });
  }
}
