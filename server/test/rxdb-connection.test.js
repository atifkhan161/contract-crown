import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import rxdbConnection from '../database/rxdb-connection.js';

describe('RxDB Connection', () => {
  beforeAll(async () => {
    await rxdbConnection.initialize();
  });

  afterAll(async () => {
    await rxdbConnection.gracefulShutdown();
  });

  it('should initialize successfully', () => {
    expect(rxdbConnection.isReady()).toBe(true);
  });

  it('should have a database instance', () => {
    const db = rxdbConnection.getDatabase();
    expect(db).toBeDefined();
    expect(db.name).toBe('contract_crown_rxdb');
  });

  it('should pass health check', async () => {
    const isHealthy = await rxdbConnection.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should be able to add a test collection', async () => {
    const testSchema = {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 255 },
        created_at: { type: 'string', format: 'date-time' }
      },
      required: ['id', 'name']
    };

    const collection = await rxdbConnection.addCollection('test', testSchema);
    expect(collection).toBeDefined();
    expect(rxdbConnection.getCollection('test')).toBe(collection);
  });

  it('should be able to insert and query documents', async () => {
    const testCollection = rxdbConnection.getCollection('test');
    
    const testDoc = {
      id: 'test-1',
      name: 'Test Document',
      created_at: new Date().toISOString()
    };

    await testCollection.insert(testDoc);
    
    const foundDoc = await testCollection.findOne('test-1').exec();
    expect(foundDoc).toBeDefined();
    expect(foundDoc.name).toBe('Test Document');
  });

  it('should persist data to file', async () => {
    await rxdbConnection.saveToFile();
    // The file should exist and contain our test data
    const fs = await import('fs/promises');
    const filePath = `${rxdbConnection.dbPath}/${rxdbConnection.dbName}.json`;
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });
});