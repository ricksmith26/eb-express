import { google } from "googleapis";

const TokenController = {
      async refreshAccessToken(user) {
            try {
              const auth = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_CALLBACK_URL
              );
          
              auth.setCredentials({ refresh_token: user.refreshToken });
          
              const { credentials } = await auth.refreshAccessToken(); // ✅ Get new access token
          
              // ✅ Update user with new token
              user.accessToken = credentials.access_token;
              user.refreshToken = credentials.refresh_token;
              await user.save();
          
              return credentials.access_token;
            } catch (error) {
              console.error("Failed to refresh access token:", error);
              return null;
            }
          }
}

export default TokenController;