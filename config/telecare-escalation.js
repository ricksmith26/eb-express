import pool from './postgres.js';

// Default escalation configuration
export const DEFAULT_ESCALATION_CONFIG = {
    firstEscalationSeconds: 30,   // Ring all agents again
    secondEscalationSeconds: 60,  // Notify supervisor
    maxRetries: 3,
    supervisorEmail: null,
    supervisorPhone: null
};

class TelecareEscalationConfig {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the escalation_config table if it doesn't exist
     */
    async initialize() {
        if (this.initialized) return;

        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS escalation_config (
                    id SERIAL PRIMARY KEY,
                    organization_id VARCHAR(100) UNIQUE,
                    first_escalation_seconds INT DEFAULT 30,
                    second_escalation_seconds INT DEFAULT 60,
                    supervisor_email VARCHAR(255),
                    supervisor_phone VARCHAR(50),
                    max_retries INT DEFAULT 3,
                    enabled BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);

            // Insert default config if none exists (organization_id = NULL for global default)
            await pool.query(`
                INSERT INTO escalation_config (organization_id, first_escalation_seconds, second_escalation_seconds, max_retries)
                VALUES (NULL, $1, $2, $3)
                ON CONFLICT (organization_id) DO NOTHING
            `, [
                DEFAULT_ESCALATION_CONFIG.firstEscalationSeconds,
                DEFAULT_ESCALATION_CONFIG.secondEscalationSeconds,
                DEFAULT_ESCALATION_CONFIG.maxRetries
            ]);

            this.initialized = true;
            console.log('✅ Escalation config table initialized');
        } catch (error) {
            console.error('❌ Failed to initialize escalation config table:', error.message);
            throw error;
        }
    }

    /**
     * Get escalation config for an organization (falls back to global default)
     */
    async getConfig(organizationId = null) {
        await this.initialize();

        // Try org-specific config first, then fall back to global
        const result = await pool.query(`
            SELECT * FROM escalation_config
            WHERE organization_id = $1 OR organization_id IS NULL
            ORDER BY organization_id DESC NULLS LAST
            LIMIT 1
        `, [organizationId]);

        if (result.rows.length === 0) {
            return DEFAULT_ESCALATION_CONFIG;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            organizationId: row.organization_id,
            firstEscalationSeconds: row.first_escalation_seconds,
            secondEscalationSeconds: row.second_escalation_seconds,
            maxRetries: row.max_retries,
            supervisorEmail: row.supervisor_email,
            supervisorPhone: row.supervisor_phone,
            enabled: row.enabled,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * Update escalation config for an organization
     */
    async updateConfig(organizationId, updates) {
        await this.initialize();

        const {
            firstEscalationSeconds,
            secondEscalationSeconds,
            maxRetries,
            supervisorEmail,
            supervisorPhone,
            enabled
        } = updates;

        const result = await pool.query(`
            INSERT INTO escalation_config (
                organization_id, first_escalation_seconds, second_escalation_seconds,
                max_retries, supervisor_email, supervisor_phone, enabled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (organization_id) DO UPDATE SET
                first_escalation_seconds = COALESCE(EXCLUDED.first_escalation_seconds, escalation_config.first_escalation_seconds),
                second_escalation_seconds = COALESCE(EXCLUDED.second_escalation_seconds, escalation_config.second_escalation_seconds),
                max_retries = COALESCE(EXCLUDED.max_retries, escalation_config.max_retries),
                supervisor_email = COALESCE(EXCLUDED.supervisor_email, escalation_config.supervisor_email),
                supervisor_phone = COALESCE(EXCLUDED.supervisor_phone, escalation_config.supervisor_phone),
                enabled = COALESCE(EXCLUDED.enabled, escalation_config.enabled),
                updated_at = NOW()
            RETURNING *
        `, [
            organizationId,
            firstEscalationSeconds,
            secondEscalationSeconds,
            maxRetries,
            supervisorEmail,
            supervisorPhone,
            enabled ?? true
        ]);

        const row = result.rows[0];
        return {
            id: row.id,
            organizationId: row.organization_id,
            firstEscalationSeconds: row.first_escalation_seconds,
            secondEscalationSeconds: row.second_escalation_seconds,
            maxRetries: row.max_retries,
            supervisorEmail: row.supervisor_email,
            supervisorPhone: row.supervisor_phone,
            enabled: row.enabled,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * List all escalation configs
     */
    async listConfigs() {
        await this.initialize();

        const result = await pool.query(`
            SELECT * FROM escalation_config
            ORDER BY organization_id NULLS FIRST
        `);

        return result.rows.map(row => ({
            id: row.id,
            organizationId: row.organization_id,
            firstEscalationSeconds: row.first_escalation_seconds,
            secondEscalationSeconds: row.second_escalation_seconds,
            maxRetries: row.max_retries,
            supervisorEmail: row.supervisor_email,
            supervisorPhone: row.supervisor_phone,
            enabled: row.enabled,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }
}

export default new TelecareEscalationConfig();
