const WebSocket = require('ws');
const ScreenStreamer = require('../services/ScreenStreamer');
const AudioStreamer = require('../services/AudioStreamer');

class WebSocketHandler {
    constructor(wss, authService, volumeController, inputController) {
        this.wss = wss;
        this.authService = authService;
        this.volumeController = volumeController;
        this.inputController = inputController;
        this.init();
    }

    init() {
        this.wss.on('connection', (ws) => {
            console.log('✅ New client connected');
            console.log(`🔑 PIN for new client: ${this.authService.pin}`);

            // Initialize streamers for this socket connection
            ws.screenStreamer = new ScreenStreamer(ws, 'touchpad');
            ws.watchStreamer = new ScreenStreamer(ws, 'watch');
            ws.audioStreamer = new AudioStreamer(ws);

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    const { type, payload, token } = data;

                    let response = { type, success: false };

                    // 1. Handle verifyPin (Login)
                    if (type === 'verifyPin') {
                        if (this.authService.verifyPin(payload.pin)) {
                            const accessToken = this.authService.generateAccessToken();
                            const refreshToken = this.authService.generateRefreshToken();
                            response = { type, success: true, accessToken, refreshToken };
                            console.log('🔓 Client authenticated successfully');
                        } else {
                            response = { type, success: false, error: 'Invalid PIN' };
                            console.log('🔒 Client failed authentication');
                        }
                        ws.send(JSON.stringify(response));
                        return;
                    }

                    // 2. Handle refreshToken
                    if (type === 'refreshToken') {
                        const { refreshToken } = payload;
                        if (!refreshToken) {
                            ws.send(JSON.stringify({ type, success: false, error: 'Refresh Token required' }));
                            return;
                        }

                        try {
                            await this.authService.verifyRefreshToken(refreshToken);
                            const accessToken = this.authService.generateAccessToken();
                            ws.send(JSON.stringify({ type, success: true, accessToken }));
                        } catch (err) {
                            ws.send(JSON.stringify({ type, success: false, error: 'Invalid Refresh Token' }));
                        }
                        return;
                    }

                    // 3. Verify Access Token for all other messages
                    if (!token) {
                        ws.send(JSON.stringify({ type, success: false, error: 'Authentication required' }));
                        return;
                    }

                    try {
                        await this.authService.verifyAccessToken(token);
                    } catch (err) {
                        ws.send(JSON.stringify({ type, success: false, error: 'Invalid or Expired Token' }));
                        return;
                    }

                    // 4. Authorized Message Routing
                    switch (type) {
                        case 'getVolume':
                            try {
                                const volume = await this.volumeController.getVolume();
                                response = { type, success: true, volume };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'setVolume':
                            try {
                                const { volume } = payload;
                                await this.volumeController.setVolume(volume);
                                response = { type, success: true, volume };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'getMute':
                            try {
                                const muted = await this.volumeController.getMuted();
                                response = { type, success: true, muted };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'setMute':
                            try {
                                const { muted } = payload;
                                await this.volumeController.setMuted(muted);
                                response = { type, success: true, muted };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'pressArrow':
                            try {
                                const { key } = payload;
                                this.inputController.pressArrow(key);
                                response = { type, success: true, key };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'moveMouse':
                            try {
                                const { deltaX, deltaY } = payload;
                                this.inputController.moveMouse(deltaX, deltaY);
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'scrollMouse':
                            try {
                                const { x, y } = payload;
                                this.inputController.scrollMouse(x, y);
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'mouseClick':
                            try {
                                const { button, double } = payload;
                                this.inputController.clickMouse(button, double);
                                response = { type, success: true, button, double };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'toggleMouse':
                            try {
                                const { button, state } = payload;
                                this.inputController.toggleMouse(button, state);
                                response = { type, success: true, button, state };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'typeText':
                            try {
                                const { text } = payload;
                                this.inputController.typeText(text);
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'pressKey':
                            try {
                                const { key } = payload;
                                this.inputController.pressKey(key);
                                response = { type, success: true, key };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'startScreenStream':
                            try {
                                ws.screenStreamer.start(payload.resolution);
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'stopScreenStream':
                            try {
                                ws.screenStreamer.stop();
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'startWatchStream':
                            try {
                                ws.watchStreamer.start(payload.resolution);
                                ws.audioStreamer.start();
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        case 'stopWatchStream':
                            try {
                                ws.watchStreamer.stop();
                                ws.audioStreamer.stop();
                                response = { type, success: true };
                            } catch (error) {
                                response = { type, success: false, error: error.message };
                            }
                            break;

                        default:
                            response = { type, success: false, error: 'Unknown message type' };
                    }

                    ws.send(JSON.stringify(response));
                } catch (error) {
                    console.error('Error processing message:', error);
                    ws.send(JSON.stringify({ success: false, error: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                console.log('❌ Client disconnected');
                ws.screenStreamer.stop();
                ws.watchStreamer.stop();
                ws.audioStreamer.stop();
                
                // Release mouse buttons on disconnect to prevent stuck down state
                try {
                    this.inputController.toggleMouse('left', 'up');
                    this.inputController.toggleMouse('right', 'up');
                } catch (e) {
                    // Ignore errors if toggleMouse fails (e.g. robotjs not loaded / error)
                }
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // Initial connection success greeting
            ws.send(JSON.stringify({ type: 'connected', success: true, message: 'Connected to server. Please authenticate.' }));
        });
    }
}

module.exports = WebSocketHandler;
