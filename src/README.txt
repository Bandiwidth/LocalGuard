LOCALGUARD 1.2.0 — CHROME & MICROSOFT EDGE

Open guide.html for the complete setup guide, permissions, and limitations.

QUICK START
1. Extract the ZIP if needed. Keep the LocalGuard folder in a permanent location.
2. In Chrome open chrome://extensions. In Edge open edge://extensions.
3. Turn on Developer mode.
4. Click Load unpacked and select the LocalGuard folder containing manifest.json.
5. Pin the extension using the browser's Extensions menu. Reload open websites.

Install separately in both browsers; settings are not synced.
UPDATING FROM 1.0 / 1.1: Replace files in the SAME loaded folder, then click Reload
on its Extensions page card. Accept the extra activity-reporting / scheduling permissions
if the browser prompts. Reload websites to start seeing new activity.
To uninstall, use Remove on the browser's Extensions page.

FEATURES
- A built-in tracker list plus an automatically updated EasyPrivacy subset.
- Bundled maintained snapshot: 44,310 domains and 558 website exceptions.
- Update status, manual checks, and rollback to the previous snapshot.
- One-click browser-rule test, with disabled features marked Off.
- A small list of known fingerprinting endpoints (not fingerprint masking).
- Removes 22 common tracking tags from top-level GET navigation URLs.
- Optional third-party Cookie / Set-Cookie header filtering (off by default).
- Global pause, individual feature switches, and site exceptions.
- Actual blocked-request activity with timestamps, domains, reasons, and JSON export.
- Latest 500 events in session memory; no paths, queries, or cookie values.
- No account, subscription, remote code, telemetry, or persistent browsing logs.

LIMITS
No Windows
protection, comprehensive fingerprint masking, IP hiding, antivirus, private
email, or independent security audit. EasyPrivacy coverage is a subset. First-party and
server-side tracking can still occur. Blocking can break sites; use Pause on
this site and reload. Read guide.html before relying on these protections.

SOURCE
manifest.json: browser permissions and entry points
rules.js: reviewable lists, defaults, and browser rule generation
background.js: settings and atomic browser-rule updates
audit.js: browser-issued events and bounded session-memory storage
activity.html / activity.css / activity.js: audit viewer and local export
popup.html / popup.css / popup.js: toolbar panel
guide.html: setup, privacy notice, and limitations

Daily list checks contact EasyPrivacy’s public distribution server without
cookies, referrers, or browsing logs. Automatic updates can be turned off.
The test button simulates requests in the browser rule engine; it does not
contact test servers or measure fingerprint anonymity.

No build step, package manager, or paid service is required for installation.
Original code: MIT; see LICENSE.txt. EasyPrivacy and adapted list data:
CC BY-SA 3.0; see THIRD-PARTY-NOTICES.txt.
