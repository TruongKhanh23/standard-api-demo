# 🚀 Standard API Demo

This project demonstrates a **secure REST API** with:

- ✅ RBAC (Role-Based Access Control)
- ✅ Idempotency handling
- ✅ Correlation ID tracing
- ✅ OpenAPI (Swagger) contract
- ✅ Contract testing with Dredd

---

# 📦 1. Prerequisites

- Node.js >= 16
- npm

---

# ▶️ 2. Run the Application

## Install dependencies

```bash
npm install
````

## Start the API server

```bash
node app.js
```

✅ API will run at:

```
http://localhost:3000
```

***

# 📚 3. Swagger API Documentation

Open in browser:

```
http://localhost:3000/api-docs
```

***

# 🔐 4. Get Access Token

## Client Credentials Flow

```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Authorization: Basic YXBwLXJlYWQ6OEZqMyFrTDkyakRrc0xAMjNrc2whISE=" \
  -d "grant_type=client_credentials"
```

***

# 💰 5. Idempotency Demo Test

You can test idempotent behavior using:

## Run script

```bash
node idempotency-replay-test.js
```

***

## Expected behavior:

| Scenario                                 | Result                   |
| ---------------------------------------- | ------------------------ |
| First request                            | ✅ Processed normally     |
| Duplicate request (same Idempotency-Key) | ✅ Returned cached result |
| Concurrent request                       | ✅ 409 conflict + retry   |

***

# 🧪 6. Run Contract Testing (Dredd)

***

## ✅ Basic run

```bash
dredd swagger.yaml http://localhost:3000
```

***

## ✅ Run with hooks (inject token automatically)

```bash
dredd swagger.yaml http://localhost:3000 --hookfiles=hooks.js
```

***

# 🔑 7. Hooks for Authorization (hooks.js)

Dredd does not send token by default → we inject manually:

```javascript
const hooks = require('hooks');

hooks.beforeEach((transaction) => {
  transaction.request.headers['Authorization'] =
    'Bearer YOUR_ACCESS_TOKEN';
});
```

***

# ✅ 8. Run Specific Endpoint Test

```bash
dredd swagger.yaml http://localhost:3000 \
  --names="POST /policies/{id}/top-up"
```

***

# 🛠️ 9. Debug Tips

## Enable verbose logging

```bash
dredd swagger.yaml http://localhost:3000 --level=debug
```

***

## Verify controller execution

Add log:

```javascript
console.log("➡️ Controller HIT");
```

***

| Situation         | Meaning                         |
| ----------------- | ------------------------------- |
| Log NOT displayed | ❌ request blocked by middleware |
| Log displayed     | ✅ logic reached controller      |

***

# 🧩 10. API Behavior Priority

The API enforces:

```
1. Authentication (401)
2. Authorization (403)
3. Business logic (404, 400, etc.)
```

***

# ✅ Example

| Case             | Result |
| ---------------- | ------ |
| Missing token    | 401    |
| Invalid role     | 403    |
| Policy not found | 404    |

***

# 📌 11. Important Notes

* Correlation ID is generated per request
* Idempotency-Key ensures safe retries
* Dredd validates contract vs implementation
* Swagger is the **single source of truth**

***

# ✅ ✅ Final Goal

All tests should pass:

```bash
complete: 20 passing, 0 failing ✅
```
