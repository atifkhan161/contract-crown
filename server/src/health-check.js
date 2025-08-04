#!/usr/bin/env node

/**
 * Health check script for Docker container - Raspberry Pi optimized
 * Checks if the application is running and responding
 */

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
    host: 'localhost',
    port: process.env.PORT || 3000,
    path: '/health',
    timeout: 5000, // Longer timeout for Raspberry Pi
    method: 'GET'
};

const request = http.request(options, (res) => {
    if (res.statusCode === 200) {
        console.log('✅ Health check passed');
        process.exit(0);
    } else {
        console.log(`❌ Health check failed with status: ${res.statusCode}`);
        process.exit(1);
    }
});

request.on('error', (err) => {
    console.error('❌ Health check error:', err.message);
    process.exit(1);
});

request.on('timeout', () => {
    console.error('❌ Health check timeout');
    request.destroy();
    process.exit(1);
});

request.setTimeout(options.timeout);
request.end();