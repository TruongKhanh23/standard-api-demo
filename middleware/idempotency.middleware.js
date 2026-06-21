const store = new Map();

exports.idempotency = (req, res, next) => {
  const key = req.headers["idempotency-key"];

  if (!key) {
    return next();
  }

  console.log("🔑 Idempotency-Key:", key);

  if (store.has(key)) {
    console.log("🔁 Duplicate request detected");

    const saved = store.get(key);
    return res.status(saved.status).json(saved.body);
  }

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    store.set(key, {
      status: res.statusCode,
      body
    });

    originalJson(body);
  };

  next();
};