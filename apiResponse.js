/**
 * Centralized API response helpers — consistent JSON shape across all routes
 * { success, message, data, error, meta }
 */

const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(Object.keys(meta).length > 0 && { meta }),
  });
};

const sendError = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const sendCreated = (res, data, message = 'Created successfully') =>
  sendSuccess(res, data, message, 201);

const sendUnauthorized = (res, message = 'Unauthorized') => sendError(res, message, 401);

const sendForbidden = (res, message = 'Forbidden') => sendError(res, message, 403);

const sendNotFound = (res, message = 'Resource not found') => sendError(res, message, 404);

const sendBadRequest = (res, message = 'Bad request', errors = null) =>
  sendError(res, message, 400, errors);

const sendTooManyRequests = (res, message = 'Too many requests') => sendError(res, message, 429);

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendBadRequest,
  sendTooManyRequests,
};
