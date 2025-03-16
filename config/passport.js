import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js"; // Adjust path to your User model

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true, // ✅ Ensures full control over request
    },
    async (request, accessToken, refreshToken, profile, done) => {
      console.error(profile, '<><><><><>profile<<<<<<<')
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            picture: profile.photos[0].value,
            accessToken: accessToken,
            refreshToken: refreshToken,
          });
          await user.save();
        }

        console.log("✅ User authenticated, passing to serializeUser:", user);

        return done(null, user);
      } catch (error) {
        return done(error, null);
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