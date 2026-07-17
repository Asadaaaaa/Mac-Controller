const { spawn } = require('child_process');
const WebSocket = require('ws');

class AudioStreamer {
    constructor(ws) {
        this.ws = ws;
        this.audioProcess = null;
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;

        try {
            this.audioProcess = spawn('ffmpeg', [
                '-f', 'avfoundation',
                '-i', ':0',           // default audio input device
                '-ac', '1',           // mono
                '-ar', '22050',       // 22kHz sample rate
                '-f', 'mp3',          // compress to mp3
                '-b:a', '64k',        // 64kbps bitrate
                '-flush_packets', '1',
                'pipe:1'              // output to stdout
            ], { stdio: ['pipe', 'pipe', 'pipe'] });

            this.audioProcess.stdout.on('data', (chunk) => {
                if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
                    // Prefix with 0x01 byte to distinguish audio from video frames
                    const audioMsg = Buffer.concat([Buffer.from([0x01]), chunk]);
                    this.ws.send(audioMsg, { binary: true });
                }
            });

            this.audioProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Error') || msg.includes('error')) {
                    console.error('ffmpeg audio error:', msg);
                }
            });

            this.audioProcess.on('close', (code) => {
                console.log(`🔇 Audio process exited with code ${code}`);
                this.audioProcess = null;
            });

            this.audioProcess.on('error', (err) => {
                console.error('Failed to start audio capture:', err.message);
                this.audioProcess = null;
            });

            console.log('🔊 Audio streaming started');
        } catch (audioErr) {
            console.error('Audio capture not available:', audioErr.message);
        }
    }

    stop() {
        this.isActive = false;
        if (this.audioProcess) {
            this.audioProcess.kill('SIGTERM');
            this.audioProcess = null;
            console.log('🔇 Audio streaming stopped');
        }
    }
}

module.exports = AudioStreamer;
