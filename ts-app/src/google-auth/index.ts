/**
 * google-auth.ts — Authenticate with Google APIs (Sheets + Calendar).
 *
 * Supports OAuth 2.0 (personal use) or Service Account.
 * For OAuth, run `ts-node src/google-auth.ts` once to generate tokens.json.
 */

import { google, Auth } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';

const TOKEN_PATH = path.join(__dirname, '..', '..', 'tokens.json');
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function loadOAuthCredentials(): Auth.OAuth2Client | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadServiceAccountAuth(): Auth.GoogleAuth | null {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) return null;
  const keyFile = require(path.resolve(SERVICE_ACCOUNT_PATH));
  return new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: SCOPES,
  });
}

export async function authorize(): Promise<{ auth: Auth.GoogleAuth | Auth.OAuth2Client; type: string }> {
  const serviceAuth = loadServiceAccountAuth();
  if (serviceAuth) {
    return { auth: serviceAuth, type: 'service' };
  }

  const oauth2Client = loadOAuthCredentials();
  if (!oauth2Client) {
    throw new Error(
      'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env'
    );
  }

  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(tokens);
    return { auth: oauth2Client, type: 'oauth' };
  }

  await getNewToken(oauth2Client);
  return { auth: oauth2Client, type: 'oauth' };
}

function getNewToken(oauth2Client: Auth.OAuth2Client): Promise<void> {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('Authorize this app by visiting this URL:', authUrl);

    const server = http.createServer(async (req, res) => {
      const qs = url.parse(req.url || '', true).query;
      if (qs.code) {
        res.end('Authentication successful! You can close this tab.');
        server.close();
        try {
          const { tokens } = await oauth2Client.getToken(qs.code as string);
          oauth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
          console.log('Token stored to', TOKEN_PATH);
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });

    server.listen(3000, () => {
      console.log('Listening for OAuth callback on http://localhost:3000/oauth2callback');
    });
  });
}

// If run directly, do an auth check
if (require.main === module) {
  require('dotenv').config();
  authorize()
    .then(() => console.log('Google auth OK'))
    .catch((err) => console.error('Google auth failed:', err.message));
}
