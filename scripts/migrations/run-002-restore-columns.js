/**
 * Run SQL migration to restore patient contact columns
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    console.log('🔧 Running migration: 002_restore_contact_columns.sql\n');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Read SQL file
        const sqlFile = join(__dirname, '002_restore_contact_columns.sql');
        const sql = readFileSync(sqlFile, 'utf8');

        console.log('📡 Connecting to PostgreSQL...');
        const client = await pool.connect();
        console.log('✓ Connected\n');

        console.log('💾 Running migration...');
        await client.query(sql);
        console.log('✓ Migration completed successfully\n');

        // Verify columns were added
        const verifyResult = await client.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'telecare_devices'
            AND column_name IN (
                'user_name', 'user_address', 'user_phone',
                'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
                'secondary_contact_name', 'secondary_contact_phone',
                'gp_name', 'gp_phone'
            )
            ORDER BY column_name
        `);

        console.log('✅ Columns added to telecare_devices table:');
        verifyResult.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''})`);
        });
        console.log();

        client.release();

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigration()
    .then(() => {
        console.log('✅ Migration script completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
