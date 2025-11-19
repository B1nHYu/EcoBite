import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
<<<<<<< HEAD
  port: process.env.DB_PORT || 3306,
=======
>>>>>>> f7c9a771cebcb0ef4426b2e78c3f7cee0e1f9e4d
  waitForConnections: true,
  connectionLimit: 10
});

export default pool;
