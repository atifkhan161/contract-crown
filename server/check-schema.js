import dbConnection from './database/connection.js';

async function checkSchema() {
    try {
        console.log('Checking database schema...');
        await dbConnection.initialize();
        
        // Check games table structure
        const gamesColumns = await dbConnection.query('DESCRIBE games');
        console.log('\nGames table columns:');
        gamesColumns.forEach(col => {
            console.log(`- ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
        });
        
        // Check users table structure
        const usersColumns = await dbConnection.query('DESCRIBE users');
        console.log('\nUsers table columns:');
        usersColumns.forEach(col => {
            console.log(`- ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
        });
        
        await dbConnection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        await dbConnection.close();
        process.exit(1);
    }
}

checkSchema();