const mysql = require('mysql2');
require('dotenv').config();

// Prefer MYSQL_* or MYSQL_URL (Railway) and fall back to DB_* for local
function firstEnv(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
}

const urlString = firstEnv('MYSQL_URL', 'DATABASE_URL');
let host, user, password, dbName, port;
if (urlString) {
  try {
    const p = new URL(urlString);
    host = p.hostname;
    port = p.port || undefined;
    user = decodeURIComponent(p.username || '');
    password = decodeURIComponent(p.password || '');
    dbName = p.pathname ? p.pathname.replace(/^\//, '') : undefined;
  } catch (e) {
    console.warn('Could not parse MYSQL_URL for initDb:', e && e.message);
  }
}

host = host || firstEnv('MYSQL_HOST', 'DB_HOST') || 'localhost';
user = user || firstEnv('MYSQL_USER', 'DB_USER') || 'root';
password = password || firstEnv('MYSQL_PASSWORD', 'DB_PASSWORD', 'DB_PASS') || '';
dbName = dbName || firstEnv('MYSQL_DATABASE', 'DB_NAME') || 'test';
port = port || firstEnv('MYSQL_PORT', 'DB_PORT');
port = port ? parseInt(port, 10) : undefined;

const connection = mysql.createConnection({ host, user, password, port });

connection.connect((err) => {
  if (err) {
    console.error('MySQL initial connection error:', err.stack);
    process.exit(1);
  }
  connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``, (err) => {
    if (err) {
      console.error('Error creating database:', err.stack);
      process.exit(1);
    }
    console.log(`Database '${dbName}' is ready.`);
    connection.end();
  });
});