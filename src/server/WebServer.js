const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const VolumeController = require('../controllers/VolumeController');
const InputController = require('../controllers/InputController');
const AuthService = require('../services/AuthService');
const WebSocketHandler = require('./WebSocketHandler');

class WebServer {
    constructor(port = 3000, host = '0.0.0.0') {
        this.port = port;
        this.host = host;
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        // Instantiate components
        this.authService = new AuthService(
            '9563', // Static PIN
            'access-token-secret-key-123',
            'refresh-token-secret-key-456'
        );
        this.volumeController = new VolumeController();
        this.inputController = new InputController();

        this.initMiddleware();
        this.initRoutes();
        this.initWebSocket();
    }

    initMiddleware() {
        this.app.use(express.static(path.join(__dirname, '..', '..', 'public')));
    }

    initRoutes() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
        });
    }

    initWebSocket() {
        this.wsHandler = new WebSocketHandler(
            this.wss,
            this.authService,
            this.volumeController,
            this.inputController
        );
    }

    getLocalIpAddresses() {
        const interfaces = os.networkInterfaces();
        const addresses = [];
        for (const interfaceName in interfaces) {
            for (const iface of interfaces[interfaceName]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    addresses.push(iface.address);
                }
            }
        }
        return addresses;
    }

    start() {
        this.server.listen(this.port, this.host, () => {
            console.log(`💻 Mac Controller Server running on http://${this.host}:${this.port}`);
            const ipAddresses = this.getLocalIpAddresses();
            if (ipAddresses.length > 0) {
                ipAddresses.forEach(ip => {
                    console.log(`📱 Access from any device on your network at http://${ip}:${this.port}`);
                });
            } else {
                console.log(`📱 Access from any device on your network at http://<your-ip>:${this.port}`);
            }
            console.log(`🔌 WebSocket server is ready for connections`);
        });
    }
}

module.exports = WebServer;
