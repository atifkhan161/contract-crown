import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import BaseLokiModel from './BaseLokiModel.js';

class UserSession extends BaseLokiModel {
  constructor(sessionData = {}) {
    super('userSessions', sessionData);
    this.session_id = sessionData.session_id || uuidv4();
    this.user_id = sessionData.user_id;
    this.token_hash = sessionData.token_hash;
    this.expires_at = sessionData.expires_at;
    this.created_at = sessionData.created_at;
    this.last_used_at = sessionData.last_used_at;
    this.user_agent = sessionData.user_agent;
    this.ip_address = sessionData.ip_address;
  }

  // Static methods for session management
  static async create(sessionData) {
    try {
      const { user_id, token, expires_at, user_agent, ip_address } = sessionData;

      // Validate required fields
      if (!user_id || !token || !expires_at) {
        throw new Error('User ID, token, and expiration date are required');
      }

      // Hash the token for security
      const token_hash = crypto.createHash('sha256').update(token).digest('hex');

      const sessionModel = new UserSession();
      const sessionDoc = {
        session_id: uuidv4(),
        user_id,
        token_hash,
        expires_at: new Date(expires_at).toISOString(),
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        user_agent: user_agent || null,
        ip_address: ip_address || null
      };

      const createdSession = await sessionModel.create(sessionDoc);
      console.log(`[UserSession] Created session for user: ${user_id}`);

      return new UserSession(createdSession);
    } catch (error) {
      console.error('[UserSession] Create error:', error.message);
      throw error;
    }
  }

  static async findByToken(token) {
    try {
      const token_hash = crypto.createHash('sha256').update(token).digest('hex');
      const sessionModel = new UserSession();
      
      const sessionData = await sessionModel.findOne({
        token_hash,
        expires_at: { $gt: new Date().toISOString() }
      });

      if (!sessionData) {
        return null;
      }

      return new UserSession(sessionData);
    } catch (error) {
      console.error('[UserSession] FindByToken error:', error.message);
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const sessionModel = new UserSession();
      const sessions = await sessionModel.find({
        user_id: userId,
        expires_at: { $gt: new Date().toISOString() }
      });

      return sessions.map(session => new UserSession(session));
    } catch (error) {
      console.error('[UserSession] FindByUserId error:', error.message);
      throw error;
    }
  }

  static async findById(sessionId) {
    try {
      const sessionModel = new UserSession();
      const sessionData = await sessionModel.findOne({
        session_id: sessionId
      });

      if (!sessionData) {
        return null;
      }

      return new UserSession(sessionData);
    } catch (error) {
      console.error('[UserSession] FindById error:', error.message);
      throw error;
    }
  }

  async updateLastUsed() {
    try {
      const now = new Date().toISOString();
      const updatedSession = await this.updateById(this.session_id, {
        last_used_at: now
      });

      if (updatedSession) {
        this.last_used_at = now;
        console.log(`[UserSession] Updated last used for session: ${this.session_id}`);
      }
    } catch (error) {
      console.error('[UserSession] Update last used error:', error.message);
      throw error;
    }
  }

  async revoke() {
    try {
      await this.deleteById(this.session_id);
      console.log(`[UserSession] Revoked session: ${this.session_id}`);
    } catch (error) {
      console.error('[UserSession] Revoke error:', error.message);
      throw error;
    }
  }

  static async revokeAllForUser(userId) {
    try {
      const sessionModel = new UserSession();
      const sessions = await sessionModel.find({ user_id: userId });
      
      for (const session of sessions) {
        await sessionModel.deleteById(session.session_id);
      }

      console.log(`[UserSession] Revoked all sessions for user: ${userId}`);
    } catch (error) {
      console.error('[UserSession] RevokeAllForUser error:', error.message);
      throw error;
    }
  }

  static async cleanupExpired() {
    try {
      const sessionModel = new UserSession();
      const expiredSessions = await sessionModel.find({
        expires_at: { $lt: new Date().toISOString() }
      });

      for (const session of expiredSessions) {
        await sessionModel.deleteById(session.session_id);
      }

      console.log(`[UserSession] Cleaned up ${expiredSessions.length} expired sessions`);
      return expiredSessions.length;
    } catch (error) {
      console.error('[UserSession] CleanupExpired error:', error.message);
      throw error;
    }
  }

  isExpired() {
    return new Date(this.expires_at) <= new Date();
  }

  isValid() {
    return !this.isExpired();
  }

  // Return session object without sensitive data
  toSafeObject() {
    return {
      session_id: this.session_id,
      user_id: this.user_id,
      expires_at: this.expires_at,
      created_at: this.created_at,
      last_used_at: this.last_used_at,
      user_agent: this.user_agent,
      ip_address: this.ip_address
    };
  }

  // Reactive query methods
  static subscribeToUserSessions(subscriptionId, userId, callback) {
    try {
      const sessionModel = new UserSession();
      return sessionModel.subscribe(subscriptionId, { user_id: userId }, callback);
    } catch (error) {
      console.error('[UserSession] SubscribeToUserSessions error:', error.message);
      throw error;
    }
  }

  static unsubscribe(subscriptionId) {
    try {
      const sessionModel = new UserSession();
      return sessionModel.unsubscribe(subscriptionId);
    } catch (error) {
      console.error('[UserSession] Unsubscribe error:', error.message);
      return false;
    }
  }
}

export default UserSession;
