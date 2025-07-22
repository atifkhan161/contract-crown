import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import dbConnection from '../database/connection.js';

class User {
  constructor(userData = {}) {
    this.user_id = userData.user_id || uuidv4();
    this.username = userData.username;
    this.email = userData.email;
    this.password_hash = userData.password_hash;
    this.created_at = userData.created_at;
    this.last_login = userData.last_login;
    this.total_games_played = userData.total_games_played || 0;
    this.total_games_won = userData.total_games_won || 0;
    this.is_active = userData.is_active !== undefined ? userData.is_active : true;
  }

  // Static methods for database operations
  static async create(userData) {
    try {
      const { username, email, password } = userData;
      
      // Validate required fields
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
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

      // Create user instance
      const user = new User({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password_hash
      });

      // Insert into database
      await dbConnection.query(`
        INSERT INTO users (user_id, username, email, password_hash, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [user.user_id, user.username, user.email, user.password_hash]);

      console.log(`[User] Created new user: ${user.username} (${user.user_id})`);
      
      // Return user without password hash
      return user.toSafeObject();
    } catch (error) {
      console.error('[User] Create error:', error.message);
      throw error;
    }
  }

  static async findById(userId) {
    try {
      const rows = await dbConnection.query(`
        SELECT * FROM users WHERE user_id = ? AND is_active = TRUE
      `, [userId]);

      if (rows.length === 0) {
        return null;
      }

      return new User(rows[0]);
    } catch (error) {
      console.error('[User] FindById error:', error.message);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const rows = await dbConnection.query(`
        SELECT * FROM users WHERE email = ? AND is_active = TRUE
      `, [email.trim().toLowerCase()]);

      if (rows.length === 0) {
        return null;
      }

      return new User(rows[0]);
    } catch (error) {
      console.error('[User] FindByEmail error:', error.message);
      throw error;
    }
  }

  static async findByUsername(username) {
    try {
      const rows = await dbConnection.query(`
        SELECT * FROM users WHERE username = ? AND is_active = TRUE
      `, [username.trim()]);

      if (rows.length === 0) {
        return null;
      }

      return new User(rows[0]);
    } catch (error) {
      console.error('[User] FindByUsername error:', error.message);
      throw error;
    }
  }

  static async findByEmailOrUsername(email, username) {
    try {
      const rows = await dbConnection.query(`
        SELECT * FROM users 
        WHERE (email = ? OR username = ?) AND is_active = TRUE
      `, [email.trim().toLowerCase(), username.trim()]);

      if (rows.length === 0) {
        return null;
      }

      return new User(rows[0]);
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
      await dbConnection.query(`
        UPDATE users SET last_login = NOW() WHERE user_id = ?
      `, [this.user_id]);

      this.last_login = new Date();
      console.log(`[User] Updated last login for user: ${this.username}`);
    } catch (error) {
      console.error('[User] Update last login error:', error.message);
      throw error;
    }
  }

  async updateGameStats(won = false) {
    try {
      const query = won 
        ? 'UPDATE users SET total_games_played = total_games_played + 1, total_games_won = total_games_won + 1 WHERE user_id = ?'
        : 'UPDATE users SET total_games_played = total_games_played + 1 WHERE user_id = ?';

      await dbConnection.query(query, [this.user_id]);

      this.total_games_played += 1;
      if (won) {
        this.total_games_won += 1;
      }

      console.log(`[User] Updated game stats for user: ${this.username}`);
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