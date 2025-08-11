import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'contract_crown'
    });
    
    console.log('Running migration...');
    
    // Run individual statements
    const statements = [
      "ALTER TABLE games ADD COLUMN IF NOT EXISTS is_demo_mode BOOLEAN DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE", 
      "ALTER TABLE room_players ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ];
    
    for (const statement of statements) {
      try {
        await connection.execute(statement);
        console.log('✓ Executed:', statement);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log('✓ Column already exists:', statement);
        } else {
          console.error('✗ Error:', error.message);
        }
      }
    }
    
    console.log('Migration completed successfully');
    await connection.end();
  } catch (error) {
    console.error('Migration failed:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
  }
}

runMigration();