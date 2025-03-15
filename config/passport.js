import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true, // ✅ Required to access refreshToken
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log(refreshToken, '<<<<refreshToken')
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          user.accessToken = accessToken;
          if (refreshToken) user.refreshToken = refreshToken; // ✅ Store refresh token
          await user.save();
        } else {
          user = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            picture: profile.photos[0].value,
            accessToken,
            refreshToken, // ✅ Save refresh token for future use
          });
          await user.save();
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// ✅ Serialize & Deserialize User for Sessions
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});