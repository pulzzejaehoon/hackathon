import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ai_agent_db',
    user: process.env.PGUSER || 'user',
    password: process.env.PGPASSWORD || 'password',
});
export default pool;
