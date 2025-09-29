import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import pool from "./db.js";                  // 默认导出
import { signToken, authRequired } from "./auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("src/public"));

app.get("/", (_req, res) => res.send("EcoBite API is running..."));

/* ---------- Auth: Register / Login ---------- */
app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });
  try {
    const [exists] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (exists.length) return res.status(409).json({ error: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query("INSERT INTO users(email, password_hash) VALUES(?,?)", [email, hash]);
    const user = { id: r.insertId, email };
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = signToken({ id: u.id, email: u.email });
    res.json({ token, user: { id: u.id, email: u.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Validation helper ---------- */
function validateItem({ name, quantity, category, expiry_date }) {
  if (!name || !name.trim()) return "Name is required";
  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) return "Quantity must be a positive integer";
  const allowed = ["Refrigerated", "Pantry", "Frozen"];
  if (!allowed.includes(category)) return "Category is required";
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiry_date);
  if (isNaN(exp.getTime()) || exp < today) return "Expiry must be today or later";
  return null;
}

/* ---------- Runtime status helper ---------- */
// 根据过期日计算状态：过期=expired；<=3天=near_expiry；否则=available（已捐赠保持 donated）
function computeStatus(expiry_date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiry_date);
  if (exp < today) return "expired";
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 3 ? "near_expiry" : "available";
}

/* ---------- Inventory APIs (protected) ---------- */
app.get("/inventory", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE user_id = ? OR user_id IS NULL ORDER BY expiry_date ASC",
      [req.user.id]
    );
    // 运行时计算 near_expiry / expired（数据库里的 status 仅用于 donated）
    const data = rows.map(r => ({
      ...r,
      status: r.status === "donated" ? "donated" : computeStatus(r.expiry_date)
    }));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/inventory", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, quantity, category, expiry_date } = req.body;
  try {
    const [r] = await pool.query(
      "INSERT INTO food_items (name, quantity, category, expiry_date, user_id) VALUES (?,?,?,?,?)",
      [name.trim(), Number(quantity), category, expiry_date, req.user.id]
    );
    res.status(201).json({
      id: r.insertId, name, quantity: Number(quantity), category, expiry_date,
      status: "available", user_id: req.user.id
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/inventory/:id", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, quantity, category, expiry_date } = req.body;
  try {
    await pool.query(
      "UPDATE food_items SET name=?, quantity=?, category=?, expiry_date=? WHERE id=? AND (user_id=? OR user_id IS NULL)",
      [name.trim(), Number(quantity), category, expiry_date, req.params.id, req.user.id]
    );
    const [rows] = await pool.query("SELECT * FROM food_items WHERE id=?", [req.params.id]);
    const item = rows[0];
    if (!item) return res.json({});
    // 返回时也带上运行时状态
    const status = item.status === "donated" ? "donated" : computeStatus(item.expiry_date);
    res.json({ ...item, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inventory/:id", authRequired, async (req, res) => {
  try {
    await pool.query("DELETE FROM food_items WHERE id=? AND (user_id=? OR user_id IS NULL)", [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Donate ---------- */
app.post("/inventory/:id/donate", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE id=? AND (user_id=? OR user_id IS NULL)",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    const item = rows[0];
    if (item.status === "donated") return res.status(400).json({ error: "Already donated" });

    await pool.query("UPDATE food_items SET status='donated' WHERE id=?", [req.params.id]);
    const [after] = await pool.query("SELECT * FROM food_items WHERE id=?", [req.params.id]);
    res.json(after[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Report ---------- */
app.get("/report", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE user_id = ? OR user_id IS NULL",
      [req.user.id]
    );
    const report = { Pantry: 0, Refrigerated: 0, Frozen: 0, Donated: 0, Expired: 0, NearExpiry: 0, Available: 0 };
    for (const r of rows) {
      if (report[r.category] !== undefined) report[r.category]++;
      if (r.status === "donated") report.Donated++;
      else {
        const s = computeStatus(r.expiry_date);
        if (s === "expired") report.Expired++;
        else if (s === "near_expiry") report.NearExpiry++;
        else report.Available++;
      }
    }
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
