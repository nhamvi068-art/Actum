const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Listen for page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  console.log('Navigating to http://localhost:7201/...');

  try {
    await page.goto('http://localhost:7201/', { timeout: 30000 });
    await page.waitForTimeout(5000); // Wait for app to fully initialize

    // Check page title
    const title = await page.title();
    console.log('Page title:', title);

    // Get page URL
    const url = page.url();
    console.log('Page URL:', url);

    // Print all console messages
    console.log('\n--- Console Messages ---');
    for (const msg of consoleMessages) {
      console.log(msg);
    }

    // Print page errors
    if (pageErrors.length > 0) {
      console.log('\n--- Page Errors ---');
      for (const err of pageErrors) {
        console.log(err);
      }
    } else {
      console.log('\n--- No Page Errors ---');
    }

    // Check for Drawnix-related logs
    const drawnixLogs = consoleMessages.filter(msg => msg.includes('[Drawnix]'));
    console.log('\n--- Drawnix Logs ---');
    if (drawnixLogs.length > 0) {
      for (const log of drawnixLogs) {
        console.log(log);
      }
    } else {
      console.log('No [Drawnix] log messages found');
    }

    // Check for storage-related logs
    const storageLogs = consoleMessages.filter(msg => msg.includes('[Storage]') || msg.toLowerCase().includes('storage'));
    console.log('\n--- Storage Service Logs ---');
    if (storageLogs.length > 0) {
      for (const log of storageLogs) {
        console.log(log);
      }
    } else {
      console.log('No storage-related log messages found');
    }

    // Take screenshot
    await page.screenshot({ path: 'app-screenshot.png', fullPage: true });
    console.log('\nScreenshot saved to app-screenshot.png');

  } catch (error) {
    console.error('Error navigating to page:', error.message);
  }

  await browser.close();
})();
