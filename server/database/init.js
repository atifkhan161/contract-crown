import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dbConnection from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseInitializer {
  constructor() {
    this.schemaPath = path.join(__dirname, 'schema.sql');
  }

  async initialize() {
    try {
      console.log('[Database] Starting database initialization...');

      // Initialize connection pool
      await dbConnection.initialize();

      // Read and execute schema
      await this.executeSchema();

      // Verify tables were created
      await this.verifyTables();

      console.log('[Database] Database initialization completed successfully');
      return true;
    } catch (error) {
      console.error('[Database] Initialization failed:', error.message);
      throw error;
    }
  }

  async executeSchema() {
    try {
      const schemaSQL = await fs.readFile(this.schemaPath, 'utf8');

      // Remove comments and split by semicolon
      const cleanSQL = schemaSQL
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');

      const statements = cleanSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      console.log(`[Database] Executing ${statements.length} SQL statements...`);

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await dbConnection.query(statement);
            console.log(`[Database] Executed: ${statement.substring(0, 50)}...`);
          } catch (error) {
            console.error(`[Database] Failed to execute statement: ${statement.substring(0, 50)}...`);
            console.error(`[Database] Error: ${error.message}`);
            throw error;
          }
        }
      }

      console.log('[Database] Schema executed successfully');
    } catch (error) {
      console.error('[Database] Schema execution failed:', error.message);
      throw error;
    }
  }

  async verifyTables() {
    try {
      const tables = await dbConnection.query('SHOW TABLES');
      const tableNames = tables.map(row => Object.values(row)[0]);

      const expectedTables = [
        'users',
        'games',
        'teams',
        'game_players',
        'game_rounds',
        'game_tricks',
        'user_sessions'
      ];

      console.log('[Database] Found tables:', tableNames);

      const missingTables = expectedTables.filter(table => !tableNames.includes(table));

      if (missingTables.length > 0) {
        throw new Error(`Missing tables: ${missingTables.join(', ')}`);
      }

      console.log('[Database] All required tables verified');
      return true;
    } catch (error) {
      console.error('[Database] Table verification failed:', error.message);
      throw error;
    }
  }

  async reset() {
    try {
      console.log('[Database] Resetting database...');

      // Initialize connection pool first
      await dbConnection.initialize();

      const tables = [
        'game_tricks',
        'game_rounds',
        'game_players',
        'teams',
        'games',
        'user_sessions',
        'users'
      ];

      // Drop tables in reverse order to handle foreign key constraints
      for (const table of tables) {
        try {
          await dbConnection.query(`DROP TABLE IF EXISTS ${table}`);
          console.log(`[Database] Dropped table: ${table}`);
        } catch (error) {
          console.warn(`[Database] Could not drop table ${table}:`, error.message);
        }
      }

      // Recreate schema
      await this.executeSchema();
      await this.verifyTables();

      console.log('[Database] Database reset completed');
      return true;
    } catch (error) {
      console.error('[Database] Database reset failed:', error.message);
      throw error;
    }
  }

  async migrateRoomCodes() {
    try {
      console.log('[Database] Migrating room codes...');

      // Check if version column exists, add if not
      try {
        await dbConnection.query('SELECT version FROM rooms LIMIT 1');
        console.log('[Database] Version column already exists');
      } catch (error) {
        console.log('[Database] Adding version column to rooms table...');
        await dbConnection.query('ALTER TABLE rooms ADD COLUMN version INT DEFAULT 1');
        console.log('[Database] Version column added successfully');
      }

      // Update invite_code column to be 5 characters if it's longer
      try {
        await dbConnection.query('ALTER TABLE rooms MODIFY COLUMN invite_code VARCHAR(5)');
        console.log('[Database] Updated invite_code column to VARCHAR(5)');
      } catch (error) {
        console.warn('[Database] Could not modify invite_code column:', error.message);
      }

      // Update existing rooms to have version = 1 if NULL
      const result = await dbConnection.query('UPDATE rooms SET version = 1 WHERE version IS NULL');
      if (result.affectedRows > 0) {
        console.log(`[Database] Updated ${result.affectedRows} rooms with version = 1`);
      }

      // Generate 5-digit codes for existing rooms that have longer codes or no codes
      const roomsNeedingCodes = await dbConnection.query(`
        SELECT room_id, invite_code FROM rooms 
        WHERE invite_code IS NULL OR LENGTH(invite_code) != 5
      `);

      if (roomsNeedingCodes.length > 0) {
        console.log(`[Database] Generating 5-digit codes for ${roomsNeedingCodes.length} rooms...`);

        for (const room of roomsNeedingCodes) {
          const newCode = this.generateRoomCode();
          await dbConnection.query(
            'UPDATE rooms SET invite_code = ? WHERE room_id = ?',
            [newCode, room.room_id]
          );
          console.log(`[Database] Updated room ${room.room_id} with code ${newCode}`);
        }
      }

      console.log('[Database] Room code migration completed successfully');
      return true;
    } catch (error) {
      console.error('[Database] Room code migration failed:', error.message);
      throw error;
    }
  }

  generateRoomCode() {
    // Generate a 5-digit code using numbers and uppercase letters (excluding confusing characters)
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluded I, O for clarity
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async seedTestData() {
    try {
      console.log('[Database] Seeding test data...');

      // Create test user
      const testUserId = 'test-user-uuid-1234';
      await dbConnection.query(`
        INSERT IGNORE INTO users (user_id, username, email, password_hash)
        VALUES (?, ?, ?, ?)
      `, [
        testUserId,
        'testuser',
        'test@example.com',
        '$2b$12$dummy.hash.for.testing.purposes.only'
      ]);

      console.log('[Database] Test data seeded successfully');
      return true;
    } catch (error) {
      console.error('[Database] Test data seeding failed:', error.message);
      throw error;
    }
  }
}

// Export for use in other modules
export default DatabaseInitializer;

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const initializer = new DatabaseInitializer();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'init':
        await initializer.initialize();
        break;
      case 'reset':
        await initializer.reset();
        break;
      case 'seed':
        await initializer.initialize();
        await initializer.seedTestData();
        break;
      case 'migrate-rooms':
        await initializer.initialize();
        await initializer.migrateRoomCodes();
        break;
      default:
        console.log('Usage: node init.js [init|reset|seed|migrate-rooms]');
        console.log('  init         - Initialize database with schema');
        console.log('  reset        - Drop all tables and recreate');
        console.log('  seed         - Initialize and add test data');
        console.log('  migrate-rooms - Migrate existing rooms to use 5-digit codes');
    }

    await dbConnection.close();
    process.exit(0);
  } catch (error) {
    console.error('Database operation failed:', error.message);
    await dbConnection.close();
    process.exit(1);
  }
}