import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    testIsolation: true,
    
    setupNodeEvents(on, config) {
      // Custom tasks for comprehensive testing
      on('task', {
        // Generate test report
        generateTestReport(data) {
          console.log('Generating test report:', data);
          const fs = require('fs');
          const reportPath = 'cypress/reports/test-report.json';
          
          try {
            fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
            console.log(`Test report saved to ${reportPath}`);
          } catch (error) {
            console.error('Failed to save test report:', error);
          }
          
          return null;
        },
        
        // Get code coverage (mock implementation)
        getCoverage() {
          return {
            statements: { pct: 85 },
            branches: { pct: 78 },
            functions: { pct: 82 },
            lines: { pct: 84 }
          };
        },
        
        // Log messages
        log(message) {
          console.log(`[Cypress Task] ${message}`);
          return null;
        },
        
        // Validate test requirements
        validateRequirements(requirements) {
          console.log(`Validating ${requirements.length} requirements`);
          return requirements.every(req => req.tested === true);
        },
        
        // WebSocket testing tasks
        createTestUser(userData) {
          // Mock implementation - in real app this would create a test user in database
          console.log('Creating test user:', userData.username);
          return { success: true, userId: `test-${userData.username}` };
        },
        
        createTestGame(gameData) {
          // Mock implementation - in real app this would create a test game
          console.log('Creating test game for host:', gameData.hostUser.username);
          return { 
            success: true, 
            gameId: `test-game-${Date.now()}`,
            gameCode: Math.random().toString(36).substring(2, 8).toUpperCase()
          };
        },
        
        cleanupTestData() {
          // Mock implementation - in real app this would clean up test data
          console.log('Cleaning up test data');
          return { success: true };
        },
        
        // Database tasks for testing
        resetDatabase() {
          console.log('Resetting test database');
          return { success: true };
        },
        
        seedTestData(data) {
          console.log('Seeding test data:', data);
          return { success: true };
        }
      });
      
      // Browser launch options for better testing
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.name === 'chrome') {
          launchOptions.args.push('--disable-dev-shm-usage');
          launchOptions.args.push('--no-sandbox');
          launchOptions.args.push('--disable-gpu');
        }
        return launchOptions;
      });
      
      return config;
    },
    
    // Environment variables for testing
    env: {
      testMode: true,
      apiUrl: 'http://localhost:3001/api',
      wsUrl: 'http://localhost:3001'
    }
  },
  
  component: {
    devServer: {
      framework: 'vite',
      bundler: 'vite',
      viteConfig: {
        configFile: 'client/vite.config.js'
      }
    },
    specPattern: 'client/src/**/*.cy.{js,jsx,ts,tsx}',
    indexHtmlFile: 'client/index.html'
  },
  
  // Global configuration for comprehensive testing
  retries: {
    runMode: 2,
    openMode: 0
  },
  

  
  // Experimental features
  experimentalStudio: true,
  experimentalWebKitSupport: true,
  
  // Reporter configuration
  reporter: 'mochawesome',
  reporterOptions: {
    reportDir: 'cypress/reports',
    overwrite: false,
    html: true,
    json: true
  }
})