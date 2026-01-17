import mongoose from 'mongoose';

const { Schema } = mongoose;

// FHIR R4 Communication Resource Schema for WebRTC Call History
// Reference: https://www.hl7.org/fhir/communication.html

const FhirCommunicationSchema = new Schema({
  // FHIR Resource Type
  resourceType: {
    type: String,
    default: 'Communication',
    required: true
  },

  // FHIR Communication Status
  // in-progress | completed | abandoned | entered-in-error | unknown
  status: {
    type: String,
    enum: ['preparation', 'in-progress', 'not-done', 'on-hold', 'stopped', 'completed', 'entered-in-error', 'unknown'],
    required: true,
    default: 'preparation'
  },

  // Category of communication (e.g., "alert", "notification", "reminder", "instruction")
  category: [{
    coding: [{
      system: {
        type: String,
        default: 'http://terminology.hl7.org/CodeSystem/communication-category'
      },
      code: {
        type: String,
        default: 'alert'  // WebRTC calls are typically alerts
      },
      display: {
        type: String,
        default: 'Alert'
      }
    }],
    text: {
      type: String,
      default: 'WebRTC Call'
    }
  }],

  // Medium of communication (voice call, video call, etc.)
  medium: [{
    coding: [{
      system: {
        type: String,
        default: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode'
      },
      code: {
        type: String,
        enum: ['VERBAL', 'VIDEOCONF', 'ELECTRONIC', 'WRITTEN'],
        default: 'VIDEOCONF'  // WebRTC typically includes video
      },
      display: String
    }],
    text: String
  }],

  // Subject of the communication (patient/customer reference)
  subject: {
    reference: {
      type: String  // e.g., "User/[userId]" or "Patient/[patientId]"
    },
    identifier: {
      system: String,
      value: String  // User email or ID
    },
    display: String  // User name
  },

  // Sender of the communication (initiator of the call)
  sender: {
    reference: {
      type: String  // e.g., "Practitioner/[practitionerId]" or "User/[userId]"
    },
    identifier: {
      system: String,
      value: String  // Sender email
    },
    display: String  // Sender name
  },

  // Recipients of the communication
  recipient: [{
    reference: {
      type: String  // e.g., "Practitioner/[practitionerId]" or "User/[userId]"
    },
    identifier: {
      system: String,
      value: String  // Recipient email
    },
    display: String  // Recipient name
  }],

  // When the communication occurred
  sent: {
    type: Date  // When the call was initiated
  },

  received: {
    type: Date  // When the call was answered/received
  },

  // Call details and metadata
  payload: [{
    contentString: String,  // Call summary or notes
    contentAttachment: {
      contentType: String,
      url: String,  // Recording URL if available
      title: String,
      creation: Date
    }
  }],

  // Call-specific metadata (extensions for WebRTC)
  extension: [{
    url: String,
    valueString: String,
    valueInteger: Number,
    valueBoolean: Boolean,
    valueDateTime: Date
  }],

  // WebRTC-specific tracking fields (not standard FHIR but useful)
  callMetadata: {
    callId: {
      type: String,
      index: true
    },
    socketIds: {
      caller: String,  // Socket.IO ID of caller
      recipient: String  // Socket.IO ID of recipient
    },
    callType: {
      type: String,
      enum: ['regular', 'emergency', 'scheduled', 'manual', 'note', 'alert', 'device-activity'],
      default: 'regular'
    },
    callDuration: {
      type: Number,  // Duration in seconds
      default: 0
    },
    connectionQuality: {
      iceConnectionState: String,
      iceGatheringState: String,
      signalingState: String
    },
    endReason: {
      type: String,
      enum: ['completed', 'rejected', 'missed', 'error', 'cancelled', 'timeout'],
      default: 'completed'
    },
    isEmergency: {
      type: Boolean,
      default: false
    }
  }

}, {
  timestamps: true,  // Adds createdAt and updatedAt
  collection: 'fhir_communications'
});

// Indexes for efficient querying
FhirCommunicationSchema.index({ 'sender.identifier.value': 1, createdAt: -1 });
FhirCommunicationSchema.index({ 'recipient.identifier.value': 1, createdAt: -1 });
FhirCommunicationSchema.index({ 'callMetadata.callId': 1 });
FhirCommunicationSchema.index({ status: 1, createdAt: -1 });
FhirCommunicationSchema.index({ 'callMetadata.isEmergency': 1, createdAt: -1 });
FhirCommunicationSchema.index({ 'subject.reference': 1, createdAt: -1 });

// Instance method to calculate call duration
FhirCommunicationSchema.methods.calculateDuration = function() {
  if (this.sent && this.received) {
    const start = this.received.getTime();
    const end = Date.now(); // Use current time instead of updatedAt
    this.callMetadata.callDuration = Math.floor((end - start) / 1000);
  }
  return this.callMetadata.callDuration;
};

// Static method to find calls by user email
FhirCommunicationSchema.statics.findByUserEmail = function(email, options = {}) {
  const query = {
    $or: [
      { 'sender.identifier.value': email },
      { 'recipient.identifier.value': email }
    ]
  };

  if (options.status) {
    query.status = options.status;
  }

  if (options.isEmergency !== undefined) {
    query['callMetadata.isEmergency'] = options.isEmergency;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100);
};

// Static method to get call statistics
FhirCommunicationSchema.statics.getCallStats = async function(email, startDate, endDate) {
  const matchQuery = {
    $or: [
      { 'sender.identifier.value': email },
      { 'recipient.identifier.value': email }
    ]
  };

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalDuration: { $sum: '$callMetadata.callDuration' },
        avgDuration: { $avg: '$callMetadata.callDuration' }
      }
    }
  ]);
};

const FhirCommunication = mongoose.model('FhirCommunication', FhirCommunicationSchema);

export default FhirCommunication;
