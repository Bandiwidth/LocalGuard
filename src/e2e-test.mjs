import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const extensionPath = __dirname;
  
  console.log('Launching browser with extension...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const page = await browser.newPage();
    
    console.log('Testing tracker blocking...');
    let blocked = false;
    page.on('requestfailed', request => {
      if (request.url().includes('google-analytics.com')) {
        blocked = true;
      }
    });

    // Navigate to a safe first-party domain
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });

    // Inject a third-party tracker script
    try {
      await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://www.google-analytics.com/analytics.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      });
    } catch (e) {
      // Expected to fail because DNR blocked it
    }

    if (blocked) {
      console.log('✅ Tracker successfully blocked by DNR.');
    } else {
      console.error('❌ Tracker was NOT blocked.');
    }

    console.log('Testing link cleaning...');
    await page.goto('https://example.com/?utm_source=test', { waitUntil: 'networkidle0', timeout: 5000 });
    if (page.url() === 'https://example.com/') {
      console.log('✅ Link cleaned successfully.');
    } else {
      console.error('❌ Link was NOT cleaned. URL is:', page.url());
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
