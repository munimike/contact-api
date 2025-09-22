import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const ALLOWED_ORIGINS = [
  'https://www.mnmkstudio.com',
  'https://mnmkstudio.com',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
];

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const {
      full_name = '',
      email = '',
      message = '',
      phone = '',
      country_code = '',
      meta = {},
      // simple honeypot to deter bots:
      website // should be empty; bots often fill it
    } = req.body || {};

    // spam honeypot: if filled, pretend success but do nothing
    if (website && String(website).trim() !== '') {
      return res.status(200).json({ status: 'ok' });
    }

    if (!full_name || !email || !message) {
      return res.status(400).json({ error: 'full_name, email, and message are required' });
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

    // Combine country code and phone
    const fullPhone = country_code ? `${country_code} ${phone}` : phone;
    
    // Extract page URL from meta object
    const page = meta?.page || '';

    // Try to save to Google Sheets, but don't fail if it doesn't work
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[
            new Date().toISOString(),
            full_name,
            email,
            fullPhone,
            message,
            page,
            meta?.referrer || '',
            meta?.cid || '',
            req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
            meta?.userAgent || req.headers['user-agent'] || '',
            typeof meta === 'object' ? JSON.stringify(meta) : (meta || '')
          ]]
        }
      });
      console.log('✅ Contact form saved to Google Sheets');
    } catch (sheetsError) {
      console.error('⚠️ Google Sheets error (non-critical):', sheetsError.message);
      // Don't fail the request if Google Sheets fails
    }

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('❌ /api/contact error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}