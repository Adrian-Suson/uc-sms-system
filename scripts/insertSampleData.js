const mysql = require('mysql2/promise');
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

// Sample data arrays
const parents = [
    {
        firstName: 'Maria',
        lastName: 'Santos',
        phoneNumber: '09123456789',
        email: 'maria.santos@email.com',
        relationship: 'Mother'
    },
    {
        firstName: 'Roberto',
        lastName: 'Cruz',
        phoneNumber: '09234567890',
        email: 'roberto.cruz@email.com',
        relationship: 'Father'
    },
    {
        firstName: 'Elena',
        lastName: 'Reyes',
        phoneNumber: '09345678901',
        email: 'elena.reyes@email.com',
        relationship: 'Mother'
    },
    {
        firstName: 'Miguel',
        lastName: 'Garcia',
        phoneNumber: '09456789012',
        email: 'miguel.garcia@email.com',
        relationship: 'Father'
    },
    {
        firstName: 'Isabella',
        lastName: 'Torres',
        phoneNumber: '09567890123',
        email: 'isabella.torres@email.com',
        relationship: 'Mother'
    }
];

const sections = ['Section A', 'Section B', 'Section C', 'Section D'];
// Example college courses for sample data
const courses = ['BSIT', 'BSCS', 'BSCpE', 'BSN', 'BSEd'];
const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

// Function to generate a random date between two dates
function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Function to generate random number of children (1-4) for each parent
function generateChildren(parentLastName) {
    const numChildren = Math.floor(Math.random() * 4) + 1; // 1-4 children
    const children = [];

    for (let i = 0; i < numChildren; i++) {
        // Generate birthdate between 2008-2016 (ages ~7-15)
        const birthdate = randomDate(new Date(2008, 0, 1), new Date(2016, 11, 31));

        // Random first names based on gender
        const boyNames = ['Juan', 'Miguel', 'Carlos', 'Luis', 'Diego', 'Antonio', 'Rafael'];
        const girlNames = ['Ana', 'Maria', 'Sofia', 'Isabella', 'Carmen', 'Lucia', 'Elena'];

        const isGirl = Math.random() < 0.5;
        const firstName = isGirl
            ? girlNames[Math.floor(Math.random() * girlNames.length)]
            : boyNames[Math.floor(Math.random() * boyNames.length)];

        children.push({
            firstName: firstName,
            lastName: parentLastName,
            course: courses[Math.floor(Math.random() * courses.length)],
            yearLevel: yearLevels[Math.floor(Math.random() * yearLevels.length)],
            section: sections[Math.floor(Math.random() * sections.length)],
            birthdate: birthdate.toISOString().split('T')[0]
        });
    }

    return children;
}

async function insertSampleData() {
    let connection;

    try {
        connection = await mysql.createConnection({
            host,
            user,
            password,
            database,
            port
        });

        // Check if sample data already exists
        const [parentRows] = await connection.query("SELECT COUNT(*) as count FROM parents");

        if (parentRows[0].count === 0) {
            console.log('Starting sample data insertion...');

            // Insert parents and their children
            for (const parent of parents) {
                // Insert parent
                const [parentResult] = await connection.query(
                    'INSERT INTO parents (first_name, last_name, phone_number, email, relationship) VALUES (?, ?, ?, ?, ?)',
                    [parent.firstName, parent.lastName, parent.phoneNumber, parent.email, parent.relationship]
                );
                console.log(`Inserted parent: ${parent.firstName} ${parent.lastName}`);

                // Generate and insert children for this parent
                const children = generateChildren(parent.lastName);
                for (const child of children) {
                    const [childResult] = await connection.query(
                        'INSERT INTO students (first_name, last_name, course, year_level, section, birthdate) VALUES (?, ?, ?, ?, ?, ?)',
                        [child.firstName, child.lastName, child.course, child.yearLevel, child.section, child.birthdate]
                    );

                    // Link child to parent
                    await connection.query(
                        'INSERT INTO student_parents (student_id, parent_id) VALUES (?, ?)',
                        [childResult.insertId, parentResult.insertId]
                    );
                    console.log(`Inserted and linked child: ${child.firstName} ${child.lastName}`);
                }
            }

            console.log('Sample data insertion completed successfully!');
        } else {
            console.log('Sample data already exists in the database.');
        }
    } catch (err) {
        console.error('Error inserting sample data:', err);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the insertion if this file is executed directly
if (require.main === module) {
    insertSampleData()
        .then(() => console.log('Script execution completed.'))
        .catch(err => console.error('Script execution failed:', err));
}

module.exports = insertSampleData; // Export for use in other files if needed