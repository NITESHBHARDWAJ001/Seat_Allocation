#!/usr/bin/env node
/**
 * Throwaway investigation script: authenticates with the Google service
 * account from .env and prints the target spreadsheet's tabs + first few
 * rows of each, so we know the real column layout before writing a
 * repository implementation against it.
 */
import 'dotenv/config';
import { google } from 'googleapis';

const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!spreadsheetId || !email || !privateKey) {
  console.error('Missing GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env');
  process.exit(1);
}

const auth = new google.auth.JWT({
  email,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

try {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  console.log(`Spreadsheet title: ${meta.data.properties?.title}`);
  console.log(`Tabs (${meta.data.sheets?.length ?? 0}):`);
  for (const s of meta.data.sheets ?? []) {
    const props = s.properties;
    console.log(`  - "${props?.title}" (gid=${props?.sheetId}, ${props?.gridProperties?.rowCount}x${props?.gridProperties?.columnCount})`);
  }

  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (!title) continue;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${title}!A1:Z6`,
    });
    console.log(`\n--- "${title}" first rows ---`);
    console.log(JSON.stringify(res.data.values ?? [], null, 2));
  }
} catch (err) {
  console.error('Failed to read spreadsheet:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
}
