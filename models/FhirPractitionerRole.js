/**
 * FHIR PractitionerRole Model
 * Links Practitioners to Organizations with specific roles and permissions
 * This is the key model for multi-org RBAC in the Brigid Admin Portal
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/practitionerrole.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Role codes for the admin portal
const ADMIN_ROLE_CODES = ['super_admin', 'org_admin', 'employee'];

// Permission codes
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
  'organizations:delete'
];

const FhirPractitionerRoleSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'PractitionerRole',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Whether this role assignment is active
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Validity period
  period: {
    start: { type: Date, default: Date.now },
    end: Date  // null = no end date
  },

  // Reference to the Practitioner
  practitioner: {
    reference: {
      type: String,
      required: true,
      index: true
    },  // 'Practitioner/{id}'
    display: String  // Cached name for display
  },

  // Reference to the Organization
  organization: {
    reference: {
      type: String,
      required: true,
      index: true
    },  // 'Organization/{id}'
    display: String  // Cached name for display
  },

  // Role code(s)
  code: [{
    coding: [{
      system: {
        type: String,
        default: 'http://brigid.com/fhir/CodeSystem/admin-role'
      },
      code: {
        type: String,
        enum: ADMIN_ROLE_CODES,
        required: true
      },
      display: String
    }]
  }],

  // Specialty (optional, for healthcare roles)
  specialty: [{
    coding: [{
      system: String,
      code: String,
      display: String
    }]
  }],

  // Locations where this role is valid
  location: [{
    reference: String,
    display: String
  }],

  // Contact details specific to this role
  telecom: [{
    system: {
      type: String,
      enum: ['phone', 'fax', 'email', 'pager', 'url', 'sms', 'other']
    },
    value: String,
    use: {
      type: String,
      enum: ['home', 'work', 'temp', 'old', 'mobile']
    }
  }],

  // Available times (scheduling)
  availableTime: [{
    daysOfWeek: [String],  // mon, tue, wed, thu, fri, sat, sun
    allDay: Boolean,
    availableStartTime: String,  // HH:MM:SS
    availableEndTime: String
  }],

  // ===== Brigid-specific extensions for RBAC =====

  // Granular permissions for this role
  extension: [{
    url: {
      type: String,
      enum: [
        'http://brigid.com/fhir/StructureDefinition/permissions',
        'http://brigid.com/fhir/StructureDefinition/role-metadata'
      ]
    },
    valueCode: {
      type: String,
      enum: PERMISSION_CODES
    },
    valueString: String  // For role-metadata (JSON)
  }],

  // ===== Audit fields =====

  // Who invited/created this role
  invitedBy: {
    reference: String,  // 'Practitioner/{id}'
    display: String
  },

  // When the practitioner joined with this role
  joinedAt: {
    type: Date,
    default: Date.now
  },

  // Role status (beyond just active/inactive)
  roleStatus: {
    type: String,
    enum: ['active', 'suspended', 'pending', 'revoked'],
    default: 'active',
    index: true
  }

}, {
  timestamps: true,
  collection: 'fhirpractitionerroles'
});

// Compound indexes for common queries
FhirPractitionerRoleSchema.index({ 'practitioner.reference': 1, active: 1 });
FhirPractitionerRoleSchema.index({ 'organization.reference': 1, active: 1 });
FhirPractitionerRoleSchema.index({ 'practitioner.reference': 1, 'organization.reference': 1 }, { unique: true });
FhirPractitionerRoleSchema.index({ 'code.coding.code': 1, active: 1 });

// Virtual: practitioner ID (extracted from reference)
FhirPractitionerRoleSchema.virtual('practitionerId').get(function() {
  const ref = this.practitioner?.reference;
  return ref?.startsWith('Practitioner/') ? ref.substring(13) : null;
});

// Virtual: organization ID (extracted from reference)
FhirPractitionerRoleSchema.virtual('organizationId').get(function() {
  const ref = this.organization?.reference;
  return ref?.startsWith('Organization/') ? ref.substring(13) : null;
});

// Virtual: primary role code
FhirPractitionerRoleSchema.virtual('roleCode').get(function() {
  return this.code?.[0]?.coding?.[0]?.code || null;
});

// Virtual: permissions array
FhirPractitionerRoleSchema.virtual('permissions').get(function() {
  return this.extension
    ?.filter(e => e.url === 'http://brigid.com/fhir/StructureDefinition/permissions')
    .map(e => e.valueCode) || [];
});

// Instance method: Check if has specific permission
FhirPractitionerRoleSchema.methods.hasPermission = function(permission) {
  const roleCode = this.roleCode;

  // Super admin and org admin have all permissions
  if (roleCode === 'super_admin' || roleCode === 'org_admin') {
    return true;
  }

  // Check explicit permissions for employees
  return this.permissions.includes(permission);
};

// Instance method: Check if is super admin
FhirPractitionerRoleSchema.methods.isSuperAdmin = function() {
  return this.roleCode === 'super_admin';
};

// Instance method: Check if is org admin
FhirPractitionerRoleSchema.methods.isOrgAdmin = function() {
  return this.roleCode === 'org_admin';
};

// Instance method: Check if is employee
FhirPractitionerRoleSchema.methods.isEmployee = function() {
  return this.roleCode === 'employee';
};

// Instance method: Get all permissions (including implicit ones)
FhirPractitionerRoleSchema.methods.getAllPermissions = function() {
  const roleCode = this.roleCode;

  // Super admin and org admin have all permissions
  if (roleCode === 'super_admin' || roleCode === 'org_admin') {
    return PERMISSION_CODES;
  }

  // Return explicit permissions for employees
  return this.permissions;
};

// Static method: Find roles for a practitioner
FhirPractitionerRoleSchema.statics.findByPractitioner = function(practitionerId) {
  return this.find({
    'practitioner.reference': `Practitioner/${practitionerId}`,
    active: true,
    roleStatus: 'active'
  });
};

// Static method: Find roles in an organization
FhirPractitionerRoleSchema.statics.findByOrganization = function(organizationId) {
  return this.find({
    'organization.reference': `Organization/${organizationId}`,
    active: true,
    roleStatus: 'active'
  });
};

// Static method: Find specific role
FhirPractitionerRoleSchema.statics.findRole = function(practitionerId, organizationId) {
  return this.findOne({
    'practitioner.reference': `Practitioner/${practitionerId}`,
    'organization.reference': `Organization/${organizationId}`,
    active: true
  });
};

// Static method: Find all super admins
FhirPractitionerRoleSchema.statics.findSuperAdmins = function() {
  return this.find({
    'code.coding.code': 'super_admin',
    active: true,
    roleStatus: 'active'
  });
};

// Static method: Check if practitioner has role in org
FhirPractitionerRoleSchema.statics.hasRoleInOrg = async function(practitionerId, organizationId, roles = []) {
  const query = {
    'practitioner.reference': `Practitioner/${practitionerId}`,
    'organization.reference': `Organization/${organizationId}`,
    active: true,
    roleStatus: 'active'
  };

  if (roles.length > 0) {
    query['code.coding.code'] = { $in: roles };
  }

  const role = await this.findOne(query);
  return !!role;
};

// Pre-save: Set display values for code
FhirPractitionerRoleSchema.pre('save', function(next) {
  const displayMap = {
    'super_admin': 'Super Admin',
    'org_admin': 'Organization Admin',
    'employee': 'Employee'
  };

  if (this.code?.[0]?.coding?.[0]) {
    const coding = this.code[0].coding[0];
    if (!coding.display && coding.code) {
      coding.display = displayMap[coding.code] || coding.code;
    }
  }

  next();
});

const FhirPractitionerRole = mongoose.model('FhirPractitionerRole', FhirPractitionerRoleSchema);

export default FhirPractitionerRole;

// Export constants for use in other modules
export { ADMIN_ROLE_CODES, PERMISSION_CODES };
