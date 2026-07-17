# Mac Controller 🖥️

A modern, responsive remote PC management web application that allows you to control your Mac from any mobile device, tablet, or secondary screen over your local network.

---

## 🚀 Features

### 1. 🖱️ Remote Touchpad & Input
- **Mouse Control**: Drag on the screen to move the cursor, tap to left-click.
- **Scrolling**: Two-finger drag to scroll up/down.
- **Keyboard Input**: Send keystrokes, shortcuts, and direct typing using your device's native keyboard.
- **D-Pad Controls**: Dedicated button layout for arrow keys.

### 2. 📺 Live Screen Streaming
- Real-time screen streaming using WebSockets.
- Adjustable resolution options (**320p**, **480p**, and **720p**) to suit different network bandwidths.
- Support for Fullscreen and Watch-only mode.

### 3. 🔊 System Controls
- **Volume Slider**: Adjust the Mac's system volume in real-time.
- **Mute / Unmute**: Instantly toggle the system audio.
- **Lock Screen**: Slide-to-lock gesture simulation on the web client.

### 4. 🔒 Built-in Security (PIN Authentication)
- Upon server startup, a secure PIN is printed in the terminal.
- Connecting clients must input this PIN to successfully authenticate, establishing a secure JWT session.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, WebSockets (`ws`), JSON Web Tokens (`jsonwebtoken`)
- **Mac Control**: `robotjs` (mouse & keyboard simulation), `loudness` (system volume control)
- **Image Processing**: `sharp` (screen compression & resolution scaling)
- **Frontend**: HTML5, Vanilla CSS (with custom Glassmorphic design and Dark Mode support), Vanilla JS

---

## 📋 Prerequisites

- **macOS** (necessary due to underlying OS-specific libraries like `loudness` and `robotjs`).
- **Node.js** (v16 or higher recommended).
- **Xcode Command Line Tools** (required to compile native node modules like `robotjs`).
  ```bash
  xcode-select --install
  ```

---

## ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Asadaaaaa/Mac-Controller.git
   cd Mac-Controller
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

## 🏃 Running the Application

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Retrieve the PIN**:
   Check your terminal logs. The server will output a statement like:
   ```text
   =========================================
   🔒 CONNECTION PIN: 4892
   =========================================
   ```

3. **Access the Controller**:
   Open a web browser on any device connected to the same Wi-Fi network and navigate to:
   ```text
   http://<YOUR_MAC_IP_ADDRESS>:3000
   ```
   *For example: `http://192.168.1.15:3000`*

4. Enter the PIN from the console and click **Connect**.
