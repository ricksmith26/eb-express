/**
 * FHIR Organization Model
 * Represents organisations/tenants in the Brigid Admin Portal
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/organization.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirOrganizationSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'Organization',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // External identifiers
  identifier: [{
    system: String,  // e.g., 'urn:brigid:org:slug'
    value: String
  }],

  // Whether the organization is still active
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Organization type
  type: [{
    coding: [{
      system: { type: String, default: 'http://terminology.hl7.org/CodeSystem/organization-type' },
      code: { type: String, default: 'prov' },  // Healthcare Provider
      display: String
    }]
  }],

  // Organization name
  name: {
    type: String,
    required: true,
    index: true
  },

  // Alternative names
  alias: [String],

  // Contact points (phone, email, etc.)
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

  // Addresses
  address: [{
    use: {
      type: String,
      enum: ['home', 'work', 'temp', 'old', 'billing']
    },
    type: {
      type: String,
      enum: ['postal', 'physical', 'both']
    },
    line: [String],
    city: String,
    state: String,
    postalCode: String,
    country: String
  }],

  // Part of another organization (for hierarchy)
  partOf: {
    reference: String  // 'Organization/{id}'
  },

  // Contact persons for the organization
  contact: [{
    purpose: {
      coding: [{
        system: String,
        code: String,
        display: String
      }]
    },
    name: {
      family: String,
      given: [String]
    },
    telecom: [{
      system: String,
      value: String
    }]
  }],

  // Brigid-specific extensions
  extension: [{
    url: String,
    valueString: String
  }],

  // Audit fields
  createdBy: String,  // Practitioner.id who created

}, {
  timestamps: true,
  collection: 'fhirorganizations'
});

// Indexes
FhirOrganizationSchema.index({ name: 'text', 'alias': 'text' });
FhirOrganizationSchema.index({ 'identifier.system': 1, 'identifier.value': 1 });
FhirOrganizationSchema.index({ active: 1, createdAt: -1 });

// Virtual: slug (from identifier)
FhirOrganizationSchema.virtual('slug').get(function() {
  const slugIdentifier = this.identifier?.find(i => i.system === 'urn:brigid:org:slug');
  return slugIdentifier?.value || null;
});

// Instance method: Get primary email
FhirOrganizationSchema.methods.getPrimaryEmail = function() {
  const email = this.telecom?.find(t => t.system === 'email');
  return email?.value || null;
};

// Instance method: Get primary phone
FhirOrganizationSchema.methods.getPrimaryPhone = function() {
  const phone = this.telecom?.find(t => t.system === 'phone');
  return phone?.value || null;
};

// Instance method: Get settings from extension
FhirOrganizationSchema.methods.getSettings = function() {
  const settingsExt = this.extension?.find(
    e => e.url === 'http://brigid.com/fhir/StructureDefinition/org-settings'
  );
  if (settingsExt?.valueString) {
    try {
      return JSON.parse(settingsExt.valueString);
    } catch {
      return {};
    }
  }
  return {};
};

// Static method: Find by slug
FhirOrganizationSchema.statics.findBySlug = function(slug) {
  return this.findOne({
    'identifier.system': 'urn:brigid:org:slug',
    'identifier.value': slug,
    active: true
  });
};

// Static method: Find active organizations
FhirOrganizationSchema.statics.findActive = function() {
  return this.find({ active: true }).sort({ name: 1 });
};

// Pre-save: Generate slug from name if not present
FhirOrganizationSchema.pre('save', function(next) {
  const hasSlug = this.identifier?.some(i => i.system === 'urn:brigid:org:slug');
  if (!hasSlug && this.name) {
    const slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!this.identifier) this.identifier = [];
    this.identifier.push({
      system: 'urn:brigid:org:slug',
      value: slug
    });
  }
  next();
});

const FhirOrganization = mongoose.model('FhirOrganization', FhirOrganizationSchema);

export default FhirOrganization;
