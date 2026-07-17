---
trigger: always_on
glob: "**/*"
description: Core project rules, standards, and conventions for Mac-Controller.
---

# Mac-Controller Project Rules & Guidelines

## 🍎 macOS Platform Constraints
- **Runtime Environment:** This project is designed specifically for **macOS** due to native dependencies (`robotjs` and `loudness`). Do not attempt to run or compile functionalities utilizing these packages on other operating systems without mock implementations.
- **Native Compilation:** `robotjs` requires Node-GYP and Xcode Command Line Tools to compile native bindings. If compiling fails, ensure Command Line Tools are active (`xcode-select --install`).

## ⚙️ Configuration & Security
- **Config Management:** All system settings (e.g., ports, authentication details, JWT secrets, local IP configuration) must be managed through [config.yml](file:///Users/senja/Documents/Projects/Mac-Controller/config.yml). **Never hardcode secrets, ports, or PINs in code files.**
- **PIN & JWT Authentication:** Clients must authenticate using the dynamic/configured PIN to receive a JSON Web Token (JWT). Any new websocket messages or REST routes handling user input or screen streaming **must require valid JWT authorization**.

## 🚀 Streaming & Performance
- **Screen Streaming:** Handled using `sharp` for compression and WebSockets for low-latency delivery. Optimize performance by avoiding redundant compression. Be mindful of CPU utilization when streaming frames.
- **WebSocket Structure:** Websocket commands (input events, scroll, stream controls) must follow the established protocol pattern defined in [WebSocketHandler.js](file:///Users/senja/Documents/Projects/Mac-Controller/src/server/WebSocketHandler.js).

## 🎨 UI & Styling
- **Premium Glassmorphic Theme:** The client UI (living in [public/index.html](file:///Users/senja/Documents/Projects/Mac-Controller/public/index.html), [public/style.css](file:///Users/senja/Documents/Projects/Mac-Controller/public/style.css), and [public/script.js](file:///Users/senja/Documents/Projects/Mac-Controller/public/script.js)) uses a sleek glassmorphic aesthetic. Keep any new UI elements consistent with the dark theme, using high-quality transitions, CSS variables, and modern glass backdrop-filters.
