const hooks = require('hooks');
const http = require('http');

// ====== CONFIG ======
const TOKEN_URL = 'http://localhost:3000/oauth/token';
const CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'app-write';
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'c9d8f7a6b5e4123490abc';
const GRANT_TYPE = 'client_credentials';
// Refresh sớm hơn N giây so với expires_in để tránh race-condition
const REFRESH_SKEW_SECONDS = 30;
// ====================

let cachedToken = null;
let tokenExpiresAt = 0; // epoch ms

/**
 * Gọi OAuth server lấy access_token bằng client_credentials.
 * Trả về Promise<string> chứa access_token.
 */
function fetchToken() {
  return new Promise((resolve, reject) => {
    const url = new URL(TOKEN_URL);
    const payload = JSON.stringify({ grant_type: GRANT_TYPE });
    const basicAuth = Buffer
      .from(`${CLIENT_ID}:${CLIENT_SECRET}`)
      .toString('base64');

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            new Error(`Token endpoint ${res.statusCode}: ${body}`)
          );
        }
        try {
          const json = JSON.parse(body);
          if (!json.access_token) {
            return reject(new Error(`No access_token in response: ${body}`));
          }
          // expires_in (giây) → tính thời điểm hết hạn
          const ttlMs = ((json.expires_in || 3600) - REFRESH_SKEW_SECONDS) * 1000;
          tokenExpiresAt = Date.now() + ttlMs;
          cachedToken = json.access_token;
          resolve(cachedToken);
        } catch (e) {
          reject(new Error(`Invalid JSON from token endpoint: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Lấy token từ cache, refresh nếu sắp/đã hết hạn.
 */
async function getValidToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  hooks.log('🔑 Fetching new OAuth token...');
  const token = await fetchToken();
  hooks.log('✅ Token acquired, expires in ~' +
    Math.round((tokenExpiresAt - Date.now()) / 1000) + 's');
  return token;
}

// Lấy token 1 lần trước khi chạy toàn bộ test
hooks.beforeAll((transactions, done) => {
  getValidToken()
    .then(() => done())
    .catch((err) => {
      hooks.log('❌ Failed to fetch token: ' + err.message);
      done(err);
    });
});

// Gắn token vào mỗi request (auto refresh nếu hết hạn giữa chừng)
hooks.beforeEach((transaction, done) => {
  getValidToken()
    .then((token) => {
      transaction.request.headers['Authorization'] = `Bearer ${token}`;
      done();
    })
    .catch((err) => {
      transaction.fail = 'Cannot obtain OAuth token: ' + err.message;
      done();
    });
});