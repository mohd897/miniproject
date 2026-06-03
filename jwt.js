const jwt = require('jsonwebtoken');

/**
 * Generate a short-lived access token (15m)
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    issuer: 'CryptoVault',
    audience: 'cryptovault-client',
  });
};

/**
 * Generate a long-lived refresh token (7d)
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'CryptoVault',
    audience: 'cryptovault-client',
  });
};

/**
 * Verify an access token
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'CryptoVault',
    audience: 'cryptovault-client',
  });
};

/**
 * Verify a refresh token
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    issuer: 'CryptoVault',
    audience: 'cryptovault-client',
  });
};

/**
 * Generate both tokens as a pair
 */
const generateTokenPair = (userId, role) => {
  const payload = { id: userId, role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
};
