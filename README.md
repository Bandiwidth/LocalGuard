# LocalGuard v1.1

LocalGuard is a privacy-focused browser extension for Chrome and Edge designed to provide robust protection against tracking and fingerprinting without compromising your browsing experience. It operates entirely locally with no telemetry or accounts required.

## What's New in v1.1 (Production Grade Update)
- **Background Auto-Updates:** Blocklists are now downloaded and parsed entirely in the background via `chrome.alarms` with randomized jitter to prevent server throttling.
- **Robust Storage Backend:** Migrated from `chrome.storage` to IndexedDB (`db.js`) to reliably support multi-megabyte raw list data without hitting browser quota limits.
- **Web Worker Offloading:** Massive parsing tasks (like regex deduplication for hundreds of thousands of domains) are now offloaded to a Web Worker (`parser-worker.js`). This ensures the browser UI remains buttery smooth during updates, with native static-import fallbacks that fully comply with Manifest V3 Service Worker restrictions.
- **Advanced Malware & Spam Protection:** Dynamically pulls and merges the URLhaus and StevenBlack blocklists to provide enterprise-grade network protection.
- **Custom User Rules:** A new text-based UI in the Protection tab allows you to easily configure your own "Always Block" and "Always Allow" domain rules, seamlessly integrated with the DNR engine.
- **Internationalization (i18n):** Core scaffolding (`_locales`) has been implemented to support multiple languages.
- **End-to-End Testing Suite:** Includes an automated Puppeteer test suite (`e2e-test.mjs`) to validate DNR tracking and link cleaning rules programmatically against real-world URLs.

## Core Features
- **Aggressive Tracker Blocking**: Uses the EasyPrivacy list and dynamically maintained tracking endpoints to block known trackers at the network level.
- **Advanced Fingerprint Spoofing**: Actively injects randomized mathematical noise into Canvas, WebGL, AudioContext, and Font APIs to disrupt tracking scripts without breaking websites.
- **Bounce Tracking Protection**: Intercepts known tracker URL redirects and sends you straight to your actual destination.
- **Cosmetic Filtering**: Cleans up the web by automatically hiding ad placeholders and intrusive cookie banners.
- **Local & Fast**: Everything happens directly on your machine. 

## Installation

1. Clone or download this repository.
2. Open Chrome or Edge and go to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the `src` folder from this repository.

## Testing (Development)
To run the automated End-to-End tests:
1. Ensure Node.js is installed.
2. Navigate to the `src` directory in your terminal.
3. Run `npm install` to download dependencies (Puppeteer).
4. Run `node e2e-test.mjs`.

## License
MIT License
