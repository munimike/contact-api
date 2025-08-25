// api/contact.js
const { google } = require('googleapis');

function corsOrigin(req) {
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map(s => s.trim());
  if (allowed.includes('*') || allowed.includes(origin)) return origin || '*';
  // fall back to first allowed so browser can see headers
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

module.exports = async (req, res) => {
  const origin = corsOrigin(req);

  // Preflight
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  if (req.method !== 'POST') return send(res, 405, { error: 'Only POST allowed' }, origin);

  try {
    // ----- ENV CHECKS -------------------------------------------------------
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      console.error('Missing env: GOOGLE_SHEET_ID');
      return send(res, 500, { error: 'Internal error' }, origin);
    }
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    // convert \n escapes to real newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      console.error('Missing env: GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
      return send(res, 500, { error: 'Internal error' }, origin);
    }

    // ----- READ BODY --------------------------------------------------------
    const {
      full_name = '',
      email = '',
      country_code = '',
      phone = '',
      message = '',
      meta = {}
    } = req.body || {};

    // some helpful context
    const userAgent = meta.userAgent || req.headers['user-agent'] || '';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '';
    const page = meta.page || req.headers.referer || '';
    const referrer = meta.referrer || req.headers.referer || '';

    // ----- GOOGLE AUTH ------------------------------------------------------
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // ----- APPEND ROW -------------------------------------------------------
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
      JSON.stringify(meta || {})
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });

    return send(res, 200, { ok: true }, origin);
  } catch (err) {
    console.error('/api/contact error:', err); // check Vercel → Logs to see the stack
    return send(res, 500, { error: 'Internal error' }, origin);
  }
};
