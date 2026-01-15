/**
 * Role Template Model
 * Stores custom role definitions for organizations
 *
 * Each organization can define their own roles with specific permissions.
 * These templates are used when assigning roles to practitioners.
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Permission codes available in the system
const PERMISSION_CODES = [
  'patients:read',
  'patients:write',
  'patients:delete',
  'practitioners:read',
  'practitioners:write',
  'practitioners:delete',
  'devices:read',
  'devices:write',
  'devices:delete',
  'organizations:read',
  'organizations:write',
  'organizations:delete',
  'roles:read',
  'roles:write',
  'roles:delete'
];

const FhirRoleTemplateSchema = new mongoose.Schema({
  // Unique ID
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Organization this role belongs to (null = system-wide/global)
  organizationId: {
    type: String,
    index: true
  },

  // Role name (e.g., "Receptionist", "Clinician", "Billing Admin")
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Description of what this role is for
  description: {
    type: String,
    trim: true
  },

  // Permissions granted by this role
  permissions: [{
    type: String,
    enum: PERMISSION_CODES
  }],

  // Whether this is a built-in role (cannot be deleted)
  isBuiltIn: {
    type: Boolean,
    default: false
  },

  // Whether this role is active
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Who created this role
  createdBy: {
    reference: String,  // 'Practitioner/{id}'
    display: String
  }

}, {
  timestamps: true,
  collection: 'fhirroletemplates'
});

// Compound index for org + name uniqueness
FhirRoleTemplateSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Static: Find roles for an organization (includes global roles)
FhirRoleTemplateSchema.statics.findByOrganization = function(organizationId) {
  return this.find({
    $or: [
      { organizationId: organizationId },
      { organizationId: null }  // Global/system roles
    ],
    active: true
  }).sort({ isBuiltIn: -1, name: 1 });
};

// Static: Find by ID
FhirRoleTemplateSchema.statics.findById = function(id) {
  return this.findOne({ id, active: true });
};

// Static: Create default roles for a new organization
FhirRoleTemplateSchema.statics.createDefaultRoles = async function(organizationId, createdBy = null) {
  const defaults = [
    {
      name: 'Full Access',
      description: 'Full access to all features',
      permissions: PERMISSION_CODES.filter(p => !p.startsWith('organizations:') && !p.startsWith('roles:')),
      isBuiltIn: true
    },
    {
      name: 'Read Only',
      description: 'View-only access to patients and devices',
      permissions: ['patients:read', 'devices:read', 'practitioners:read'],
      isBuiltIn: true
    },
    {
      name: 'Patient Manager',
      description: 'Manage patients and their devices',
      permissions: ['patients:read', 'patients:write', 'devices:read', 'devices:write'],
      isBuiltIn: true
    }
  ];

  const roles = [];
  for (const def of defaults) {
    // Check if already exists
    const existing = await this.findOne({ organizationId, name: def.name });
    if (!existing) {
      const role = new this({
        ...def,
        organizationId,
        createdBy
      });
      await role.save();
      roles.push(role);
    }
  }

  return roles;
};

const FhirRoleTemplate = mongoose.model('FhirRoleTemplate', FhirRoleTemplateSchema);

export default FhirRoleTemplate;
export { PERMISSION_CODES };
