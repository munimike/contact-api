import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const ALLOWED_ORIGINS = ['https://www.mnmkstudio.com']; // add your live site(s)

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const {
      name = '',
      email = '',
      message = '',
      phone = '',
      referrer = '',
      cid = '',
      ip = '',
      ua = '',
      extra = '',
      // simple honeypot to deter bots:
      website // should be empty; bots often fill it
    } = req.body || {};

    // spam honeypot: if filled, pretend success but do nothing
    if (website && String(website).trim() !== '') {
      return res.status(200).json({ status: 'ok' });
    }

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, phone, email, and message are required' });
    }

    // Google auth
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.CONTACT_SPREADSHEET_ID || process.env.SPREADSHEET_ID;
    const range = 'Contact!A1'; // tab name must match your sheet

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          new Date().toISOString(),
          name,
          email,
          message,
          page,
          referrer,
          cid,
          ip,
          ua,
          typeof extra === 'object' ? JSON.stringify(extra) : (extra || '')
        ]]
      }
    });

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('❌ /api/contact error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
