/**
 * FHIR Practitioner Model
 * Represents employees/admin users in the Brigid Admin Portal
 * Authenticated via AWS Cognito
 *
 * FHIR R4 compliant: https://www.hl7.org/fhir/practitioner.html
 */
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const FhirPractitionerSchema = new mongoose.Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'Practitioner',
    immutable: true
  },

  // FHIR resource ID (UUID)
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  // Identifiers (Cognito sub, email, etc.)
  identifier: [{
    system: {
      type: String,
      enum: [
        'urn:brigid:cognito:sub',    // AWS Cognito subject ID
        'urn:brigid:email',           // Email address
        'urn:brigid:cognito:username' // Cognito username
      ]
    },
    value: String
  }],

  // Whether the practitioner is currently active
  active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Practitioner name(s)
  name: [{
    use: {
      type: String,
      enum: ['usual', 'official', 'temp', 'nickname', 'anonymous', 'old', 'maiden'],
      default: 'official'
    },
    family: String,
    given: [String],
    prefix: [String],  // Dr., Mr., etc.
    suffix: [String]
  }],

  // Contact details
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

  // Address(es)
  address: [{
    use: {
      type: String,
      enum: ['home', 'work', 'temp', 'old', 'billing']
    },
    line: [String],
    city: String,
    state: String,
    postalCode: String,
    country: String
  }],

  // Gender
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'unknown']
  },

  // Birth date
  birthDate: String,

  // Photo
  photo: [{
    contentType: String,
    url: String,
    title: String
  }],

  // Qualifications (licenses, certifications)
  qualification: [{
    identifier: [{
      system: String,
      value: String
    }],
    code: {
      coding: [{
        system: String,
        code: String,
        display: String
      }]
    },
    period: {
      start: Date,
      end: Date
    },
    issuer: {
      reference: String,
      display: String
    }
  }],

  // Communication languages
  communication: [{
    coding: [{
      system: { type: String, default: 'urn:ietf:bcp:47' },
      code: String,  // e.g., 'en', 'es'
      display: String
    }]
  }],

  // ===== Cognito-specific fields (non-FHIR) =====

  // AWS Cognito Subject ID (primary identifier for auth)
  cognitoSub: {
    type: String,
    unique: true,
    sparse: true,  // Allow null for manual creation
    index: true
  },

  // Cognito username
  cognitoUsername: {
    type: String,
    sparse: true,
    index: true
  },

  // ===== Session management =====

  // Currently active organization (for session context)
  activeOrganizationId: {
    type: String,
    index: true
  },

  // Last login timestamp
  lastLoginAt: Date,

  // JWT refresh token (for admin portal sessions)
  jwtRefreshToken: {
    type: String,
    select: false
  },
  jwtRefreshTokenExpiry: Date,

  // Account status
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'pending_verification', 'deactivated'],
    default: 'pending_verification',
    index: true
  }

}, {
  timestamps: true,
  collection: 'fhirpractitioners'
});

// Indexes
FhirPractitionerSchema.index({ 'identifier.system': 1, 'identifier.value': 1 });
FhirPractitionerSchema.index({ 'name.family': 'text', 'name.given': 'text' });
FhirPractitionerSchema.index({ active: 1, accountStatus: 1 });

// Virtual: email (from identifier or telecom)
FhirPractitionerSchema.virtual('email').get(function() {
  // First try identifier
  const emailId = this.identifier?.find(i => i.system === 'urn:brigid:email');
  if (emailId?.value) return emailId.value;

  // Then try telecom
  const emailTelecom = this.telecom?.find(t => t.system === 'email');
  return emailTelecom?.value || null;
});

// Virtual: full name
FhirPractitionerSchema.virtual('fullName').get(function() {
  const officialName = this.name?.find(n => n.use === 'official') || this.name?.[0];
  if (!officialName) return null;

  const given = officialName.given?.join(' ') || '';
  const family = officialName.family || '';
  return `${given} ${family}`.trim();
});

// Virtual: first name
FhirPractitionerSchema.virtual('firstName').get(function() {
  const officialName = this.name?.find(n => n.use === 'official') || this.name?.[0];
  return officialName?.given?.[0] || null;
});

// Virtual: last name
FhirPractitionerSchema.virtual('lastName').get(function() {
  const officialName = this.name?.find(n => n.use === 'official') || this.name?.[0];
  return officialName?.family || null;
});

// Instance method: Get phone number
FhirPractitionerSchema.methods.getPhone = function() {
  const phone = this.telecom?.find(t => t.system === 'phone');
  return phone?.value || null;
};

// Instance method: Check if practitioner is a super admin
// (Must be combined with PractitionerRole check)
FhirPractitionerSchema.methods.hasCognitoId = function() {
  return !!this.cognitoSub;
};

// Static method: Find by Cognito sub
FhirPractitionerSchema.statics.findByCognitoSub = function(sub) {
  return this.findOne({
    cognitoSub: sub,
    active: true,
    accountStatus: { $ne: 'deactivated' }
  });
};

// Static method: Find by email
FhirPractitionerSchema.statics.findByEmail = function(email) {
  return this.findOne({
    $or: [
      { 'identifier.system': 'urn:brigid:email', 'identifier.value': email.toLowerCase() },
      { 'telecom.system': 'email', 'telecom.value': email.toLowerCase() }
    ],
    active: true
  });
};

// Pre-save: Ensure email is in identifier
FhirPractitionerSchema.pre('save', function(next) {
  // Extract email from telecom if not in identifier
  const emailInTelecom = this.telecom?.find(t => t.system === 'email')?.value;
  const hasEmailIdentifier = this.identifier?.some(i => i.system === 'urn:brigid:email');

  if (emailInTelecom && !hasEmailIdentifier) {
    if (!this.identifier) this.identifier = [];
    this.identifier.push({
      system: 'urn:brigid:email',
      value: emailInTelecom.toLowerCase()
    });
  }

  // Add cognitoSub to identifier
  if (this.cognitoSub) {
    const hasCognitoIdentifier = this.identifier?.some(i => i.system === 'urn:brigid:cognito:sub');
    if (!hasCognitoIdentifier) {
      if (!this.identifier) this.identifier = [];
      this.identifier.push({
        system: 'urn:brigid:cognito:sub',
        value: this.cognitoSub
      });
    }
  }

  next();
});

const FhirPractitioner = mongoose.model('FhirPractitioner', FhirPractitionerSchema);

export default FhirPractitioner;
