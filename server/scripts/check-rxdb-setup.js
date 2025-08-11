#!/usr/bin/env node

import rxdbConnection from '../database/rxdb-connection.js';
import RxDBInitializer from '../database/rxdb-init.js';

async function checkRxDBSetup() {
  console.log('🔍 Checking RxDB Setup...\n');

  try {
    // Initialize RxDB
    console.log('1. Initializing RxDB...');
    const initializer = new RxDBInitializer();
    await initializer.initialize();
    console.log('   ✅ RxDB initialized successfully\n');

    // Check status
    console.log('2. Checking RxDB status...');
    const status = initializer.getStatus();
    console.log('   📊 Status:', JSON.stringify(status, null, 2));
    console.log('   ✅ Status check completed\n');

    // Test basic operations
    console.log('3. Testing basic operations...');
    
    // Add a test schema
    const testSchema = {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        message: { type: 'string', maxLength: 255 },
        timestamp: { type: 'string', format: 'date-time' }
      },
      required: ['id', 'message']
    };

    await rxdbConnection.addCollection('setup_test', testSchema);
    console.log('   ✅ Test collection added');

    // Insert test document
    const testCollection = rxdbConnection.getCollection('setup_test');
    const testDoc = {
      id: 'setup-test-' + Date.now(),
      message: 'RxDB setup verification',
      timestamp: new Date().toISOString()
    };

    await testCollection.insert(testDoc);
    console.log('   ✅ Test document inserted');

    // Query test document
    const foundDoc = await testCollection.findOne(testDoc.id).exec();
    if (foundDoc && foundDoc.message === testDoc.message) {
      console.log('   ✅ Test document queried successfully');
    } else {
      throw new Error('Test document query failed');
    }

    // Test persistence
    console.log('   💾 Testing persistence...');
    await rxdbConnection.saveToFile();
    console.log('   ✅ Data persisted to file\n');

    // Health check
    console.log('4. Running health check...');
    const isHealthy = await rxdbConnection.healthCheck();
    if (isHealthy) {
      console.log('   ✅ Health check passed\n');
    } else {
      throw new Error('Health check failed');
    }

    console.log('🎉 RxDB setup verification completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • RxDB initialized with memory storage + file persistence');
    console.log('   • AJV validation enabled');
    console.log('   • Periodic persistence configured (30s intervals)');
    console.log('   • Basic CRUD operations working');
    console.log('   • Health monitoring functional');
    console.log(`   • Data persisted to: ${rxdbConnection.dbPath}/${rxdbConnection.dbName}.json`);

    // Cleanup
    await initializer.gracefulShutdown();
    process.exit(0);

  } catch (error) {
    console.error('❌ RxDB setup verification failed:', error.message);
    console.error('\n🔧 Troubleshooting tips:');
    console.error('   • Check that all dependencies are installed: npm install');
    console.error('   • Verify the data directory exists and is writable');
    console.error('   • Check environment variables in .env file');
    console.error('   • Review the error details above');
    
    try {
      await rxdbConnection.gracefulShutdown();
    } catch (shutdownError) {
      console.error('Error during cleanup:', shutdownError.message);
    }
    
    process.exit(1);
  }
}

// Run the check
checkRxDBSetup();