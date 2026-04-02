const mysql = require('mysql2');
require('dotenv').config();

// Helper to read multiple env var names (Railway uses MYSQL_*, project used DB_*)
function firstEnv(...names) {
  for (const n of names) {
    if (process.env[n]) return process.env[n];
  }
  return undefined;
}

// Prefer platform-provided URL (e.g. MYSQL_URL or DATABASE_URL) first
const urlString = firstEnv('MYSQL_URL', 'DATABASE_URL', 'MYSQL_PUBLIC_URL', 'MYSQLURL');
let host;
let user;
let password;
let database;
let port;

if (urlString) {
  try {
    const parsed = new URL(urlString);
    host = parsed.hostname;
    port = parsed.port || undefined;
    user = decodeURIComponent(parsed.username || '');
    password = decodeURIComponent(parsed.password || '');
    database = parsed.pathname ? parsed.pathname.replace(/^\//, '') : undefined;
  } catch (e) {
    console.warn('Could not parse MYSQL_URL / DATABASE_URL:', e && e.message);
  }
}

// Fill missing values from MYSQL_* then DB_* env vars (prefer MYSQL over DB)
host = host || firstEnv('MYSQL_HOST', 'MYSQLHOST', 'DB_HOST');
user = user || firstEnv('MYSQL_USER', 'MYSQLUSER', 'DB_USER');
password = password || firstEnv('MYSQL_PASSWORD', 'MYSQLPASSWORD', 'DB_PASSWORD', 'DB_PASS');
database = database || firstEnv('MYSQL_DATABASE', 'MYSQLDATABASE', 'DB_NAME');
port = port || firstEnv('MYSQL_PORT', 'MYSQLPORT', 'DB_PORT');

host = host || 'localhost';
user = user || 'root';
password = password || '';
database = database || 'test';
port = port ? parseInt(port, 10) : 3306;

const connection = mysql.createConnection({
  host,
  user,
  password,
  database,
  port
});

connection.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err.stack);
    return;
  }
  console.log('Connected to MySQL as id', connection.threadId);
});

module.exports = connection;