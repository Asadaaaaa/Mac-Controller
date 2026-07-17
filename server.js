const WebServer = require('./src/server/WebServer');

// Start web server on port 3000
const server = new WebServer(3000, '0.0.0.0');
server.start();
