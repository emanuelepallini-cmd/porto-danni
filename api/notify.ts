// Vercel Serverless Function per inviare notifiche push
// File: api/notify.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

// Inizializza Firebase Admin (una sola volta)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // La chiave privata su Vercel ha \n come stringa letterale — va convertita
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokens, title, body, url, delay } = req.body as {
    tokens: string[];
    title: string;
    body: string;
    url?: string;
    delay?: number; // secondi di attesa (solo per la notifica di prova, max 8)
  };

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'tokens array required' });
  }

  const wait = Math.min(Math.max(Number(delay) || 0, 0), 8);
  if (wait) await new Promise((r) => setTimeout(r, wait * 1000));

  try {
    // Messaggio "data-only": il banner lo costruisce il service worker,
    // così non ci sono doppioni e funziona uguale su iPhone, Android e PC.
    const response = await admin.messaging().sendEachForMulticast({
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
    });

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

    return res.status(200).json({
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    });
  } catch (err) {
    console.error('Errore invio notifiche:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
}
