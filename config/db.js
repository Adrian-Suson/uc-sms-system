const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'test'
});

connection.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err.stack);
    return;
  }
  console.log('Connected to MySQL as id', connection.threadId);
});

module.exports = connection;