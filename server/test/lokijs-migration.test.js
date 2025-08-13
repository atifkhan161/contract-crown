import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import lokiConnection from '../database/loki-db.js';
import User from '../src/models/User.js';
import Room from '../src/models/Room.js';

describe('LokiJS Migration Tests', () => {
    beforeAll(async () => {
        // Initialize LokiJS for testing
        await lokiConnection.initialize();
    });

    afterAll(async () => {
        // Clean up
        if (lokiConnection.isReady()) {
            await lokiConnection.close();
        }
    });

    it('should initialize LokiJS successfully', async () => {
        expect(lokiConnection.isReady()).toBe(true);
        
        const collections = lokiConnection.getCollections();
        expect(Object.keys(collections)).toContain('users');
        expect(Object.keys(collections)).toContain('rooms');
    });

    it('should create and find users', async () => {
        const userData = {
            username: 'testuser',
            email: 'test@example.com',
            password: 'testpassword123'
        };

        const user = await User.create(userData);
        expect(user).toBeDefined();
        expect(user.username).toBe('testuser');
        expect(user.email).toBe('test@example.com');

        const foundUser = await User.findById(user.user_id);
        expect(foundUser).toBeDefined();
        expect(foundUser.username).toBe('testuser');
    });

    it('should create and find rooms', async () => {
        // First create a user to be the owner
        const userData = {
            username: 'roomowner',
            email: 'owner@example.com',
            password: 'password123'
        };
        const owner = await User.create(userData);

        const roomData = {
            name: 'Test Room',
            maxPlayers: 4,
            isPrivate: false,
            ownerId: owner.user_id
        };

        const room = await Room.create(roomData);
        expect(room).toBeDefined();
        expect(room.name).toBe('Test Room');
        expect(room.max_players).toBe(4);
        expect(room.owner_id).toBe(owner.user_id);

        const foundRoom = await Room.findById(room.room_id);
        expect(foundRoom).toBeDefined();
        expect(foundRoom.name).toBe('Test Room');
    });

    it('should handle database operations without errors', async () => {
        const healthCheck = await lokiConnection.healthCheck();
        expect(healthCheck).toBe(true);

        // Test backup functionality
        const backupPath = await lokiConnection.createBackup('test');
        expect(backupPath).toBeDefined();
        expect(typeof backupPath).toBe('string');
    });

    it('should maintain data consistency', async () => {
        // Create multiple users
        const users = [];
        for (let i = 0; i < 3; i++) {
            const user = await User.create({
                username: `user${i}`,
                email: `user${i}@example.com`,
                password: 'password123'
            });
            users.push(user);
        }

        // Verify all users exist
        for (const user of users) {
            const foundUser = await User.findById(user.user_id);
            expect(foundUser).toBeDefined();
            expect(foundUser.username).toBe(user.username);
        }

        // Test user count
        const userModel = new User();
        const userCount = await userModel.count();
        expect(userCount).toBeGreaterThanOrEqual(3);
    });
});