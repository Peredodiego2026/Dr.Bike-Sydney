// api/eta.js — real driving time from the mechanic to a client address.
// Used by the mechanic app to put a true number in the "on the way" push,
// matching the one send-message.js puts in the SMS and WhatsApp.

import { guard, verifyInternalAuth } from './_security.js';
import { drivingEtaMinutes } from './_eta.js';

export default async function handler(req, res) {
  if (await guard(req, res, { rateMax: 20, rateWindow: 60000 })) return;
  if (verifyInternalAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mechLat, mechLng, destAddress } = req.body || {};
  const minutes = await drivingEtaMinutes({
    fromLat: mechLat,
    fromLng: mechLng,
    address: destAddress,
  });
  // 200 with minutes:null is the normal "couldn't work it out" answer - the
  // caller drops the ETA line rather than treating it as an error.
  return res.status(200).json({ minutes });
}
