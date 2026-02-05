-- Reverse Migration: Add patient contact columns back to telecare_devices
-- Required by Asterisk AGI scripts for real-time call handling
-- Date: 2026-02-05

-- The brigid-asterisk AGI script (lookup-telecare-device.py) directly queries
-- these columns during live emergency calls to display patient information to agents.
-- Without this data, agents cannot see patient details when handling calls.

ALTER TABLE telecare_devices
    ADD COLUMN IF NOT EXISTS user_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS user_address VARCHAR(500),
    ADD COLUMN IF NOT EXISTS user_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50),
    ADD COLUMN IF NOT EXISTS secondary_contact_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS gp_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS gp_phone VARCHAR(20);

-- Note: patient_id column remains as the link to MongoDB Patient collection
-- MongoDB maintains the canonical FHIR patient records for the clinical system
-- These PostgreSQL columns provide fast access for Asterisk PABX during emergency calls
