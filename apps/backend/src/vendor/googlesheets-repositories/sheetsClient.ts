import { google, type sheets_v4 } from 'googleapis';

export interface SheetsConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
}

/**
 * Reads the three env vars this whole package needs. Kept in one place so a
 * missing var fails loudly and early instead of as a cryptic 401 deep in an
 * API call. Never call this from browser code - a service account key must
 * only ever live server-side.
 */
export function sheetsConfigFromEnv(): SheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    throw new Error(
      'Google Sheets backend selected but GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are not all set in the environment.'
    );
  }
  // Locally, dotenv expands the literal `\n` inside a double-quoted .env value
  // into a real newline. Most hosting dashboards (Render, Railway, etc.) set
  // env vars directly with no such expansion, so a key pasted there in the
  // same `"...\n...\n..."` form arrives with literal backslash-n characters
  // instead of line breaks, which breaks PEM parsing. Normalizing here makes
  // both sources work identically - a no-op when real newlines are already
  // present, a fix when they aren't.
  const normalizedPrivateKey = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
  return { spreadsheetId, serviceAccountEmail, privateKey: normalizedPrivateKey };
}

let cachedClient: { config: SheetsConfig; sheets: sheets_v4.Sheets } | null = null;

export function getSheetsClient(config: SheetsConfig): sheets_v4.Sheets {
  if (cachedClient && cachedClient.config === config) return cachedClient.sheets;
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  cachedClient = { config, sheets };
  return sheets;
}
