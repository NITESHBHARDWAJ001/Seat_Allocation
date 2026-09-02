import 'dotenv/config';
import { google } from 'googleapis';

const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const tabs = process.argv.slice(2);
if (tabs.length === 0) {
  console.error('Usage: node scripts/clear-sheet.mjs <TabName> [TabName2 ...]');
  console.error('       node scripts/clear-sheet.mjs --data-only <TabName>   (keeps header row)');
  process.exit(1);
}

const dataOnly = tabs[0] === '--data-only';
const targets = dataOnly ? tabs.slice(1) : tabs;

for (const tab of targets) {
  const range = dataOnly ? `${tab}!A2:Z1000` : `${tab}!A1:Z1000`;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
  console.log(`cleared ${range}`);
}
