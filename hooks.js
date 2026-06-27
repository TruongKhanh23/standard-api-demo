const hooks = require("hooks");
const http = require("http");
const crypto = require("crypto");

const fs = require("fs");
const path = require("path");

// ====== MARKDOWN LOG CONFIG ======
const LOG_DIR = path.join(__dirname, "logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_FILE = path.join(LOG_DIR, `dredd-report-${timestamp}.md`);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

// Buffer để summary cuối file
const transactionResults = [];

function writeMd(content) {
  logStream.write(content + "\n");
}

function escapeMd(str) {
  if (typeof str !== "string") return String(str);
  return str.replace(/\|/g, "\\|");
}

function formatBody(body) {
  if (!body) return "_(empty)_";
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
  } catch {
    return "```\n" + body + "\n```";
  }
}

function formatHeaders(headers) {
  if (!headers || Object.keys(headers).length === 0) return "_(none)_";
  let md = "| Header | Value |\n|---|---|\n";
  for (const [k, v] of Object.entries(headers)) {
    md += `| \`${escapeMd(k)}\` | \`${escapeMd(String(v))}\` |\n`;
  }
  return md;
}

// ====== CONFIG ======
const TOKEN_URL = "http://localhost:3000/oauth/token";
const CLIENT_ID = process.env.OAUTH_CLIENT_ID || "app-write";
const CLIENT_SECRET =
  process.env.OAUTH_CLIENT_SECRET || "c9d8f7a6b5e4123490abc";
const GRANT_TYPE = "client_credentials";
const REFRESH_SKEW_SECONDS = 30;

// Fixture IDs phải khớp với data/policies.dummy.json
const FIXTURES = {
  EXISTING_POLICY_ID: "pol_a1b2c3d4e5f6", // record ACTIVE
  EXISTING_POLICY_ID_2: "pol_b2c3d4e5f6a7", // record INACTIVE
  NOT_FOUND_POLICY_ID: "pol_notexist00000", // chắc chắn không có
  DUPLICATE_POLICY_NUMBER: "P-001", // dùng cho test 409
  IDEMPOTENCY_KEY: "idem-dredd-test-001",
  CORRELATION_ID: "00000000-0000-0000-0000-000000000001",
};

// Field động cần ignore khi so sánh body
const DYNAMIC_FIELDS = ["correlationId", "updatedAt", "createdAt"];

// Header response động cần xóa trước khi compare
const VOLATILE_RESPONSE_HEADERS = [
  "date",
  "x-correlation-id",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "ratelimit-policy",
  "content-length",
  "keep-alive",
  "connection",
];
// ====================

function idempotencyKeyFor(transaction) {
  // Hash từ tên transaction → ổn định nhưng unique mỗi case
  const hash = crypto
    .createHash("md5")
    .update(transaction.name)
    .digest("hex")
    .slice(0, 12);
  return `idem-dredd-${hash}`;
}

// ============================================================
// 1) OAUTH TOKEN MANAGEMENT (giữ nguyên logic của bạn)
// ============================================================
let cachedToken = null;
let tokenExpiresAt = 0;

function fetchToken() {
  return new Promise((resolve, reject) => {
    const url = new URL(TOKEN_URL);
    const payload = JSON.stringify({ grant_type: GRANT_TYPE });
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64",
    );

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Token endpoint ${res.statusCode}: ${body}`));
        }
        try {
          const json = JSON.parse(body);
          if (!json.access_token) {
            return reject(new Error(`No access_token in response: ${body}`));
          }
          const ttlMs =
            ((json.expires_in || 3600) - REFRESH_SKEW_SECONDS) * 1000;
          tokenExpiresAt = Date.now() + ttlMs;
          cachedToken = json.access_token;
          resolve(cachedToken);
        } catch (e) {
          reject(new Error(`Invalid JSON from token endpoint: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getValidToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  hooks.log("🔑 Fetching new OAuth token...");
  const token = await fetchToken();
  hooks.log(
    "✅ Token acquired, expires in ~" +
      Math.round((tokenExpiresAt - Date.now()) / 1000) +
      "s",
  );
  return token;
}

// ============================================================
// 2) RESET STATE — gọi server endpoint /test/reset
// ============================================================
function resetServerState() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: "/test/reset",
        method: "POST",
        headers: { "X-Test-Reset": "dredd" },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ============================================================
// 3) HELPERS
// ============================================================
function stripDynamicFields(bodyStr) {
  if (!bodyStr) return bodyStr;
  try {
    const obj = JSON.parse(bodyStr);
    const clean = (node) => {
      if (Array.isArray(node)) return node.map(clean);
      if (node && typeof node === "object") {
        const out = {};
        for (const k of Object.keys(node)) {
          if (DYNAMIC_FIELDS.includes(k)) continue;
          out[k] = clean(node[k]);
        }
        return out;
      }
      return node;
    };
    return JSON.stringify(clean(obj));
  } catch {
    return bodyStr;
  }
}

function logTransactionResult(transaction, label) {
  const name = transaction.name;
  const status = transaction.real
    ? `actual=${transaction.real.statusCode}, expected=${transaction.expected.statusCode}`
    : "no response";
  hooks.log(`${label} [${name}] ${status}`);
}

// ============================================================
// 4) GLOBAL HOOKS
// ============================================================

// Lấy token + reset state 1 lần trước khi chạy toàn bộ
hooks.beforeAll((transactions, done) => {
  const now = new Date().toISOString();
  writeMd(`# 🧪 Dredd Test Report\n`);
  writeMd(`> **Generated:** ${now}`);
  writeMd(`> **Total transactions:** ${transactions.length}`);
  writeMd(`> **Log file:** \`${LOG_FILE}\`\n`);
  writeMd(`---\n`);
  writeMd(`## 📋 Transactions\n`);

  getValidToken()
    .then(() => resetServerState())
    .then(() => {
      hooks.log("✅ Server state reset");
      done();
    })
    .catch((err) => {
      hooks.log("❌ Setup failed: " + err.message);
      done(err);
    });
});

// Reset trước mỗi test để các transaction độc lập với nhau
// Trong beforeEach hiện tại — sửa thành:
hooks.beforeEach((transaction, done) => {
  const uri = transaction.request.uri;

  // ✅ OAuth endpoints: Basic Auth + JSON body
  if (uri.startsWith("/oauth/token")) {
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64",
    );
    transaction.request.headers["Authorization"] = `Basic ${basicAuth}`;
    transaction.request.headers["Content-Type"] = "application/json";
    return done();
  }

  // ✅ Các endpoint khác: Bearer token (logic cũ)
  Promise.all([getValidToken(), resetServerState()])
    .then(([token]) => {
      transaction.request.headers["Authorization"] = `Bearer ${token}`;
      transaction.request.headers["X-Correlation-Id"] = FIXTURES.CORRELATION_ID;

      if (uri.includes("/top-up")) {
        transaction.request.headers["Idempotency-Key"] =
          idempotencyKeyFor(transaction);
      }

      done();
    })
    .catch((err) => {
      transaction.fail = "Setup failed: " + err.message;
      done();
    });
});

// Skip field động trong response body trước khi Dredd compare
hooks.beforeEachValidation((transaction, done) => {
  // ───── 1) Strip dynamic fields trong body ─────
  if (transaction.real?.body) {
    transaction.real.body = stripDynamicFields(transaction.real.body);
  }
  if (transaction.expected?.body) {
    transaction.expected.body = stripDynamicFields(transaction.expected.body);
  }

  // ───── 2) Normalize headers (chuẩn hóa value, KHÔNG xóa) ─────
  const normalizeContentType = (headers) => {
    if (!headers) return;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-type") {
        headers[key] = String(headers[key]).split(";")[0].trim();
      }
    }
  };

  if (transaction.real?.headers) normalizeContentType(transaction.real.headers);
  if (transaction.expected?.headers) normalizeContentType(transaction.expected.headers);

  // ───── 3) Xóa volatile headers (date, etag, ratelimit, ...) ─────
  for (const h of VOLATILE_RESPONSE_HEADERS) {
    if (transaction.real?.headers) delete transaction.real.headers[h];
    if (transaction.expected?.headers) delete transaction.expected.headers[h];
  }

  done();
});

hooks.afterEach((transaction, done) => {
  // ✅ Dredd 14.x: pass = transaction.test.valid === true
  const passed = transaction.test
    ? transaction.test.valid === true
    : !transaction.fail && !transaction.results?.errors?.length;

  const icon = passed ? "✅" : "❌";
  const status = passed ? "PASS" : "FAIL";

  transactionResults.push({
    name: transaction.name,
    passed,
    expected: transaction.expected?.statusCode,
    actual: transaction.real?.statusCode,
  });

  writeMd(`\n### ${icon} ${escapeMd(transaction.name)}\n`);
  writeMd(
    `**Status:** \`${status}\` — Expected \`${transaction.expected?.statusCode}\`, Actual \`${transaction.real?.statusCode || "N/A"}\`\n`,
  );

  writeMd(`<details>`);
  writeMd(`<summary>Click to expand details</summary>\n`);

  // ... request/expected/actual sections (giữ nguyên) ...

  // ✅ ENHANCED ERROR REPORTING
  if (!passed) {
    writeMd(`#### ⚠️ Errors\n`);

    if (transaction.fail) {
      writeMd(`- **Hook fail:** ${transaction.fail}\n`);
    }

    // Dredd 14.x error structure
    if (transaction.test?.message) {
      writeMd(
        `- **Validation message:**\n\`\`\`\n${transaction.test.message}\n\`\`\`\n`,
      );
    }

    const fields = transaction.test?.results?.fields;
    if (fields) {
      for (const [field, info] of Object.entries(fields)) {
        if (info.valid === false) {
          const errors = (info.errors || [])
            .map((e) => e.message || JSON.stringify(e))
            .join("; ");
          const kind = info.kind || "unknown";
          writeMd(`- **\`${field}\`** [${kind}]: ${errors}\n`);
        }
      }
    }

    // Fallback: dump raw results
    if (!transaction.test?.message && !fields) {
      writeMd(
        `- **Raw results:**\n\`\`\`json\n${JSON.stringify(transaction.test || transaction.results, null, 2)}\n\`\`\`\n`,
      );
    }
  }

  writeMd(`\n</details>\n`);
  writeMd(`---`);

  done();
});

hooks.afterAll((transactions, done) => {
  const pass = transactionResults.filter((t) => t.passed).length;
  const fail = transactionResults.length - pass;
  const total = transactionResults.length;
  const passRate = total > 0 ? ((pass / total) * 100).toFixed(1) : 0;

  writeMd(`\n## 📊 Summary\n`);
  writeMd(`| Metric | Count |`);
  writeMd(`|---|---|`);
  writeMd(`| ✅ Passed | **${pass}** |`);
  writeMd(`| ❌ Failed | **${fail}** |`);
  writeMd(`| 📋 Total  | **${total}** |`);
  writeMd(`| 🎯 Pass Rate | **${passRate}%** |`);
  writeMd(`| ⏰ Finished | ${new Date().toISOString()} |`);

  // Failed transactions table
  const failed = transactionResults.filter((t) => !t.passed);
  if (failed.length > 0) {
    writeMd(`\n## ❌ Failed Transactions\n`);
    writeMd(`| # | Transaction | Expected | Actual |`);
    writeMd(`|---|---|---|---|`);
    failed.forEach((t, i) => {
      writeMd(
        `| ${i + 1} | ${escapeMd(t.name)} | \`${t.expected}\` | \`${t.actual || "N/A"}\` |`,
      );
    });
  }

  // All transactions table
  writeMd(`\n## 📑 All Transactions\n`);
  writeMd(`| # | Status | Transaction | Expected | Actual |`);
  writeMd(`|---|---|---|---|---|`);
  transactionResults.forEach((t, i) => {
    const icon = t.passed ? "✅" : "❌";
    writeMd(
      `| ${i + 1} | ${icon} | ${escapeMd(t.name)} | \`${t.expected}\` | \`${t.actual || "N/A"}\` |`,
    );
  });

  writeMd(`\n---\n_Report generated by Dredd hooks_\n`);

  logStream.end(() => {
    console.log(`\n📝 Markdown report saved to: ${LOG_FILE}`);
    done();
  });
});

// ============================================================
// 5) PER-TRANSACTION OVERRIDES
// ============================================================
// Lưu ý: tên transaction = "<Group> > <Name> > <Action>"
// Dùng `dredd swagger.yaml http://localhost:3000 --names` để liệt kê.

// --- 404: Override path param sang ID không tồn tại ---

const NOT_FOUND_TRANSACTIONS = [
  '/policies/{id} > Get policy by ID > 404',
  '/policies/{id} > Update policy > 404',
  '/policies/{id} > PATCH > 404',
  '/policies/{id} > Delete policy > 404',
  '/policies/{id}/top-up > Top-up policy account balance (Idempotency demo) > 404 > application/json',
];

NOT_FOUND_TRANSACTIONS.forEach((name) => {
  hooks.before(name, (transaction) => {
    transaction.request.uri = transaction.request.uri.replace(
      /pol_[a-zA-Z0-9]+/,
      FIXTURES.NOT_FOUND_POLICY_ID,
    );
    transaction.fullPath = transaction.request.uri;
    hooks.log(`🔧 [404] Override path to ${transaction.request.uri}`);
  });
});

// --- 409: Test duplicate policyNumber ---
hooks.before("Policies > Create policy > 409", (transaction) => {
  const body = JSON.parse(transaction.request.body);
  body.policyNumber = FIXTURES.DUPLICATE_POLICY_NUMBER;
  transaction.request.body = JSON.stringify(body);
  hooks.log(`🔧 [409] Force duplicate policyNumber: ${body.policyNumber}`);
});

// --- 200 cho top-up: dùng EXISTING ID ---
hooks.before("Policies > Top-up > 200", (transaction) => {
  transaction.request.uri = transaction.request.uri.replace(
    /pol_[a-zA-Z0-9]+/,
    FIXTURES.EXISTING_POLICY_ID,
  );
  transaction.fullPath = transaction.request.uri;
});

// PUT 200 — Auto-fetch current version → set If-Match đúng
hooks.before(
  '/policies/{id} > Update policy > 200 > application/json',
  (transaction, done) => {
    const targetId = FIXTURES.EXISTING_POLICY_ID;

    // ✅ Override path → dùng ID có thật
    transaction.request.uri = `/policies/${targetId}`;
    transaction.fullPath = transaction.request.uri;

    // ✅ Body hợp lệ
    transaction.request.body = JSON.stringify({
      policyNumber: 'P-001',
      premiumAmount: 1500000,
      currency: 'VND',
      status: 'ACTIVE',
    });
    transaction.request.headers['Content-Type'] = 'application/json';

    // ✅ Lấy current version từ server bằng GET
    getValidToken()
      .then((token) => {
        const opts = {
          hostname: 'localhost',
          port: 3000,
          path: `/policies/${targetId}`,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        };

        const req = http.request(opts, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              // Lấy version từ ETag header HOẶC từ response body
              let version = res.headers.etag;
              if (!version) {
                const json = JSON.parse(body);
                version = json.version;
              }
              version = String(version || '1').replace(/[W"\/]/g, ''); // strip W/" if any

              transaction.request.headers['If-Match'] = version;
              hooks.log(`🔧 [PUT 200] Fetched version=${version} for ${targetId}`);
              done();
            } catch (e) {
              hooks.log(`⚠️ [PUT 200] Cannot parse GET response: ${e.message}, fallback If-Match=1`);
              transaction.request.headers['If-Match'] = '1';
              done();
            }
          });
        });

        req.on('error', (err) => {
          hooks.log(`⚠️ [PUT 200] GET failed: ${err.message}, fallback If-Match=1`);
          transaction.request.headers['If-Match'] = '1';
          done();
        });
        req.end();
      })
      .catch((err) => {
        hooks.log(`⚠️ [PUT 200] Token error: ${err.message}`);
        transaction.request.headers['If-Match'] = '1';
        done();
      });
  }
);

// Top-up 400 — Invalid request: body không có field "amount"
const TOPUP_400 = '/policies/{id}/top-up > Top-up policy account balance (Idempotency demo) > 400 > application/json';

hooks.before(TOPUP_400, (transaction) => {
  // ✅ Dùng ID có thật để không bị 404
  transaction.request.uri = transaction.request.uri.replace(
    /pol_[a-zA-Z0-9]+/,
    "pol_a1b2c3d4e5f6"    // pol_a1b2c3d4e5f6
  );
  transaction.fullPath = transaction.request.uri;

  // ✅ Body sai → có field khác thay vì "amount"
  transaction.request.body = JSON.stringify({
    money: 500000,
    foo: "bar",
  });

  transaction.request.headers['Content-Type'] = 'application/json';

  hooks.log('🔧 [Top-up 400] Force invalid body (no "amount" field)');
});

// Top-up 401 → token sai
const TOPUP_401 = '/policies/{id}/top-up > Top-up policy account balance (Idempotency demo) > 401 > application/json';
hooks.before(TOPUP_401, (transaction) => {
  transaction.request.uri = transaction.request.uri.replace(/pol_[a-zA-Z0-9]+/, "pol_a1b2c3d4e5f6");
  transaction.fullPath = transaction.request.uri;
  transaction.request.headers['Authorization'] = 'Bearer invalid-token';
});

// Tương tự sửa các hook khác:
hooks.before('/policies/{id}/top-up > Top-up policy account balance (Idempotency demo) > 201 > application/json', (transaction) => {
  transaction.request.uri = transaction.request.uri.replace(
    /pol_[a-zA-Z0-9]+/,
    FIXTURES.EXISTING_POLICY_ID
  );
  transaction.fullPath = transaction.request.uri;
});


// --- Test Idempotency replay: gọi 2 lần với cùng key, expect same result ---
// ✅ Idempotency replay — tách hẳn ra, chạy SAU khi top-up xong + chờ in-flight clear
hooks.after("Policies > Top-up > 200", (transaction, done) => {
  // Chờ in-flight window (retry-after: 2s) trôi qua hẳn
  setTimeout(() => {
    const opts = {
      hostname: "localhost",
      port: 3000,
      path: transaction.request.uri,
      method: "POST",
      headers: {
        ...transaction.request.headers,
        "Content-Length": Buffer.byteLength(transaction.request.body),
      },
    };
    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        hooks.log(`🔁 Idempotency replay: status=${res.statusCode}`);
        if (res.statusCode !== 200) {
          hooks.log(`⚠️  Expected 200 from replay, got ${res.statusCode}`);
        }
        done();
      });
    });
    req.on("error", (e) => {
      hooks.log("⚠️ Replay error: " + e.message);
      done();
    });
    req.write(transaction.request.body);
    req.end();
  }, 2500); // chờ qua retry-after
});

hooks.before(
  '/oauth/token > Generate access token > 400 > application/json',
  (transaction) => {
    // ✅ Override body để trigger 400
    transaction.request.body = JSON.stringify({
      // Không có grant_type → server trả 400 "Missing grant_type"
    });

    // Giữ Basic Auth + Content-Type (do beforeEach đã set)
    transaction.request.headers['Content-Type'] = 'application/json';

    hooks.log('🔧 [OAuth 400] Force missing grant_type');
  }
);

// ============================================================
// OAUTH 401 — Test invalid client credentials
// ============================================================
hooks.before(
  '/oauth/token > Generate access token > 401 > application/json',
  (transaction) => {
    // ✅ Override Basic Auth bằng credentials SAI
    const wrongAuth = Buffer
      .from('wrong-client:wrong-secret')
      .toString('base64');
    transaction.request.headers['Authorization'] = `Basic ${wrongAuth}`;

    // ✅ Body hợp lệ → không trigger 400
    transaction.request.body = JSON.stringify({
      grant_type: 'client_credentials',
    });
    transaction.request.headers['Content-Type'] = 'application/json';

    hooks.log('🔧 [OAuth 401] Force invalid client credentials');
  }
);

// /oauth/authorize 401 → username rỗng
hooks.before('/oauth/authorize > Simulate authorization (get auth code) > 401', (transaction) => {
  transaction.request.uri = '/oauth/authorize?username=';
  transaction.fullPath = transaction.request.uri;
});

// --- Skip những transaction chưa implement ---
const SKIPPED = [
  // 'Policies > Bulk import > 200',
];
SKIPPED.forEach((name) => {
  hooks.before(name, (transaction) => {
    transaction.skip = true;
    hooks.log(`⏭️  Skipped: ${name}`);
  });
});

// Tách riêng logic cho /oauth/token
hooks.beforeValidation(
  "/oauth/token > Generate access token > 200 > application/json",
  (transaction) => {
    try {
      const actual = JSON.parse(transaction.real.body);

      // Validate JWT format
      const jwtPattern = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
      if (!actual.access_token || !jwtPattern.test(actual.access_token)) {
        transaction.fail = "access_token không phải JWT hợp lệ";
        return;
      }

      // ✅ Thay actual.access_token bằng giá trị từ example để string-compare PASS
      const expected = JSON.parse(transaction.expected.body);
      actual.access_token = expected.access_token;
      transaction.real.body = JSON.stringify(actual);

      hooks.log("✅ OAuth token normalized for comparison");
    } catch (e) {
      hooks.log("⚠️ Cannot normalize oauth body: " + e.message);
    }
  },
);
