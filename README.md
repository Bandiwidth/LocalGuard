# LocalGuard

LocalGuard is a privacy-focused browser extension for Chrome and Edge designed to provide robust protection against tracking and fingerprinting without compromising your browsing experience. It operates entirely locally with no telemetry or accounts required.

## Features

- **Aggressive Tracker Blocking**: Uses the EasyPrivacy list and AdGuard CNAME disguised trackers list to block known trackers at the network level.
- **Advanced Fingerprint Spoofing**: Actively injects randomized mathematical noise into Canvas, WebGL, AudioContext, and Font APIs to disrupt tracking scripts without breaking websites.
- **Bounce Tracking Protection**: Intercepts known tracker URL redirects and sends you straight to your actual destination.
- **Cosmetic Filtering**: Cleans up the web by automatically hiding ad placeholders and intrusive cookie banners.
- **Local & Fast**: Everything happens directly on your machine. 

## Installation

1. Clone or download this repository.
2. Open Chrome or Edge and go to chrome://extensions (or edge://extensions).
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the src folder from this repository.

## License
MIT License
