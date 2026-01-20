import pg from 'pg';
import {
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DATABASE,
    POSTGRES_USER,
    POSTGRES_PASSWORD
} from './vars.js';

const { Pool } = pg;

// PostgreSQL connection pool for telecare/PJSIP realtime database
const pool = new Pool({
    host: POSTGRES_HOST,
    port: parseInt(POSTGRES_PORT) || 5432,
    database: POSTGRES_DATABASE || 'postgres',
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    ssl: {
        rejectUnauthorized: false // Required for AWS RDS
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Connection event handlers
pool.on('connect', () => {
    console.log('PostgreSQL pool: New client connected');
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
});

// Test connection on startup
export const connectPostgres = async () => {
    if (!POSTGRES_HOST) {
        console.log('PostgreSQL: Not configured (POSTGRES_HOST not set)');
        return false;
    }

    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as now');
        console.log(`PostgreSQL connected successfully at ${result.rows[0].now}`);
        client.release();
        return true;
    } catch (err) {
        console.error('PostgreSQL connection error:', err.message);
        return false;
    }
};

export default pool;
