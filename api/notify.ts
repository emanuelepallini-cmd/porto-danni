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
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokens, title, body } = req.body as {
    tokens: string[];
    title: string;
    body: string;
  };

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'tokens array required' });
  }

  try {
    // Invia a tutti i token (multicast)
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-72.png',
          vibrate: [200, 100, 200],
        },
        fcmOptions: { link: '/' },
      },
    });

    console.log(`Notifiche inviate: ${response.successCount} ok, ${response.failureCount} fallite`);

    // Raccogli token non validi per poterli rimuovere
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
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
