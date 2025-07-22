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
      default:
        console.log('Usage: node init.js [init|reset|seed]');
        console.log('  init  - Initialize database with schema');
        console.log('  reset - Drop all tables and recreate');
        console.log('  seed  - Initialize and add test data');
    }
    
    await dbConnection.close();
    process.exit(0);
  } catch (error) {
    console.error('Database operation failed:', error.message);
    await dbConnection.close();
    process.exit(1);
  }
}