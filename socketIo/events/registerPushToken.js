import User from '../../models/User.js';

/**
 * Register a push notification token for a user
 * Event payload: { email, pushToken, platform, deviceType }
 */
const registerPushToken = (socket, users) => {
  socket.on('registerPushToken', async (data) => {
    const { email, pushToken, platform, deviceType } = data;

    if (!email || !pushToken || !platform) {
      console.error('Invalid push token registration data:', data);
      socket.emit('error', { message: 'Missing required fields: email, pushToken, platform' });
      return;
    }

    try {
      // Find the user in the database
      const user = await User.findOne({ email });

      if (!user) {
        console.error(`User not found for push token registration: ${email}`);
        socket.emit('error', { message: 'User not found' });
        return;
      }

      // Check if the token already exists for this user
      const existingTokenIndex = user.pushNotificationTokens.findIndex(
        (t) => t.token === pushToken
      );

      if (existingTokenIndex !== -1) {
        // Update the lastUsedAt timestamp for existing token
        user.pushNotificationTokens[existingTokenIndex].lastUsedAt = new Date();
        console.log(`Updated existing push token for user ${email}`);
      } else {
        // Add new push token
        user.pushNotificationTokens.push({
          token: pushToken,
          platform,
          deviceType: deviceType || 'mobile',
          registeredAt: new Date(),
          lastUsedAt: new Date(),
        });
        console.log(`Registered new push token for user ${email} (${platform})`);
      }

      // Save the updated user
      await user.save();

      // Confirm registration to the client
      socket.emit('pushTokenRegistered', {
        success: true,
        email,
        platform,
      });

      console.log(`Push token successfully registered for ${email}. Total tokens: ${user.pushNotificationTokens.length}`);
    } catch (error) {
      console.error('Error registering push token:', error);
      socket.emit('error', { message: 'Failed to register push token' });
    }
  });
};

export default registerPushToken;
