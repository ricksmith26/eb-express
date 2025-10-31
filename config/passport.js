import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js"; // Adjust path to your User model

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          let updated = false;

          // ✅ Update tokens if they have changed
          if (accessToken && user.accessToken !== accessToken) {
            user.accessToken = accessToken;
            updated = true;
          }

          if (refreshToken && user.refreshToken !== refreshToken) {
            user.refreshToken = refreshToken;
            updated = true;
          }

          if (updated) {
            await user.save();
            console.log("🔁 Updated user tokens");
          }

          return done(null, user);
        }

        // ✅ Create new user
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          accessToken,
          refreshToken,
        });

        console.log("✅ Created new user with tokens");
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ✅ Serialize user into the session (store only ID to keep session small)
passport.serializeUser((user, done) => {
  console.log("✅ Serializing user ID:", user.id);
  done(null, user.id);
});

// ✅ Deserialize user from session (fetch full user object)
passport.deserializeUser(async (id, done) => {
  try {
    console.log("🔄 Deserializing user ID:", id);
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;