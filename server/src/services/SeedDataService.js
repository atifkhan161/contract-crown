import User from '../models/User.js';

class SeedDataService {
    constructor() {
        this.defaultUsers = [
            { username: 'atif', email: 'atif@trumpcrown.com', password: 'asdwasdw' },
            { username: 'aasim', email: 'aasim@trumpcrown.com', password: 'asdwasdw' },
            { username: 'sohail', email: 'sohail@trumpcrown.com', password: 'asdwasdw' },
            { username: 'usama', email: 'usama@trumpcrown.com', password: 'asdwasdw' }
        ];
    }

    async seedDefaultUsers() {
        try {
            let seededCount = 0;
            
            for (const userData of this.defaultUsers) {
                const existingUser = await User.findByUsername(userData.username);
                if (!existingUser) {
                    await User.create(userData);
                    seededCount++;
                    console.log(`[SeedData] Created user: ${userData.username}`);
                }
            }

            return { seededCount, totalUsers: this.defaultUsers.length };
        } catch (error) {
            console.error('[SeedData] Error seeding default users:', error.message);
            throw error;
        }
    }

    async seedAllData() {
        try {
            const userResult = await this.seedDefaultUsers();
            
            return {
                users: userResult,
                totalSeeded: userResult.seededCount,
                skipped: userResult.seededCount === 0
            };
        } catch (error) {
            console.error('[SeedData] Error seeding data:', error.message);
            throw error;
        }
    }
}

export default SeedDataService;
