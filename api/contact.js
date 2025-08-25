// api/contact.js (ESM)
import { google } from 'googleapis';

export default async function handler(req, res) {
  // CORS (lock to your domain if you want)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ---- health check via GET ----
  if (req.method === 'GET' && req.query.health === '1') {
    const hasSheetId = !!process.env.GOOGLE_SHEET_ID;
    const hasEmail   = !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasKey     = !!process.env.GOOGLE_PRIVATE_KEY;
    return res.status(200).json({ ok: true, hasSheetId, hasEmail, hasKey });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // ---- normal contact handling ----
  const { full_name, email, phone, message, meta } = req.body || {};

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Contact!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        new Date().toISOString(),
        full_name || '',
        email || '',
        message || '',
        meta?.page || '',
        meta?.referrer || '',
        '',                // CID if you add it later
        meta?.ip || '',
        meta?.userAgent || '',
        JSON.stringify(meta || {})
      ]]
    }
  });

  return res.status(200).json({ ok: true });
}
