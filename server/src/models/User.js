import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import BaseRxDBModel from './BaseRxDBModel.js';

class User extends BaseRxDBModel {
  constructor(userData = {}) {
    super('users', userData);
    this.user_id = userData.user_id || uuidv4();
    this.username = userData.username;
    this.email = userData.email;
    this.password_hash = userData.password_hash;
    this.created_at = userData.created_at;
    this.last_login = userData.last_login;
    this.total_games_played = userData.total_games_played || 0;
    this.total_games_won = userData.total_games_won || 0;
    this.is_active = userData.is_active !== undefined ? userData.is_active : true;
    this.is_bot = userData.is_bot || false;
  }

  // Static methods for database operations
  static async create(userData) {
    try {
      const { username, email, password } = userData;

      // Validate required fields
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
      }

      // Validate input format
      if (!User.validateEmail(email)) {
        throw new Error('Invalid email format');
      }

      if (!User.validateUsername(username)) {
        throw new Error('Invalid username format');
      }

      if (!User.validatePassword(password)) {
        throw new Error('Invalid password format');
      }

      // Check if user already exists
      const existingUser = await User.findByEmailOrUsername(email, username);
      if (existingUser) {
        if (existingUser.email === email) {
          throw new Error('Email already registered');
        }
        if (existingUser.username === username) {
          throw new Error('Username already taken');
        }
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const password_hash = await bcrypt.hash(password, saltRounds);

      // Create user data
      const userModel = new User();
      const newUserData = {
        user_id: uuidv4(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password_hash,
        total_games_played: 0,
        total_games_won: 0,
        is_active: true,
        is_bot: false
      };

      // Insert into RxDB
      const createdDoc = await userModel.create(newUserData);

      console.log(`[User] Created new user: ${createdDoc.username} (${createdDoc.user_id})`);

      // Return user without password hash
      const user = new User(createdDoc);
      return user.toSafeObject();
    } catch (error) {
      console.error('[User] Create error:', error.message);
      throw error;
    }
  }

  static async findById(userId) {
    try {
      const userModel = new User();
      const userData = await userModel.findOne({
        user_id: userId,
        is_active: true
      });

      if (!userData) {
        return null;
      }

      return new User(userData);
    } catch (error) {
      console.error('[User] FindById error:', error.message);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const userModel = new User();
      const userData = await userModel.findOne({
        email: email.trim().toLowerCase(),
        is_active: true
      });

      if (!userData) {
        return null;
      }

      return new User(userData);
    } catch (error) {
      console.error('[User] FindByEmail error:', error.message);
      throw error;
    }
  }

  static async findByUsername(username) {
    try {
      const userModel = new User();
      const userData = await userModel.findOne({
        username: username.trim(),
        is_active: true
      });

      if (!userData) {
        return null;
      }

      return new User(userData);
    } catch (error) {
      console.error('[User] FindByUsername error:', error.message);
      throw error;
    }
  }

  static async findByEmailOrUsername(email, username) {
    try {
      const userModel = new User();

      // RxDB doesn't support OR queries directly, so we need to check both separately
      const emailUser = await userModel.findOne({
        email: email.trim().toLowerCase(),
        is_active: true
      });

      if (emailUser) {
        return new User(emailUser);
      }

      const usernameUser = await userModel.findOne({
        username: username.trim(),
        is_active: true
      });

      if (usernameUser) {
        return new User(usernameUser);
      }

      return null;
    } catch (error) {
      console.error('[User] FindByEmailOrUsername error:', error.message);
      throw error;
    }
  }

  async verifyPassword(password) {
    try {
      return await bcrypt.compare(password, this.password_hash);
    } catch (error) {
      console.error('[User] Password verification error:', error.message);
      return false;
    }
  }

  async updateLastLogin() {
    try {
      const now = new Date().toISOString();
      const updatedUser = await this.updateById(this.user_id, {
        last_login: now
      });

      if (updatedUser) {
        this.last_login = now;
        console.log(`[User] Updated last login for user: ${this.username}`);
      }
    } catch (error) {
      console.error('[User] Update last login error:', error.message);
      throw error;
    }
  }

  async updateGameStats(won = false) {
    try {
      const updateData = {
        total_games_played: this.total_games_played + 1
      };

      if (won) {
        updateData.total_games_won = this.total_games_won + 1;
      }

      const updatedUser = await this.updateById(this.user_id, updateData);

      if (updatedUser) {
        this.total_games_played += 1;
        if (won) {
          this.total_games_won += 1;
        }
        console.log(`[User] Updated game stats for user: ${this.username}`);
      }
    } catch (error) {
      console.error('[User] Update game stats error:', error.message);
      throw error;
    }
  }

  // Return user object without sensitive data
  toSafeObject() {
    return {
      user_id: this.user_id,
      username: this.username,
      email: this.email,
      created_at: this.created_at,
      last_login: this.last_login,
      total_games_played: this.total_games_played,
      total_games_won: this.total_games_won,
      is_active: this.is_active
    };
  }

  // Reactive query methods
  static subscribeToUser(subscriptionId, userId, callback) {
    try {
      const userModel = new User();
      return userModel.subscribeById(subscriptionId, userId, callback);
    } catch (error) {
      console.error('[User] SubscribeToUser error:', error.message);
      throw error;
    }
  }

  static subscribeToUsers(subscriptionId, query, callback) {
    try {
      const userModel = new User();
      return userModel.subscribe(subscriptionId, query, callback);
    } catch (error) {
      console.error('[User] SubscribeToUsers error:', error.message);
      throw error;
    }
  }

  static subscribeToActiveUsers(subscriptionId, callback) {
    try {
      const userModel = new User();
      return userModel.subscribe(subscriptionId, { is_active: true }, callback);
    } catch (error) {
      console.error('[User] SubscribeToActiveUsers error:', error.message);
      throw error;
    }
  }

  static unsubscribe(subscriptionId) {
    try {
      const userModel = new User();
      return userModel.unsubscribe(subscriptionId);
    } catch (error) {
      console.error('[User] Unsubscribe error:', error.message);
      return false;
    }
  }

  // Instance method to subscribe to this user's changes
  subscribeToChanges(subscriptionId, callback) {
    try {
      return this.subscribeById(subscriptionId, this.user_id, callback);
    } catch (error) {
      console.error('[User] SubscribeToChanges error:', error.message);
      throw error;
    }
  }

  // Validation methods
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateUsername(username) {
    // Username: 3-50 characters, alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
    return usernameRegex.test(username);
  }

  static validatePassword(password) {
    // Password: at least 6 characters
    return password && password.length >= 6;
  }
}

export default User;