import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add the src directory to the module path
process.env.NODE_PATH = join(__dirname, '..', 'src');

async function fixBotUsers() {
    try {
        console.log('[FixBotUsers] Starting bot user fix...');

        // Initialize database connection
        const { default: LokiDB } = await import('../database/loki-db.js');
        await LokiDB.initialize();
        console.log('[FixBotUsers] Database initialized');

        // Import User model
        const { default: User } = await import('../src/models/User.js');
        const userModel = new User();

        // Find all users with bot-like usernames
        const allUsers = await userModel.find({});
        console.log(`[FixBotUsers] Found ${allUsers.length} total users`);

        let botUsersFixed = 0;

        for (const user of allUsers) {
            // Check if username contains "Bot" and is_bot is not true
            if (user.username && user.username.includes('Bot') && user.is_bot !== true) {
                console.log(`[FixBotUsers] Fixing bot user: ${user.username} (${user.user_id})`);
                
                // Update the user to set is_bot: true
                await userModel.updateMany(
                    { user_id: user.user_id },
                    { is_bot: true }
                );
                
                botUsersFixed++;
            }
        }

        console.log(`[FixBotUsers] Fixed ${botUsersFixed} bot users`);
        console.log('[FixBotUsers] Bot user fix completed successfully');

    } catch (error) {
        console.error('[FixBotUsers] Error fixing bot users:', error.message);
        process.exit(1);
    }
}

// Run the fix
fixBotUsers();