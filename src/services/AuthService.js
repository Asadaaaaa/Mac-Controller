const jwt = require('jsonwebtoken');

class AuthService {
    constructor(pin, accessTokenSecret, refreshTokenSecret) {
        this.pin = pin;
        this.accessTokenSecret = accessTokenSecret;
        this.refreshTokenSecret = refreshTokenSecret;
    }

    verifyPin(inputPin) {
        return inputPin === this.pin;
    }

    generateAccessToken() {
        return jwt.sign({ role: 'user' }, this.accessTokenSecret, { expiresIn: '5m' });
    }

    generateRefreshToken() {
        return jwt.sign({ role: 'user' }, this.refreshTokenSecret, { expiresIn: '7d' });
    }

    verifyAccessToken(token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, this.accessTokenSecret, (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }

    verifyRefreshToken(token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, this.refreshTokenSecret, (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }
}

module.exports = AuthService;
