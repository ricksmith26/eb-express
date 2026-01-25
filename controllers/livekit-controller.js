import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";
import Participant from "../models/Participant.js";
import User from "../models/User.js";
import Patient from "../models/PatientSchema.js";
import { dotEnvConfig } from "../config/vars.js";

dotenv.config(dotEnvConfig);

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

class LivekitController {
  constructor() {
    this.getConnectionDetails = this.getConnectionDetails.bind(this);
    this.createParticipantToken = this.createParticipantToken.bind(this);
  }

  async getConnectionDetails(req, res) {
    console.log(req.params, 'req.params<<<<');

    try {
      if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
        return res.status(500).json({ error: "Missing LiveKit environment variables" });
      }

      const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
      const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
      const { email, message } = req.params;
      const isOnboarding = req.query.isOnboarding === 'true';

      // Extract optional appointment notification params
      const appointmentDate = req.query.appointmentDate;
      const appointmentTime = req.query.appointmentTime;
      const appointmentDoctor = req.query.appointmentDoctor;

      const participantToken = await this.createParticipantToken(
        { identity: participantIdentity, email, message },
        roomName,
        { isOnboarding, appointmentDate, appointmentTime, appointmentDoctor }
      );

      const newParticipant = new Participant({
        identity: participantIdentity,
        roomName,
        token: participantToken,
      });

      await newParticipant.save();

      res.json({
        serverUrl: LIVEKIT_URL,
        roomName,
        participantToken,
        participantName: participantIdentity,
      });
    } catch (error) {
      console.error("Error in getConnectionDetails:", error);
      res.status(500).json({ error: error.message });
    }
  }

  async createParticipantToken(userInfo, roomName, { isOnboarding = false, appointmentDate, appointmentTime, appointmentDoctor } = {}) {
    try {
      const identifier = userInfo.email;

      // Check if identifier looks like an email or a device_id
      const isEmail = identifier && identifier.includes("@");

      let tokenMetadata;
      let identity;

      // Build appointment notification object if any appointment params are present
      const appointmentNotification = (appointmentDate || appointmentTime || appointmentDoctor)
        ? { date: appointmentDate, time: appointmentTime, doctor: appointmentDoctor }
        : null;

      if (isEmail) {
        // Existing flow: look up user by email
        const user = await User.findOne({ email: identifier });

        if (user) {
          identity = user.googleId;
          tokenMetadata = {
            email: user.email,
            name: user.name,
            initialPrompt: userInfo.message,
            isOnboarding,
            appointmentNotification,
          };
        } else {
          // Fallback: look up patient by email in telecom array
          const patient = await Patient.findOne({
            "telecom.system": "email",
            "telecom.value": identifier,
          });

          if (!patient) {
            throw new Error("User or Patient not found in database");
          }

          identity = patient.id;
          const patientName = patient.name?.[0]?.given?.[0] || 'Kevin'

          tokenMetadata = {
            email: identifier,
            name: patientName,
            patientId: patient.id,
            isOnboarding,
            initialPrompt: userInfo.message,
            appointmentNotification,
          };
        }
      } else {
        // Onboarding flow: use device_id as identity (no user yet)
        identity = identifier || `device_${Math.floor(Math.random() * 10_000)}`;
        tokenMetadata = {
          deviceId: identifier,
          isOnboarding,
          initialPrompt: userInfo.message,
          appointmentNotification,
        };
      }

      const at = new AccessToken(API_KEY, API_SECRET, {
        identity,
        metadata: JSON.stringify(tokenMetadata),
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      });

      return at.toJwt();
    } catch (error) {
      console.error("Error in createParticipantToken:", error);
      throw error;
    }
  }
}

export default new LivekitController();