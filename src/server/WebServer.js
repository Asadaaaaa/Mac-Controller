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
    constructor(port, host) {
        const fs = require('fs');
        const yaml = require('js-yaml');

        let config = {};
        try {
            const configPath = path.join(__dirname, '..', '..', 'config.yml');
            if (fs.existsSync(configPath)) {
                config = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
            }
        } catch (e) {
            console.error('Warning: Failed to load config.yml, using defaults. Error:', e.message);
        }

        this.port = port || (config.server && config.server.port) || 3000;
        this.host = host || (config.server && config.server.host) || '0.0.0.0';
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        const pin = config.pin !== undefined ? String(config.pin) : '9563';
        const accessTokenSecret = (config.jwt && config.jwt.accessTokenSecret) || 'access-token-secret-key-123';
        const refreshTokenSecret = (config.jwt && config.jwt.refreshTokenSecret) || 'refresh-token-secret-key-456';

        // Instantiate components
        this.authService = new AuthService(
            pin,
            accessTokenSecret,
            refreshTokenSecret
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
