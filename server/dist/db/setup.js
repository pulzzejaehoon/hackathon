import pool from './index.js';
const setupDatabase = async () => {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Database setup complete: "users" table created.');
    }
    catch (err) {
        console.error('Error setting up database:', err);
    }
    finally {
        await pool.end();
    }
};
setupDatabase();
