const loudness = require('loudness');

class VolumeController {
    async getVolume() {
        return await loudness.getVolume();
    }

    async setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 100) {
            throw new Error('Volume must be between 0 and 100');
        }
        await loudness.setVolume(volume);
        return volume;
    }

    async getMuted() {
        return await loudness.getMuted();
    }

    async setMuted(muted) {
        await loudness.setMuted(muted);
        return muted;
    }
}

module.exports = VolumeController;
