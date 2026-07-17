const robot = require('robotjs');
const sharp = require('sharp');
const WebSocket = require('ws');
const { execSync } = require('child_process');

const RESOLUTION_MAP = {
    '320p': { width: 480, height: 320 },
    '480p': { width: 720, height: 480 },
    '720p': { width: 1280, height: 720 },
};

const CURSOR_SVG_BUFFER = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
    '<path d="M0 0v17l4.5-4.5 2.5 5.5 2.5-1-2.5-5.5 6 0.5z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>'
);

const BGRA_TO_RGB = [
    [0, 0, 1],  // new R = old B
    [0, 1, 0],  // new G = old G
    [1, 0, 0],  // new B = old R
];

// Helper to get screen arrangements using macOS AppleScript ObjC
function getScreens() {
    try {
        const cmd = `osascript -e 'use framework "AppKit"
set theList to {}
repeat with aScreen in current application'\''s NSScreen'\''s screens()
    copy (aScreen'\''s frame() as list) to end of theList
end repeat
theList'`;
        const output = execSync(cmd).toString().trim();
        const nums = output.split(',').map(Number);
        const screens = [];
        for (let i = 0; i < nums.length; i += 4) {
            screens.push({
                x: nums[i],
                y: nums[i+1],
                w: nums[i+2],
                h: nums[i+3]
            });
        }
        
        // Find primary screen height to perform y-axis conversion (AppKit y origin is bottom-left, robotjs is top-left)
        const primary = screens.find(s => s.x === 0 && s.y === 0) || screens[0];
        const hPrimary = primary ? primary.h : 1080;
        
        return screens.map(s => {
            const X_tl = s.x;
            const Y_tl = hPrimary - (s.y + s.h);
            return {
                x: X_tl,
                y: Y_tl,
                w: s.w,
                h: s.h
            };
        });
    } catch (err) {
        console.error('Failed to query monitor layout:', err);
        return [{ x: 0, y: 0, w: 1920, h: 1080 }];
    }
}

class ScreenStreamer {
    constructor(ws, type = 'touchpad') {
        this.ws = ws;
        this.type = type; // 'touchpad' or 'watch'
        this.isActive = false;
        this.resolution = RESOLUTION_MAP['720p'];
        this.fpsTarget = type === 'watch' ? 30 : 60;
        this.frameTime = 1000 / this.fpsTarget;

        // Multi-monitor states
        this.screens = [{ x: 0, y: 0, w: 1920, h: 1080 }];
        this.lastScreenUpdate = 0;

        // Change detection states
        this.prevScreenBuffer = null;
        this.prevCursorX = -1;
        this.prevCursorY = -1;
        this.lastFrameSentTime = 0;
    }

    start(resolutionName) {
        this.setResolution(resolutionName);
        if (this.isActive) return;

        this.isActive = true;
        // Immediate query on startup
        this.screens = getScreens();
        this.lastScreenUpdate = Date.now();
        this.loop();
    }

    setResolution(resolutionName) {
        this.resolution = RESOLUTION_MAP[resolutionName] || RESOLUTION_MAP['720p'];
    }

    stop() {
        this.isActive = false;
        this.prevScreenBuffer = null;
        this.prevCursorX = -1;
        this.prevCursorY = -1;
        this.lastFrameSentTime = 0;
    }

    async loop() {
        if (!this.isActive || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        // Backpressure
        if (this.ws.bufferedAmount > 0) {
            setTimeout(() => this.loop(), 10);
            return;
        }

        const startTime = Date.now();
        const { width: outW, height: outH } = this.resolution;

        try {
            const mouse = robot.getMousePos();

            // Find screen containing mouse
            let activeScreen = this.screens.find(s => 
                mouse.x >= s.x && mouse.x < s.x + s.w &&
                mouse.y >= s.y && mouse.y < s.y + s.h
            );

            // Dynamically refresh coordinates if out of bounds or every 5 seconds
            const now = Date.now();
            if (!activeScreen || !this.lastScreenUpdate || (now - this.lastScreenUpdate > 5000)) {
                this.screens = getScreens();
                this.lastScreenUpdate = now;
                activeScreen = this.screens.find(s => 
                    mouse.x >= s.x && mouse.x < s.x + s.w &&
                    mouse.y >= s.y && mouse.y < s.y + s.h
                ) || this.screens[0];
            }

            // Capture only the active monitor boundaries
            const robotImg = robot.screen.capture(
                activeScreen.x,
                activeScreen.y,
                activeScreen.w,
                activeScreen.h
            );
            const { width, height, image: buffer } = robotImg;

            // Change detection (1 FPS keep-alive fallback)
            const screenChanged = !this.prevScreenBuffer || !buffer.equals(this.prevScreenBuffer);
            const cursorMoved = mouse.x !== this.prevCursorX || mouse.y !== this.prevCursorY;
            const forceSend = !this.lastFrameSentTime || (now - this.lastFrameSentTime > 1000);

            if (!screenChanged && !cursorMoved && !forceSend) {
                const elapsed = Date.now() - startTime;
                const delay = Math.max(0, this.frameTime - elapsed);
                setTimeout(() => this.loop(), delay);
                return;
            }

            this.prevScreenBuffer = buffer;
            this.prevCursorX = mouse.x;
            this.prevCursorY = mouse.y;
            this.lastFrameSentTime = now;

            // Calculate mouse coordinate relative to the active display bounds
            const relativeMouseX = mouse.x - activeScreen.x;
            const relativeMouseY = mouse.y - activeScreen.y;

            // Scale relative cursor coordinates to current output resolution width/height
            const scale = outW / activeScreen.w;
            const scaledH = Math.round(activeScreen.h * scale);
            const cursorX = Math.max(0, Math.min(Math.round((relativeMouseX / activeScreen.w) * outW), outW - 24));
            const cursorY = Math.max(0, Math.min(Math.round((relativeMouseY / activeScreen.h) * scaledH), scaledH - 24));

            // Run sharp pipeline
            const jpegBuffer = await sharp(buffer, {
                raw: { width, height, channels: 4 }
            })
            .resize(outW, scaledH, { fit: 'fill' })
            .removeAlpha()
            .recomb(BGRA_TO_RGB)
            .composite([{
                input: CURSOR_SVG_BUFFER,
                top: cursorY,
                left: cursorX,
            }])
            .jpeg({ quality: this.type === 'watch' ? 50 : 40, chromaSubsampling: '4:2:0' })
            .toBuffer();

            if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(jpegBuffer, { binary: true });
            }
        } catch (err) {
            console.error(`Error in ScreenStreamer (${this.type}):`, err);
        }

        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, this.frameTime - elapsed);
        setTimeout(() => this.loop(), delay);
    }
}

module.exports = ScreenStreamer;
