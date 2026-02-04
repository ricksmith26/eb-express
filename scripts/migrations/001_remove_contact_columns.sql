-- Migration: Remove duplicate contact columns from telecare_devices
-- Contact information is now stored exclusively in MongoDB (Patient and RelatedPerson collections)
-- Date: 2026-02-04

-- Drop contact columns from telecare_devices table
ALTER TABLE telecare_devices
    DROP COLUMN IF EXISTS user_name,
    DROP COLUMN IF EXISTS user_address,
    DROP COLUMN IF EXISTS user_phone,
    DROP COLUMN IF EXISTS emergency_contact_name,
    DROP COLUMN IF EXISTS emergency_contact_phone,
    DROP COLUMN IF EXISTS emergency_contact_relationship,
    DROP COLUMN IF EXISTS secondary_contact_name,
    DROP COLUMN IF EXISTS secondary_contact_phone,
    DROP COLUMN IF EXISTS gp_name,
    DROP COLUMN IF EXISTS gp_phone;

-- Note: The patient_id column remains as the link to MongoDB Patient collection
-- Device-specific fields retained: device_id, device_type, device_model, organization_id,
-- fhir_device_id, patient_id, notes, is_active, last_registration, last_alarm, timestamps
