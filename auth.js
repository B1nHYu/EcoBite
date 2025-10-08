// src/auth.js  (ESM)
// 依赖：npm i jsonwebtoken
import jwt from "jsonwebtoken";

// —— 小工具：安全读取 SECRET（提前发现配置问题）——
function requireSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // 让错误在启动或首次用到时就显性暴露，避免“总是 401”
    throw new Error("[auth] Missing JWT_SECRET in environment.");
  }
  return secret;
}

/**
 * 生成 JWT
 * @param {{id:number|string, email:string}} user
 * @param {{expiresIn?: string|number}} opts
 * @returns {string} token
 */
export function signToken(user, opts = {}) {
  const secret = requireSecret();
  const expiresIn = opts.expiresIn ?? "2h"; // 你原本就是 2h
  const payload = { id: user.id, email: user.email };
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * 验证 JWT（工具函数，非中间件）
 * @param {string} token
 * @returns {{id:string|number, email:string, iat:number, exp:number}}
 * @throws 验证失败会抛错
 */
export function verifyToken(token) {
  const secret = requireSecret();
  return jwt.verify(token, secret);
}

/**
 * 强制需要登录的中间件
 * - 从 Authorization: Bearer <token> 读取
 * - 验证通过把 payload 放到 req.user（{id,email}）
 * - 失败返回 401 JSON
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
 * 可选登录（有则解析、无则忽略）
 * - 适合“既支持匿名也支持已登录”的接口
 * - 验证成功设置 req.user，失败则忽略，不拦截
 */
export function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return next();
  try {
    req.user = verifyToken(token);
  } catch {
    // 忽略错误，不影响匿名访问
  }
  next();
}
