/**
 * AWS Cognito Service
 * Handles user management operations with AWS Cognito User Pool
 *
 * Used for:
 * - Creating new admin portal users
 * - Enabling/disabling users
 * - Password management
 * - User attribute updates
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand
} from '@aws-sdk/client-cognito-identity-provider';

const {
  COGNITO_USER_POOL_ID,
  COGNITO_REGION
} = process.env;

// Initialize Cognito client
let cognitoClient = null;

const getClient = () => {
  if (!cognitoClient && COGNITO_REGION) {
    cognitoClient = new CognitoIdentityProviderClient({
      region: COGNITO_REGION
    });
  }
  return cognitoClient;
};

class CognitoService {
  /**
   * Check if Cognito is configured
   */
  isConfigured() {
    return !!(COGNITO_USER_POOL_ID && COGNITO_REGION);
  }

  /**
   * Create a new Cognito user
   * Sends invitation email with temporary password
   *
   * @param {Object} params
   * @param {string} params.email - User's email address
   * @param {string} params.firstName - User's first name
   * @param {string} params.lastName - User's last name
   * @param {string} [params.temporaryPassword] - Optional temporary password
   * @returns {Promise<{username: string, sub: string, status: string}>}
   */
  async createUser({ email, firstName, lastName, temporaryPassword = null }) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const params = {
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: email.toLowerCase(),
      UserAttributes: [
        { Name: 'email', Value: email.toLowerCase() },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName }
      ],
      DesiredDeliveryMediums: ['EMAIL'],
      ForceAliasCreation: false
    };

    if (temporaryPassword) {
      params.TemporaryPassword = temporaryPassword;
      params.MessageAction = 'SUPPRESS'; // Don't send welcome email if we provide password
    }

    const command = new AdminCreateUserCommand(params);
    const response = await client.send(command);

    return {
      username: response.User.Username,
      sub: response.User.Attributes.find(a => a.Name === 'sub')?.Value,
      status: response.User.UserStatus,
      enabled: response.User.Enabled
    };
  }

  /**
   * Get Cognito user by username (email)
   *
   * @param {string} username - Username or email
   * @returns {Promise<Object>}
   */
  async getUser(username) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminGetUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase()
    });

    const response = await client.send(command);

    return {
      username: response.Username,
      sub: response.UserAttributes.find(a => a.Name === 'sub')?.Value,
      email: response.UserAttributes.find(a => a.Name === 'email')?.Value,
      firstName: response.UserAttributes.find(a => a.Name === 'given_name')?.Value,
      lastName: response.UserAttributes.find(a => a.Name === 'family_name')?.Value,
      emailVerified: response.UserAttributes.find(a => a.Name === 'email_verified')?.Value === 'true',
      status: response.UserStatus,
      enabled: response.Enabled,
      createdAt: response.UserCreateDate,
      updatedAt: response.UserLastModifiedDate
    };
  }

  /**
   * Check if user exists in Cognito
   *
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  async userExists(email) {
    try {
      await this.getUser(email);
      return true;
    } catch (error) {
      if (error.name === 'UserNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Disable a Cognito user
   *
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  async disableUser(username) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminDisableUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase()
    });

    await client.send(command);
    return true;
  }

  /**
   * Enable a Cognito user
   *
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  async enableUser(username) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminEnableUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase()
    });

    await client.send(command);
    return true;
  }

  /**
   * Delete a Cognito user
   *
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  async deleteUser(username) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminDeleteUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase()
    });

    await client.send(command);
    return true;
  }

  /**
   * Update user attributes
   *
   * @param {string} username
   * @param {Object} attributes - Key-value pairs of attributes to update
   * @returns {Promise<boolean>}
   */
  async updateUserAttributes(username, attributes) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    // Map common attribute names to Cognito attribute names
    const attributeMap = {
      firstName: 'given_name',
      lastName: 'family_name',
      email: 'email',
      phone: 'phone_number',
      picture: 'picture'
    };

    const userAttributes = Object.entries(attributes).map(([key, value]) => ({
      Name: attributeMap[key] || key,
      Value: value
    }));

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase(),
      UserAttributes: userAttributes
    });

    await client.send(command);
    return true;
  }

  /**
   * Set user password (admin reset)
   *
   * @param {string} username
   * @param {string} password
   * @param {boolean} [permanent=true] - If true, password is permanent; if false, user must change it
   * @returns {Promise<boolean>}
   */
  async setPassword(username, password, permanent = true) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase(),
      Password: password,
      Permanent: permanent
    });

    await client.send(command);
    return true;
  }

  /**
   * List users with optional pagination and filter
   *
   * @param {Object} options
   * @param {number} [options.limit=60] - Max users to return
   * @param {string} [options.paginationToken] - Token for pagination
   * @param {string} [options.filter] - Cognito filter expression
   * @returns {Promise<{users: Array, paginationToken: string}>}
   */
  async listUsers(options = {}) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const { limit = 60, paginationToken = null, filter = null } = options;

    const params = {
      UserPoolId: COGNITO_USER_POOL_ID,
      Limit: Math.min(limit, 60) // Cognito max is 60
    };

    if (paginationToken) params.PaginationToken = paginationToken;
    if (filter) params.Filter = filter;

    const command = new ListUsersCommand(params);
    const response = await client.send(command);

    return {
      users: response.Users.map(u => ({
        username: u.Username,
        sub: u.Attributes.find(a => a.Name === 'sub')?.Value,
        email: u.Attributes.find(a => a.Name === 'email')?.Value,
        firstName: u.Attributes.find(a => a.Name === 'given_name')?.Value,
        lastName: u.Attributes.find(a => a.Name === 'family_name')?.Value,
        status: u.UserStatus,
        enabled: u.Enabled,
        createdAt: u.UserCreateDate
      })),
      paginationToken: response.PaginationToken || null
    };
  }

  /**
   * Add user to a Cognito group
   *
   * @param {string} username
   * @param {string} groupName
   * @returns {Promise<boolean>}
   */
  async addUserToGroup(username, groupName) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminAddUserToGroupCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase(),
      GroupName: groupName
    });

    await client.send(command);
    return true;
  }

  /**
   * Remove user from a Cognito group
   *
   * @param {string} username
   * @param {string} groupName
   * @returns {Promise<boolean>}
   */
  async removeUserFromGroup(username, groupName) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminRemoveUserFromGroupCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase(),
      GroupName: groupName
    });

    await client.send(command);
    return true;
  }

  /**
   * Get groups for a user
   *
   * @param {string} username
   * @returns {Promise<string[]>}
   */
  async getUserGroups(username) {
    const client = getClient();
    if (!client) throw new Error('Cognito not configured');

    const command = new AdminListGroupsForUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username.toLowerCase()
    });

    const response = await client.send(command);
    return response.Groups.map(g => g.GroupName);
  }

  /**
   * Find users by email (partial match)
   *
   * @param {string} email
   * @returns {Promise<Array>}
   */
  async findUsersByEmail(email) {
    return this.listUsers({
      filter: `email ^= "${email.toLowerCase()}"`
    });
  }
}

// Export singleton instance
export default new CognitoService();
