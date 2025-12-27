import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";
import Participant from "../models/Participant.js";
import User from "../models/User.js";
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

      const participantIdentity = `voice_assistant_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const roomName = `voice_assistant_room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const { email, message } = req.params;

      const participantToken = await this.createParticipantToken(
        { identity: participantIdentity, email, message },
        roomName
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

  async createParticipantToken(userInfo, roomName) {
    try {
      const identifier = userInfo.email;

      // Check if identifier looks like an email or a device_id
      const isEmail = identifier && identifier.includes("@");

      let tokenMetadata;
      let identity;

      if (false) {
        // Existing flow: look up user by email
        const user = await User.findOne({ email: identifier });

        if (!user) {
          throw new Error("User not found in database");
        }

        identity = user.googleId;
        tokenMetadata = {
          email: user.email,
          name: user.name,
          initialPrompt: userInfo.message,
        };
      } else {
        // Onboarding flow: use device_id as identity (no user yet)
        identity = identifier || `device_${Math.floor(Math.random() * 10_000)}`;
        tokenMetadata = {
          deviceId: identifier,
          isOnboarding: true,
          initialPrompt: userInfo.message,
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