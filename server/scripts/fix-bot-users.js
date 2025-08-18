#!/usr/bin/env node

/**
 * USAGE:
 * cd server
 * node scripts/fix-bot-users.js
 * 
 * This script will:
 * 1. Find all bot-like users in the database
 * 2. Update their is_bot field to true
 * 3. Set default bot personality and difficulty values
 */

/**
 * Fix Bot Users Script
 * Updates existing bot users in the database to ensure is_bot field is set to true
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add the src directory to the module path
process.env.NODE_PATH = join(__dirname, '../src');

async function fixBotUsers() {
    try {
        console.log('[FixBotUsers] Starting bot user fix...');

        // Import User model
        const { default: User } = await import('../src/models/User.js');
        const userModel = new User();

        // Find all users that look like bots but don't have is_bot set
        const allUsers = await userModel.findAll();
        
        let botsFixed = 0;
        let botsFound = 0;

        for (const user of allUsers) {
            // Check if this looks like a bot user
            const isBotLike = (
                user.username.includes('Bot ') || 
                user.username.includes('_bot_') ||
                user.email.includes('@bot.local') ||
                user.user_id.startsWith('bot_') ||
                user.password_hash === 'BOT_NO_PASSWORD'
            );

            if (isBotLike) {
                botsFound++;
                console.log(`[FixBotUsers] Found bot-like user: ${user.username} (${user.user_id}), is_bot=${user.is_bot}`);

                // Update if is_bot is not true
                if (user.is_bot !== true) {
                    await userModel.updateById(user.user_id, {
                        is_bot: true,
                        bot_personality: user.bot_personality || 'balanced',
                        bot_difficulty: user.bot_difficulty || 'medium',
                        bot_aggressiveness: user.bot_aggressiveness || 0.5,
                        bot_risk_tolerance: user.bot_risk_tolerance || 0.5
                    });
                    
                    botsFixed++;
                    console.log(`[FixBotUsers] ✅ Fixed bot user: ${user.username} -> is_bot=true`);
                } else {
                    console.log(`[FixBotUsers] ✓ Bot user already correct: ${user.username}`);
                }
            }
        }

        console.log(`[FixBotUsers] ✅ Complete! Found ${botsFound} bot users, fixed ${botsFixed} users`);

        if (botsFixed > 0) {
            console.log(`[FixBotUsers] 🎉 Successfully updated ${botsFixed} bot users with is_bot=true`);
        } else {
            console.log(`[FixBotUsers] 👍 All bot users were already correctly configured`);
        }

    } catch (error) {
        console.error('[FixBotUsers] ❌ Error fixing bot users:', error);
        process.exit(1);
    }
}

// Run the fix if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    fixBotUsers()
        .then(() => {
            console.log('[FixBotUsers] Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[FixBotUsers] Script failed:', error);
            process.exit(1);
        });
}

export default fixBotUsers;