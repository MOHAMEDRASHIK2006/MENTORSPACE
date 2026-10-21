const jwt = require('jsonwebtoken');
const { HttpError, asyncHandler } = require('../lib/errors');

const requireAuth = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please sign in to continue.');

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET || 'local-development-only-change-me');
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  if (!['mentor', 'student'].includes(claims.role) || !claims.sub) {
    throw new HttpError(401, 'The session token is invalid.');
  }

  req.auth = { id: claims.sub, role: claims.role, rollNo: claims.rollNo };
  next();
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      return next(new HttpError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
