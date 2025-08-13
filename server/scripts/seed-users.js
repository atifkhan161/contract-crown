#!/usr/bin/env node

import lokiConnection from '../database/loki-db.js';
import SeedDataService from '../src/services/SeedDataService.js';

async function seedUsers() {
    try {
        console.log('[Seed] Initializing database...');
        await lokiConnection.initialize();
        
        console.log('[Seed] Seeding default users...');
        const seedService = new SeedDataService();
        const result = await seedService.seedAllData();
        
        if (result.totalSeeded > 0) {
            console.log(`[Seed] Successfully created ${result.totalSeeded} users`);
        } else {
            console.log('[Seed] All users already exist');
        }
        
        await lokiConnection.close();
        console.log('[Seed] Seeding completed');
    } catch (error) {
        console.error('[Seed] Seeding failed:', error.message);
        process.exit(1);
    }
}

seedUsers();