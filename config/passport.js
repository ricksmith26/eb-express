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

          // ✅ Update name if it has changed
          const profileName = profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName;
          if (profileName && user.name !== profileName) {
            user.name = profileName;
            updated = true;
          }

          // ✅ Update picture if it has changed
          const profilePicture = profile.photos?.[0]?.value;
          if (profilePicture && user.picture !== profilePicture) {
            user.picture = profilePicture;
            updated = true;
          }

          if (updated) {
            await user.save();
            console.log("🔁 Updated user profile");
          }

          return done(null, user);
        }

        // ✅ Create new user
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName,
          email: profile.emails[0].value,
          picture: profile.photos?.[0]?.value,
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