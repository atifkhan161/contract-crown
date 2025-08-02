import dbConnection from './database/connection.js';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        const migrationName = process.argv[2] || 'add_ready_status_and_teams';
        
        console.log('Initializing database connection...');
        await dbConnection.initialize();
        
        console.log(`Running migration: ${migrationName}.sql`);
        
        const migrationPath = path.join(process.cwd(), `database/migrations/${migrationName}.sql`);
        const migration = fs.readFileSync(migrationPath, 'utf8');
        const statements = migration.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                await dbConnection.query(statement);
                console.log('✓ Executed:', statement.substring(0, 50).replace(/\s+/g, ' ') + '...');
            }
        }
        
        console.log('✅ Migration completed successfully');
        await dbConnection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await dbConnection.close();
        process.exit(1);
    }
}

runMigration();