const mysql = require('mysql2');
require('dotenv').config();

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'test'
} = process.env;

const connection = mysql.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD
});

connection.connect((err) => {
  if (err) {
    console.error('MySQL initial connection error:', err.stack);
    process.exit(1);
  }
  connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``, (err) => {
    if (err) {
      console.error('Error creating database:', err.stack);
      process.exit(1);
    }
    console.log(`Database '${DB_NAME}' is ready.`);
    connection.end();
  });
});