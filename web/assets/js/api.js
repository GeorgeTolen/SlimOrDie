'use strict';

class APIClient {
    constructor(base = '') {
        this.base = base;
    }

    async _req(method, path, body) {
        try {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' },
            };
            if (body !== undefined) opts.body = JSON.stringify(body);
            const res = await fetch(this.base + path, opts);
            const data = await res.json();
            return data;
        } catch (e) {
            console.warn('API error:', e);
            return { success: false, error: e.message };
        }
    }

    async saveGame(payload) {
        return this._req('POST', '/api/game/saves', payload);
    }

    async updateGame(id, payload) {
        return this._req('PUT', `/api/game/save/${id}`, payload);
    }

    async loadGame(id) {
        return this._req('GET', `/api/game/load/${id}`);
    }

    async listSaves() {
        return this._req('GET', '/api/game/saves');
    }

    async deleteSave(id) {
        return this._req('DELETE', `/api/game/save/${id}`);
    }

    async addScore(payload) {
        return this._req('POST', '/api/leaderboard', payload);
    }

    async getLeaderboard(limit = 10) {
        return this._req('GET', `/api/leaderboard?limit=${limit}`);
    }

    async unlockAchievement(payload) {
        return this._req('POST', '/api/achievements/unlock', payload);
    }

    async getAchievements(saveId) {
        if (saveId) return this._req('GET', `/api/achievements/${saveId}`);
        return this._req('GET', '/api/achievements');
    }
}
