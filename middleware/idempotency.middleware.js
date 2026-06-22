const store = new Map();
const PROCESSING_TIMEOUT = 5000;

exports.idempotency = (req, res, next) => {
  const key = req.headers["idempotency-key"];
  if (!key || key.trim() === "") return next();

  console.log("🔑 Idempotency-Key:", key);

  let existing = store.get(key);

  // Fix: cleanup stuck PROCESSING
  if (
    existing &&
    existing.status === "PROCESSING" &&
    Date.now() - existing.createdAt > PROCESSING_TIMEOUT
  ) {
    console.log("⚠️ Stale PROCESSING detected → reset");
    store.delete(key);
    existing = null;
  }

  // Case 1: processing
  if (existing && existing.status === "PROCESSING") {
    console.log("⏳ Request is still processing");

    res.set("Retry-After", "2");

    return res.status(409).json({
      error: "Request is still processing",
      retryAfter: 2,
    });
  }

  // Case 2: success
  if (existing && existing.status === "SUCCESS") {
    console.log("🔁 Duplicate request detected");

    res.set("Idempotent-Replay", "true");

    return res
      .status(existing.response.status)
      .json(existing.response.body);
  }

  // Mark processing
  store.set(key, {
    status: "PROCESSING",
    createdAt: Date.now(),
  });

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("Mark SUCCESS for key:", key);

      store.set(key, {
        status: "SUCCESS",
        response: {
          status: res.statusCode,
          body,
        },
        updatedAt: Date.now(),
      });
    }

    return originalJson(body);
  };

  next();
};