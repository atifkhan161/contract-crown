import User from '../models/User.js';

/**
 * SeedDataService - Handles seeding default data into the database
 */
class SeedDataService {
    constructor() {
        this.defaultUsers = [
            {
                username: 'aasim',
                email: 'aasim@contractcrown.com',
                password: 'asdwasdw'
            },
            {
                username: 'atif',
                email: 'atif@contractcrown.com',
                password: 'asdwasdw'
            },
            {
                username: 'sohail',
                email: 'sohail@contractcrown.com',
                password: 'asdwasdw'
            },
            {
                username: 'usama',
                email: 'usama@contractcrown.com',
                password: 'asdwasdw'
            }
        ];
    }

    /**
     * Seed default users into the database (only missing ones)
     * @returns {Promise<Array>} Array of users (existing + newly created)
     */
    async seedDefaultUsers() {
        try {
            const createdUsers = [];
            let newUsersCount = 0;
            let existingUsersCount = 0;

            for (const userData of this.defaultUsers) {
                try {
                    // Check if user already exists
                    const existingUser = await User.findByUsername(userData.username);

                    if (existingUser) {
                        createdUsers.push({ ...existingUser.toSafeObject(), _isNewlyCreated: false });
                        existingUsersCount++;
                        continue;
                    }

                    // Create the user
                    const newUser = await User.create(userData);
                    console.log(`[SeedDataService] Created default user: ${userData.username}`);
                    createdUsers.push({ ...newUser, _isNewlyCreated: true });
                    newUsersCount++;

                } catch (userError) {
                    if (userError.message.includes('already registered') || userError.message.includes('already taken')) {
                        // Try to find the existing user
                        const existingUser = await User.findByUsername(userData.username);
                        if (existingUser) {
                            createdUsers.push({ ...existingUser.toSafeObject(), _isNewlyCreated: false });
                            existingUsersCount++;
                        }
                    } else {
                        console.error(`[SeedDataService] Failed to create user ${userData.username}:`, userError.message);
                        throw userError;
                    }
                }
            }

            if (newUsersCount > 0) {
                console.log(`[SeedDataService] Created ${newUsersCount} new default users, ${existingUsersCount} already existed`);
            } else if (existingUsersCount > 0) {
                console.log(`[SeedDataService] All ${existingUsersCount} default users already exist`);
            }
            
            return createdUsers;

        } catch (error) {
            console.error('[SeedDataService] Failed to seed default users:', error.message);
            throw error;
        }
    }

    /**
     * Check if all default users exist
     * @returns {Promise<boolean>} True if all default users exist
     */
    async allDefaultUsersExist() {
        try {
            let existingCount = 0;
            for (const userData of this.defaultUsers) {
                const user = await User.findByUsername(userData.username);
                if (user) {
                    existingCount++;
                }
            }
            const allExist = existingCount === this.defaultUsers.length;
            console.log(`[SeedDataService] ${existingCount}/${this.defaultUsers.length} default users exist`);
            return allExist;
        } catch (error) {
            console.error('[SeedDataService] Failed to check if all default users exist:', error.message);
            return false;
        }
    }

    /**
     * Seed all default data (only if needed)
     * @returns {Promise<Object>} Summary of seeded data
     */
    async seedAllData() {
        try {
            // Check if all default users already exist
            const allExist = await this.allDefaultUsersExist();
            
            if (allExist) {
                console.log('[SeedDataService] All default users already exist, skipping seeding');
                return {
                    users: this.defaultUsers.length,
                    totalSeeded: 0,
                    skipped: true
                };
            }

            console.log('[SeedDataService] Some default users missing, starting seeding...');
            const users = await this.seedDefaultUsers();

            // Count newly created users
            const newlyCreated = users.filter(u => u._isNewlyCreated);
            
            const summary = {
                users: users.length,
                totalSeeded: newlyCreated.length,
                skipped: false
            };

            console.log('[SeedDataService] Seeding completed successfully:', summary);
            return summary;

        } catch (error) {
            console.error('[SeedDataService] Failed to seed data:', error.message);
            throw error;
        }
    }

    /**
     * Check if default users exist
     * @returns {Promise<Object>} Status of default users
     */
    async checkDefaultUsers() {
        try {
            const userStatus = {};

            for (const userData of this.defaultUsers) {
                const user = await User.findByUsername(userData.username);
                userStatus[userData.username] = {
                    exists: !!user,
                    user_id: user?.user_id || null,
                    email: user?.email || null
                };
            }

            return userStatus;

        } catch (error) {
            console.error('[SeedDataService] Failed to check default users:', error.message);
            throw error;
        }
    }

    /**
     * Reset default users (delete and recreate)
     * @returns {Promise<Array>} Array of recreated users
     */
    async resetDefaultUsers() {
        try {
            console.log('[SeedDataService] Resetting default users...');

            // Note: We don't delete existing users to preserve data integrity
            // Instead, we just ensure they exist with correct data
            return await this.seedDefaultUsers();

        } catch (error) {
            console.error('[SeedDataService] Failed to reset default users:', error.message);
            throw error;
        }
    }
}

export default SeedDataService;