const express = require('express');
const http = require('http');
const https = require('https');
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

        this.sslEnabled = false;
        let sslOptions = null;

        if (config.server && config.server.ssl && config.server.ssl.enabled) {
            let keyPath = config.server.ssl.keyPath || 'certs/key.pem';
            let certPath = config.server.ssl.certPath || 'certs/cert.pem';
            if (!path.isAbsolute(keyPath)) {
                keyPath = path.join(__dirname, '..', '..', keyPath);
            }
            if (!path.isAbsolute(certPath)) {
                certPath = path.join(__dirname, '..', '..', certPath);
            }

            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                console.log('🔑 Generating self-signed SSL certificates...');
                const certsDir = path.dirname(keyPath);
                if (!fs.existsSync(certsDir)) {
                    fs.mkdirSync(certsDir, { recursive: true });
                }
                const { execSync } = require('child_process');
                try {
                    execSync(`openssl req -nodes -new -x509 -keyout "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=localhost"`);
                    console.log('✅ Self-signed SSL certificates generated successfully.');
                } catch (err) {
                    console.error('❌ Failed to generate self-signed certificates using openssl:', err.message);
                }
            }

            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                try {
                    sslOptions = {
                        key: fs.readFileSync(keyPath),
                        cert: fs.readFileSync(certPath)
                    };
                    this.sslEnabled = true;
                } catch (err) {
                    console.error('❌ Error reading SSL certificates, falling back to HTTP:', err.message);
                }
            } else {
                console.warn('⚠️ SSL certificates missing, falling back to HTTP.');
            }
        }

        if (this.sslEnabled && sslOptions) {
            this.server = https.createServer(sslOptions, this.app);
        } else {
            this.server = http.createServer(this.app);
        }
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
            const protocol = this.sslEnabled ? 'https' : 'http';
            console.log(`💻 Mac Controller Server running on ${protocol}://${this.host}:${this.port}`);
            const ipAddresses = this.getLocalIpAddresses();
            if (ipAddresses.length > 0) {
                ipAddresses.forEach(ip => {
                    console.log(`📱 Access from any device on your network at ${protocol}://${ip}:${this.port}`);
                });
            } else {
                console.log(`📱 Access from any device on your network at ${protocol}://<your-ip>:${this.port}`);
            }
            console.log(`🔌 WebSocket server is ready for connections`);
        });
    }
}

module.exports = WebServer;
