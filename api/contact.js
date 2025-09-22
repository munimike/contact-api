// Using Google Apps Script instead of Google Sheets API - Updated v5

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

    // Log the contact form submission
    console.log('📧 Contact form submission:', {
      full_name,
      email,
      phone: country_code ? `${country_code} ${phone}` : phone,
      message,
      page: meta?.page || '',
      referrer: meta?.referrer || '',
      userAgent: meta?.userAgent || req.headers['user-agent'] || '',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      timestamp: new Date().toISOString()
    });

    // Try to save to Google Sheets via Google Apps Script
    if (process.env.GOOGLE_APPS_SCRIPT_URL) {
      console.log('🔗 Attempting to send data to Google Apps Script:', process.env.GOOGLE_APPS_SCRIPT_URL);
      try {
        const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            full_name: full_name,
            email: email,
            phone: country_code ? `${country_code} ${phone}` : phone,
            message: message
          })
        });

        console.log('📡 Google Apps Script response status:', response.status);
        const result = await response.json();
        console.log('📄 Google Apps Script response:', result);
        
        if (result.ok) {
          console.log('✅ Contact form saved to Google Sheets via Apps Script');
        } else {
          console.error('⚠️ Google Apps Script error:', result.error);
        }
      } catch (appsScriptError) {
        console.error('⚠️ Google Apps Script error (non-critical):', appsScriptError.message);
        console.error('🔍 Full error details:', appsScriptError);
        // Don't fail the request if Google Apps Script fails
      }
    } else {
      console.log('⚠️ Google Apps Script URL not configured - data logged only');
      console.log('🔍 Available environment variables:', Object.keys(process.env).filter(key => key.includes('GOOGLE')));
    }

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('❌ /api/contact error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}