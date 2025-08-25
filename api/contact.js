import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

// Node.js (Vercel serverless) — Google Sheets via service account (JWT)
const { google } = require('googleapis');

function send(res, status, body, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(body);
}

module.exports = async (req, res) => {
  const ORIGIN = process.env.ALLOWED_ORIGIN || '*';

  // CORS preflight
  if (req.method === 'OPTIONS') return send(res, 204, {}, ORIGIN);
  if (req.method !== 'POST') return send(res, 405, { error: 'Only POST allowed' }, ORIGIN);

  try {
    const body = req.body || {};
    if (body.test === true) {
      return send(res, 200, { status: 'ok', note: 'test mode' }, ORIGIN);
    }

    // --- ENV VARS you must set in Vercel ---
    const spreadsheetId   = process.env.GOOGLE_SHEET_ID;        // the Contact sheet id
    const sheetTab        = process.env.GOOGLE_SHEET_TAB || 'Contact';
    const clientEmail     = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; // …@…gserviceaccount.com
    const rawPrivateKey   = process.env.GOOGLE_PRIVATE_KEY || '';

    if (!spreadsheetId || !clientEmail || !rawPrivateKey) {
      throw new Error('Missing env: GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY');
    }

    // IMPORTANT: turn \n into real newlines if the key was pasted as one line
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

    const jwt = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: jwt });

    // Build the row
    const full_name    = (body.full_name || '').trim();
    const email        = (body.email || '').trim();
    const country_code = (body.country_code || '').trim();
    const phone        = (body.phone || '').trim();
    const message      = (body.message || '').trim();
    const meta         = body.meta || {};

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
               req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    const values = [[
      new Date().toISOString(),   // Timestamp
      full_name,
      email,
      message,
      meta.page || '',
      meta.referrer || '',
      '',                         // CID (optional)
      ip,                         // IP
      ua,                         // UA
      JSON.stringify({ country_code, phone, meta }) // Extra
    ]];

    // Append
    const range = `${sheetTab}!A:K`; // assumes your headers are in row 1
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });

    return send(res, 200, {
      status: 'ok',
      updates: result.data?.updates,
    }, ORIGIN);

  } catch (err) {
    console.error('/api/contact error:', err);
    return send(res, 500, {
      error: 'Internal error',
      detail: String(err.message || err),
      hint: [
        '• Share the Google Sheet with your service account email (Editor).',
        '• GOOGLE_PRIVATE_KEY must keep real newlines or use \\n and replace in code.',
        '• GOOGLE_SHEET_ID must be the ID between /d/ and /edit in the sheet URL.',
        '• GOOGLE_SHEET_TAB must match the tab name (or change range to the first sheet).',
      ].join('\n')
    }, process.env.ALLOWED_ORIGIN || '*');
  }
};
