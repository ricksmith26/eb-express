import mongoose, { Schema } from 'mongoose';

const AsteriskCredentialSchema = new Schema(
  {
    name: { type: String, required: true },
    sipUri: { type: String, required: true },
    websocketUrl: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    extension: { type: String, required: true },
    type: {
        type: String,
        enum: ['agent', 'customer']
      },
    transport: {
      type: String,
      enum: ['udp', 'tcp', 'tls', 'ws', 'wss'],
      default: 'wss',
    },
    domain: { type: String, required: true },
    status: {
        type: String,
        enum: ['AVAILABLE', 'INCOMING', 'OUTGOING', 'HOLD', 'AFTER_CALL', 'INACTIVE'],
        default: ['INACTIVE']
      },
    port: { type: Number, default: 5060 },
    agent: {
      type: Schema.Types.ObjectId,
      ref: 'Practitioner',
    },
  },
  {
    timestamps: true,
  }
);

export const AsteriskCredential = mongoose.model(
  'AsteriskCredential',
  AsteriskCredentialSchema
);