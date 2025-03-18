import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";
import Participant from "../models/Participant.js";
import User from "../models/User.js";

dotenv.config();

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export const getConnectionDetails = async (req, res) => {
  try {
    if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
      return res.status(500).json({ error: "Missing LiveKit environment variables" });
    }
    // Generate participant identity and room name
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
    const {email} = req.params;
    // ✅ Fix: Ensure createParticipantToken resolves before storing it
    const participantToken = await createParticipantToken({ identity: participantIdentity, email }, roomName);

    // Save participant to MongoDB
    const newParticipant = new Participant({
      identity: participantIdentity,
      roomName,
      token: participantToken,  // ✅ This must be a string, not a Promise
    });

    await newParticipant.save();

    // Return connection details
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
};


const createParticipantToken = async (userInfo, roomName) => {
  try {
    const email = userInfo.email; // ✅ Extract email from userInfo object

    if (!email) {
      throw new Error("Email is required to fetch user data");
    }

    const user = await User.findOne({ email }); // ✅ Query with the correct string

    if (!user) {
      throw new Error("User not found in database");
    }

    // ✅ Create the LiveKit token
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity: user.googleId, // Use Google ID as LiveKit identity
      metadata: JSON.stringify({
        email: user.email,
        name: user.name,
        picture: user.picture,
      }),
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
};