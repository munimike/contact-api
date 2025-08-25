// api/contact.js (ESM)
import { google } from 'googleapis';

function corsOrigin(req) {
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map(s => s.trim());
  if (allowed.includes('*') || allowed.includes(origin)) return origin || '*';
  return allowed[0] || '*';
}

function send(res, status, body, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(status).json(body);
}

export default async function handler(req, res) {
  const origin = corsOrigin(req);

  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  if (req.method !== 'POST') return send(res, 405, { error: 'Only POST allowed' }, origin);

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail   = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey      = process.env.GOOGLE_PRIVATE_KEY || '';

    if (!spreadsheetId || !clientEmail || !privateKey) {
      console.error('Missing env var(s):',
        { hasSheetId: !!spreadsheetId, hasEmail: !!clientEmail, hasKey: !!privateKey });
      return send(res, 500, { error: 'Internal error' }, origin);
    }

    // fix \n in env
    privateKey = privateKey.replace(/\\n/g, '\n');

    const {
      full_name = '', email = '', country_code = '', phone = '', message = '',
      meta = {}
    } = req.body || {};

    const userAgent = meta.userAgent || req.headers['user-agent'] || '';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '';
    const page = meta.page || req.headers.referer || '';
    const referrer = meta.referrer || req.headers.referer || '';

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const tab = process.env.GOOGLE_SHEET_TAB || 'Contact';
    const row = [
      new Date().toISOString(), // Timestamp
      full_name,
      email,
      message,
      page,
      referrer,
      `${country_code} ${phone}`.trim(),
      ip,
      userAgent,
      JSON.stringify(meta || {}),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return send(res, 200, { ok: true }, origin);
  } catch (err) {
    console.error('/api/contact error:', err);
    return send(res, 500, { error: 'Internal error' }, origin);
  }
  
}

