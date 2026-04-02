const mysql = require('mysql2');
require('dotenv').config();
const bcrypt = require('bcrypt');

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'test'
} = process.env;

const connection = mysql.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME
});

const tableQueries = [
  `CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'teacher', 'staff') DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    session_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    revoked TINYINT(1) DEFAULT 0,
    revoked_at TIMESTAMP NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    course VARCHAR(100),
    year_level VARCHAR(50),
    section VARCHAR(50),
    birthdate DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS parents (
    parent_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    relationship VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS student_parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    parent_id INT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS message_templates (
    template_id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    template_text TEXT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NULL,
    parent_id INT NULL,
    template_id INT NULL,
    message_text TEXT NOT NULL,
    status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES message_templates(template_id) ON DELETE SET NULL
  )`,
  // Inbox table for received SMS from device
  `CREATE TABLE IF NOT EXISTS sms_inbox (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender VARCHAR(30) NOT NULL,
    message_text TEXT NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    device VARCHAR(64) NULL,
    raw_header TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sender (sender),
    INDEX idx_received_at (received_at)
  )`
];

connection.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err.stack);
    process.exit(1);
  }
  console.log('Connected to MySQL for table creation.');

  (async () => {
    // Create tables
    for (const query of tableQueries) {
      try {
        await new Promise((resolve, reject) => {
          connection.query(query, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log('Table created or already exists.');
      } catch (err) {
        console.error('Error creating table:', err.sqlMessage || err.message);
        connection.end();
        process.exit(1);
      }
    }
    console.log('All tables are ready.');

    // Ensure soft-delete columns exist on students and parents
    const addSoftDeleteColumns = async (table) => {
      const q = `ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`;
      try {
        await new Promise((resolve, reject) => connection.query(q, (err) => err ? reject(err) : resolve()));
        console.log(`Soft-delete columns ensured for ${table}.`);
      } catch (err) {
        // If IF NOT EXISTS is unsupported, attempt to add columns individually and ignore duplicates
        const addCol = (colSql) => new Promise((resolve) => {
          connection.query(colSql, () => resolve());
        });
        await addCol(`ALTER TABLE ${table} ADD COLUMN is_deleted TINYINT(1) DEFAULT 0`);
        await addCol(`ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP NULL`);
        console.log(`Soft-delete columns added (fallback) for ${table}.`);
      }
    };

    try {
      await addSoftDeleteColumns('students');
      await addSoftDeleteColumns('parents');
    } catch (e) {
      console.warn('Warning ensuring soft-delete columns:', e.message || e);
    }

    // Migrate legacy column grade_level -> course if needed
    const ensureCourseColumn = async () => {
      // Try to add course if missing
      try {
        await new Promise((resolve, reject) => connection.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS course VARCHAR(100) NULL', (err) => err ? reject(err) : resolve()));
      } catch (err) {
        // Fallback: attempt add without IF NOT EXISTS and ignore duplicate
        await new Promise((resolve) => connection.query('ALTER TABLE students ADD COLUMN course VARCHAR(100) NULL', () => resolve()));
      }
      // If grade_level exists and course is NULL, copy values
      await new Promise((resolve) => connection.query("UPDATE students SET course = grade_level WHERE course IS NULL AND grade_level IS NOT NULL", () => resolve()));
      // Optionally keep grade_level column for backward compatibility; do not drop automatically
    };

    try {
      await ensureCourseColumn();
    } catch (e) {
      console.warn('Warning ensuring course migration:', e.message || e);
    }

    // Ensure year_level column exists for college year tracking
    const ensureYearLevelColumn = async () => {
      try {
        await new Promise((resolve, reject) => connection.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS year_level VARCHAR(50) NULL', (err) => err ? reject(err) : resolve()));
      } catch (err) {
        // Fallback without IF NOT EXISTS; ignore duplicate
        await new Promise((resolve) => connection.query('ALTER TABLE students ADD COLUMN year_level VARCHAR(50) NULL', () => resolve()));
      }
    };

    try {
      await ensureYearLevelColumn();
    } catch (e) {
      console.warn('Warning ensuring year_level column:', e.message || e);
    }

    // Ensure two admin users exist: one for Web UI and one dedicated for ESP32 device
    const webAdmin = { username: 'admin', password: 'admin123', role: 'admin' }; // Change after first login!
    const espAdmin = { username: 'esp32', password: 'esp32pass', role: 'admin' }; // Used by device (can be rotated)

    const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
      connection.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
    });

    const ensureUserExists = async ({ username, password, role }) => {
      const rows = await queryAsync('SELECT user_id FROM users WHERE username = ? LIMIT 1', [username]);
      if (rows.length > 0) {
        console.log(`User '${username}' already exists.`);
        return rows[0].user_id;
      }
      const password_hash = await bcrypt.hash(password, 10);
      const result = await queryAsync('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, password_hash, role]);
      console.log(`Created user '${username}' with role '${role}'.`);
      return result.insertId;
    };

    try {
      const adminId = await ensureUserExists(webAdmin);
      const espId = await ensureUserExists(espAdmin);
      console.log(`Admin IDs → web: ${adminId}, esp: ${espId}`);
      // Use web admin as creator for default templates
      insertTemplates(adminId || espId);
    } catch (err) {
      console.error('Error ensuring default users:', err.message || err);
      connection.end();
      return;
    }
  })();

  // Import and use the sample data insertion script
  const insertSampleData = require('../scripts/insertSampleData');

  function insertTemplates(adminId) {
    connection.query("SELECT COUNT(*) AS count FROM message_templates", (err, results) => {
      if (err) {
        console.error('Error checking templates:', err.message);
        connection.end();
        return;
      }
      if (results[0].count === 0) {
        const templates = [
          ['Tuition Reminder',
            'Dear Parent/Guardian, this is a reminder that tuition fees for {student_name} ({course} - {year_level} - {section}) are due on {due_date}. Please settle the balance at the school office. Thank you!',
            adminId],
          ['Absence Notice', 
            'Dear Parent/Guardian, we noticed that {student_name} ({course} - {year_level} - {section}) was absent today, {date}. Please confirm the reason for the absence. Thank you.',
            adminId],
          ['Exam Schedule',
            'Good day! Please be informed that {student_name}\'s examinations will start on {exam_date}. Kindly ensure your child is prepared and present during the exam days.',
            adminId],
          ['Parent-Teacher Meeting',
            'Reminder: Parent-Teacher Meeting is scheduled on {meeting_date} at {time}. Your presence is highly encouraged for updates on {student_name}\'s progress.',
            adminId],
          ['Grades Available',
            'Hello! {student_name}\'s report card for this term is now available. Kindly visit the school office to claim it. Thank you!',
            adminId],
          ['School Announcement',
            'Attention Parents: {announcement_text}. Please take note and cooperate accordingly. Thank you!',
            adminId]
        ]; 

        connection.query(
          'INSERT INTO message_templates (template_name, template_text, created_by) VALUES ?',
          [templates],
          async (err) => {
            if (err) {
              console.error('Error inserting templates:', err.message);
            } else {
              console.log('Default message templates inserted.');
              await insertSampleData(); // Insert sample data after templates
            }
            connection.end();
          }
        );
      } else {
        console.log('Message templates already exist.');
        insertSampleData().then(() => connection.end()); // Insert sample data if templates exist
      }
    });
  }
});
