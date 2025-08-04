import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.config = {
      host: process.env.DB_HOST || '192.168.1.100',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'casaos',
      database: process.env.DB_NAME || 'contract_crown',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    };
  }

  async initialize() {
    try {
      // Create connection pool
      this.pool = mysql.createPool(this.config);

      // Test the connection
      const connection = await this.pool.getConnection();
      console.log('[Database] Connected to MariaDB successfully');
      connection.release();

      return this.pool;
    } catch (error) {
      console.error('[Database] Connection failed:', error.message);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('[Database] Query error:', error.message);
      console.error('[Database] SQL:', sql);
      console.error('[Database] Params:', params);
      throw error;
    }
  }

  async transaction(callback) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await callback(connection);

      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      console.error('[Database] Transaction error:', error.message);
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('[Database] Connection pool closed');
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.length > 0;
    } catch (error) {
      console.error('[Database] Health check failed:', error.message);
      return false;
    }
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

export default dbConnection;