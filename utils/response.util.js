exports.error = (code, message, req) => ({
  code,
  message,
  correlationId: req.correlationId
});