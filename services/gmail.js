const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// state = appEmail:nonce -> hangi uygulama hesabına bağlandığını eşlemek için.
// Google, kullanıcının HANGİ Google hesabıyla giriş yapacağını kendi ekranında sorar —
// bu sayede aynı kişi ard arda farklı Google hesaplarını bağlayabilir.
function getAuthUrl(appEmail) {
  const client = newOAuthClient();
  const nonce = Math.random().toString(36).slice(2, 10);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: SCOPES,
    state: `${appEmail}::${nonce}`
  });
}

async function exchangeCodeForTokens(code) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// account = { refreshToken } — kullanıcının bağladığı hesaplardan biri.
function gmailClientForAccount(account) {
  const client = newOAuthClient();
  client.setCredentials({ refresh_token: account.refreshToken });
  return google.gmail({ version: 'v1', auth: client });
}

// Yeni bağlanan hesabın gerçek e-posta adresini öğrenir (ekstra scope gerekmez,
// gmail.readonly zaten bu endpoint'e izin verir).
async function getProfileEmail(account) {
  const gmail = gmailClientForAccount(account);
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.emailAddress;
}

async function listMessageIds(account, query, maxResults = 100) {
  const gmail = gmailClientForAccount(account);
  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  return res.data.messages || [];
}

function decodeBody(payload) {
  let text = '';
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body && part.body.data && !text) {
      const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      text += html.replace(/<[^>]+>/g, ' ');
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return text;
}

async function getMessage(account, id) {
  const gmail = gmailClientForAccount(account);
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  const headers = res.data.payload.headers || [];
  const get = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
  return {
    id,
    from: get('From'),
    subject: get('Subject'),
    date: new Date(Number(res.data.internalDate)),
    body: decodeBody(res.data.payload)
  };
}

async function revoke(account) {
  const client = newOAuthClient();
  client.setCredentials({ refresh_token: account.refreshToken });
  try { await client.revokeToken(account.refreshToken); } catch (e) { /* zaten geçersizse yok say */ }
}

module.exports = { getAuthUrl, exchangeCodeForTokens, getProfileEmail, listMessageIds, getMessage, revoke };
