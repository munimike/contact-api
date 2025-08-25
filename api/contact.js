// /api/contact.js
import { google } from 'googleapis';

const ALLOWLIST = new Set([
  'https://mnmkstudio.com',
  'https://www.mnmkstudio.com',
  // add any other domains that should be able to call this API
]);

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWLIST.has(origin) ? origin : '';
  res.setHeader('Vary', 'Origin');
  if (allowOrigin) res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  // If you truly want to allow any origin during testing, use: res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    // Handle preflight quickly
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Only POST allowed' });
    }

    // --- Parse body ---
    const {
      full_name = '',
      email = '',
      phone = '',
      message = '',
      meta = {}
    } = req.body || {};

    // --- Google Sheets auth ---
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const spreadsheetId = process.env.SPREADSHEET_ID; // <-- set in Vercel env

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key?.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth });

    // --- Append row (tab named "Contact") ---
    const values = [[
      new Date().toISOString(),        // Timestamp
      full_name,
      email,
      message,
      meta.page || '',
      meta.referrer || '',
      '',                               // CID (optional; keep blank)
      meta.ip || '',                    // IP if you ever proxy it
      meta.userAgent || '',             // UA
      JSON.stringify(meta || {})        // Extra
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Contact!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('/api/contact error:', err);
    // Ensure CORS headers are still present on errors
    try { setCors(req, res); } catch {}
    return res.status(500).json({ error: 'Internal error' });
  }
}
