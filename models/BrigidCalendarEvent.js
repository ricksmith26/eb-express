import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ReminderSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4()
  },
  minutesBefore: {
    type: Number,
    required: true,
    default: 15
  },
  method: {
    type: String,
    enum: ['push', 'socket'],
    default: 'push'
  },
  sent: {
    type: Boolean,
    default: false
  },
  sentAt: Date
}, { _id: false });

const RecurrenceRuleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true
  },
  interval: {
    type: Number,
    default: 1
  },
  byDay: [{
    type: String,
    enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  }],
  byMonthDay: [Number],
  byMonth: [Number],
  count: Number,
  until: Date
}, { _id: false });

const InviteeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  userId: String,
  name: String,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'tentative'],
    default: 'pending'
  },
  respondedAt: Date,
  isOrganizer: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const ExternalSyncSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['google', 'outlook', 'apple', null]
  },
  externalId: String,
  etag: String,
  lastSyncedAt: Date,
  syncDirection: {
    type: String,
    enum: ['imported', 'exported', 'bidirectional']
  }
}, { _id: false });

const BrigidCalendarEventSchema = new mongoose.Schema({
  resourceType: {
    type: String,
    default: 'BrigidCalendarEvent',
    immutable: true
  },

  id: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  status: {
    type: String,
    enum: ['scheduled', 'cancelled', 'completed'],
    default: 'scheduled',
    index: true
  },

  title: {
    type: String,
    required: true,
    maxlength: 500
  },
  description: {
    type: String,
    maxlength: 5000
  },
  location: String,

  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    required: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  allDay: {
    type: Boolean,
    default: false
  },

  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrence: RecurrenceRuleSchema,
  parentEventId: {
    type: String,
    index: true
  },
  originalStartTime: Date,

  ownerEmail: {
    type: String,
    required: true,
    index: true
  },
  ownerUserId: {
    type: String,
    index: true
  },

  invitees: [InviteeSchema],

  reminders: [ReminderSchema],

  externalSync: ExternalSyncSchema,

  color: String,
  category: {
    type: String,
    enum: ['personal', 'work', 'health', 'medical', 'family', 'other'],
    default: 'personal'
  },

  fhirAppointmentId: String,

  _brigid: {
    createdBy: String,
    agendaJobIds: [String],
    version: { type: Number, default: 1 }
  }

}, {
  timestamps: true,
  collection: 'brigidcalendarevents'
});

BrigidCalendarEventSchema.index({ ownerEmail: 1, startTime: 1 });
BrigidCalendarEventSchema.index({ ownerEmail: 1, status: 1, startTime: 1 });
BrigidCalendarEventSchema.index({ 'invitees.email': 1, startTime: 1 });
BrigidCalendarEventSchema.index({ 'externalSync.provider': 1, 'externalSync.externalId': 1 });
BrigidCalendarEventSchema.index({ isRecurring: 1, parentEventId: 1 });

BrigidCalendarEventSchema.methods.isOrganizer = function(email) {
  return this.ownerEmail === email;
};

BrigidCalendarEventSchema.methods.getInviteeStatus = function(email) {
  const invitee = this.invitees.find(i => i.email === email);
  return invitee ? invitee.status : null;
};

BrigidCalendarEventSchema.statics.findByOwner = function(email, options = {}) {
  const { startDate, endDate, status, limit = 100, skip = 0 } = options;

  const query = { ownerEmail: email };

  if (status) query.status = status;
  if (startDate || endDate) {
    query.startTime = {};
    if (startDate) query.startTime.$gte = new Date(startDate);
    if (endDate) query.startTime.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ startTime: 1 })
    .skip(skip)
    .limit(limit);
};

BrigidCalendarEventSchema.statics.findByInvitee = function(email, options = {}) {
  const { startDate, endDate, status, limit = 100, skip = 0 } = options;

  const query = { 'invitees.email': email };

  if (status) query.status = status;
  if (startDate || endDate) {
    query.startTime = {};
    if (startDate) query.startTime.$gte = new Date(startDate);
    if (endDate) query.startTime.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ startTime: 1 })
    .skip(skip)
    .limit(limit);
};

BrigidCalendarEventSchema.statics.findUserEvents = function(email, options = {}) {
  const { startDate, endDate, status, limit = 100, skip = 0 } = options;

  const query = {
    $or: [
      { ownerEmail: email },
      { 'invitees.email': email }
    ]
  };

  if (status) query.status = status;
  if (startDate || endDate) {
    query.startTime = {};
    if (startDate) {
      query.startTime.$gte = new Date(startDate);
    }
    if (endDate) {
      // If endDate is a date string (YYYY-MM-DD), set to end of that day
      const end = new Date(endDate);
      if (typeof endDate === 'string' && endDate.length === 10) {
        end.setUTCHours(23, 59, 59, 999);
      }
      query.startTime.$lte = end;
    }
  }

  return this.find(query)
    .sort({ startTime: 1 })
    .skip(skip)
    .limit(limit);
};

BrigidCalendarEventSchema.statics.findByExternalId = function(provider, externalId) {
  return this.findOne({
    'externalSync.provider': provider,
    'externalSync.externalId': externalId
  });
};

const BrigidCalendarEvent = mongoose.model('BrigidCalendarEvent', BrigidCalendarEventSchema);

export default BrigidCalendarEvent;
