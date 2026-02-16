import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  name: String,
  email: { type: String, unique: true, required: true },
  picture: String,
  accessToken: String, // Google OAuth access token
  refreshToken: String, // Google OAuth refresh token (for Google APIs)
  jwtRefreshToken: String, // JWT refresh token (for keeping user logged into YOUR API)
  jwtRefreshTokenExpiry: Date, // When the JWT refresh token expires
  calendarChannelId: String, // For Google Calendar webhook notifications
  calendarResourceId: String, // For Google Calendar webhook notifications
  calendarChannelExpiration: Date, // When the webhook subscription expires
  pushNotificationTokens: [
    {
      token: { type: String, required: true },
      platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
      deviceType: { type: String, enum: ['mobile', 'web', 'unknown'], default: 'mobile' },
      registeredAt: { type: Date, default: Date.now },
      lastUsedAt: { type: Date, default: Date.now },
    },
  ],

  // Withings Integration
  withingsAccessToken: {
    type: String,
    select: false // Don't include in default queries for security
  },
  withingsRefreshToken: {
    type: String,
    select: false
  },
  withingsTokenExpiry: Date,
  withingsUserId: String,
  withingsEmail: String, // Withings account email
  withingsScopes: [String],
  withingsConnectedAt: Date,
  withingsLastSync: Date,

  // Withings baseline data for smart alerts (calculated from historical data)
  withingsBaseline: {
    weight: { type: Number }, // Average weight
    weightStdDev: { type: Number }, // Standard deviation for weight
    systolicBP: { type: Number }, // Average systolic BP
    systolicBPStdDev: { type: Number },
    diastolicBP: { type: Number }, // Average diastolic BP
    diastolicBPStdDev: { type: Number },
    restingHeartRate: { type: Number }, // Average resting heart rate
    restingHeartRateStdDev: { type: Number },
    lastCalculated: { type: Date } // When baseline was last calculated
  },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);