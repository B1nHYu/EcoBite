// src/auth.js  (ESM)
// Dependency：npm i jsonwebtoken
import jwt from "jsonwebtoken";

// —— Gadget: Safely Read SECRET (Detect Configuration Issues in Advance)——
function requireSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Expose errors explicitly at startup or the first use to avoid 'always 401'.
    throw new Error("[auth] Missing JWT_SECRET in environment.");
  }
  return secret;
}

/**
 * Generate JWT
 * @param {{id:number|string, email:string}} user
 * @param {{expiresIn?: string|number}} opts
 * @returns {string} token
 */
export function signToken(user, opts = {}) {
  const secret = requireSecret();
  const expiresIn = opts.expiresIn ?? "2h"; 
  const payload = { id: user.id, email: user.email };
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify JWT (utility function, not middleware)
 * @param {string} token
 * @returns {{id:string|number, email:string, iat:number, exp:number}}
 * @throws Verification failure will throw an error
 */
export function verifyToken(token) {
  const secret = requireSecret();
  return jwt.verify(token, secret);
}

/**
 * Middleware that requires mandatory login
 * - Read from Authorization: Bearer <token>
 * - After verification, place the payload into req.user ({id, email})
 * - Failure returns 401 JSON
 */
export function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = verifyToken(token);
    req.user = payload; // { id, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional login (parse if available, ignore if not)
 * - Suitable for interfaces that support both anonymous and logged-in users
 * - Verification successful: set req.user; if it fails, ignore it and do not block.
 */
export function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return next();
  try {
    req.user = verifyToken(token);
  } catch {
    // Ignore errors, does not affect anonymous access
  }
  next();
}
