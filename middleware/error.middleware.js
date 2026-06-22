module.exports = (err, req, res, next) => {
  console.error(err);

  return res.status(err.status || 500).json({
    code: err.code || "INTERNAL_ERROR",
    message: err.message || "Internal Server Error",
    correlationId: req.headers["X-Correlation-ID"]
  });
};