import path from 'path';
import loki from 'lokijs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_PATH = path.join(__dirname, '../data/lokijs');
const DB_NAME = 'trump_crown_db.json';
const DB_FILE = path.join(DB_PATH, DB_NAME);

function updateUserBotStatus() {
    return new Promise((resolve, reject) => {
        const db = new loki(DB_FILE, {
            autoload: true,
            autoloadCallback: () => {
                try {
                    const users = db.getCollection('users');
                    
                    if (!users) {
                        console.log('Users collection not found');
                        return reject(new Error('Users collection not found'));
                    }

                    let updatedCount = 0;
                    const allUsers = users.find();

                    allUsers.forEach(user => {
                        let needsUpdate = false;
                        
                        // Check if is_bot field is missing
                        if (user.is_bot === undefined) {
                            // Set is_bot based on username prefix
                            user.is_bot = user.username.startsWith('Bot');
                            needsUpdate = true;
                        }
                        
                        if (needsUpdate) {
                            user.updated_at = new Date().toISOString();
                            users.update(user);
                            updatedCount++;
                            console.log(`Updated user: ${user.username} - is_bot: ${user.is_bot}`);
                        }
                    });

                    if (updatedCount > 0) {
                        db.saveDatabase(() => {
                            console.log(`Successfully updated ${updatedCount} users`);
                            resolve(updatedCount);
                        });
                    } else {
                        console.log('No users needed updating');
                        resolve(0);
                    }
                } catch (error) {
                    reject(error);
                }
            },
            autosave: true,
            autosaveInterval: 4000
        });
    });
}

// Run the script
updateUserBotStatus()
    .then(count => {
        console.log(`Script completed. Updated ${count} users.`);
        process.exit(0);
    })
    .catch(error => {
        console.error('Error updating users:', error);
        process.exit(1);
    });

export default updateUserBotStatus;