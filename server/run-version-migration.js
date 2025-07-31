import dbConnection from './database/connection.js';
import fs from 'fs';
import path from 'path';

async function runVersionMigration() {
    try {
        console.log('Initializing database connection...');
        await dbConnection.initialize();
        
        console.log('Running migration: add_version_column.sql');
        
        const migrationPath = path.join(process.cwd(), 'database/migrations/add_version_column.sql');
        const migration = fs.readFileSync(migrationPath, 'utf8');
        const statements = migration.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await dbConnection.query(statement);
                    console.log('✓ Executed:', statement.substring(0, 80).replace(/\s+/g, ' ') + '...');
                } catch (error) {
                    // Check if column already exists
                    if (error.code === 'ER_DUP_FIELDNAME') {
                        console.log('⚠️ Column already exists, skipping:', statement.substring(0, 50).replace(/\s+/g, ' ') + '...');
                    } else {
                        throw error;
                    }
                }
            }
        }
        
        console.log('✅ Version column migration completed successfully');
        await dbConnection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        await dbConnection.close();
        process.exit(1);
    }
}

runVersionMigration();