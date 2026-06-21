exports.errorHandler = (err, req, res, next) => {
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: err.message,
    correlationId: req.correlationId
  });
};