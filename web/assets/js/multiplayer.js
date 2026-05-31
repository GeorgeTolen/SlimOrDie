'use strict';

class MultiplayerClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.playerId = null;
        this.playerColor = '#fff';
        this.handlers = {};
        this._moveThrottle = 0;
        this.MOVE_INTERVAL = 1 / 20;
    }

    get wsUrl() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${location.host}/ws`;
    }

    connect(onOpen) {
        if (this.ws) this.ws.close();
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            console.log('[MP] connected');
            onOpen && onOpen();
        };

        this.ws.onmessage = e => {
            e.data.split('\n').forEach(line => {
                if (!line.trim()) return;
                try { this._dispatch(JSON.parse(line)); } catch (_) {}
            });
        };

        this.ws.onclose = () => {
            this.connected = false;
            this._dispatch({ type: 'disconnected', payload: {} });
        };

        this.ws.onerror = err => console.warn('[MP] error', err);
    }

    disconnect() {
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.connected = false;
        this.playerId = null;
    }

    on(type, fn) {
        if (!this.handlers[type]) this.handlers[type] = [];
        this.handlers[type].push(fn);
        return this;
    }

    off(type) { delete this.handlers[type]; }

    _dispatch(msg) {
        (this.handlers[msg.type] || []).forEach(h => h(msg.payload));
        (this.handlers['*'] || []).forEach(h => h(msg));
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type, payload }));
    }

    // ── Convenience ────────────────────────────────────────────────────────────

    join(name) { this.send('join', { name }); }

    sendMove(x, y, state, facing, weight) {
        this.send('move', { x, y, state, facing, weight });
    }

    sendMoveThrottled(x, y, state, facing, weight, dt) {
        this._moveThrottle += dt;
        if (this._moveThrottle >= this.MOVE_INTERVAL) {
            this._moveThrottle = 0;
            this.sendMove(x, y, state, facing, weight);
        }
    }

    sendActivityStart(activity) {
        this.send('activity_start', { activity });
    }

    sendActivityResult(activity, success, weightLost, newWeight) {
        this.send('activity_result', {
            activity, success,
            weight_lost: weightLost,
            new_weight: newWeight,
        });
    }

    sendVote(choice) { this.send('vote', { choice }); }

    sendStatsUpdate(weight, energy, mood, score, day) {
        this.send('stats_update', { weight, energy, mood, score, day });
    }

    sendChat(text) { if (text && text.trim()) this.send('chat', { text: text.trim() }); }

    sendReady()      { this.send('ready',       {}); }
    sendNightReady() { this.send('night_ready', {}); }
}

// ── RemotePlayer ──────────────────────────────────────────────────────────────

class RemotePlayer {
    constructor(info) {
        this.id = info.id;
        this.name = info.name || 'Игрок';
        this.weight = info.weight || 110;
        this.color = info.color || '#fff';
        this.x = info.x || 0;
        this.y = info.y || 0;
        this._tx = this.x;
        this._ty = this.y;
        this.state = info.state || 'idle';
        this.facing = info.facing !== undefined ? info.facing : true;
        this.energy = info.energy || 100;
        this.mood = info.mood || 100;
        this.score = info.score || 0;
        this.day = info.day || 1;
        this.ready = info.ready || false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.bubble = null;
        this.bubbleTimer = 0;
    }

    update(info) {
        if (info.x !== undefined) this._tx = info.x;
        if (info.y !== undefined) this._ty = info.y;
        if (info.state) this.state = info.state;
        if (info.facing !== undefined) this.facing = info.facing;
        if (info.weight) this.weight = info.weight;
        if (info.energy !== undefined) this.energy = info.energy;
        if (info.mood !== undefined) this.mood = info.mood;
        if (info.score !== undefined) this.score = info.score;
        if (info.day !== undefined) this.day = info.day;
        if (info.ready !== undefined) this.ready = info.ready;
        if (info.name) this.name = info.name;
        if (info.color) this.color = info.color;
    }

    showBubble(text) { this.bubble = text; this.bubbleTimer = 3.0; }

    tick(dt) {
        this.x += (this._tx - this.x) * Math.min(1, dt * 12);
        this.y += (this._ty - this.y) * Math.min(1, dt * 12);
        this.animTimer += dt;
        if (this.animTimer > 0.15) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 4; }
        if (this.bubbleTimer > 0) { this.bubbleTimer -= dt; if (this.bubbleTimer <= 0) this.bubble = null; }
    }

    get bodyWidth() { return this.weight >= 100 ? 32 : this.weight >= 85 ? 28 : this.weight >= 70 ? 24 : 20; }
    get bodyHeight() { return this.weight >= 100 ? 38 : this.weight >= 85 ? 34 : this.weight >= 70 ? 30 : 28; }

    renderGhost(ctx, camX = 0, camY = 0) {
        const px = Math.round(this.x - camX);
        const py = Math.round(this.y - camY);
        const bw = this.bodyWidth;
        const bh = this.bodyHeight;

        ctx.save();
        ctx.globalAlpha = 0.55;
        if (!this.facing) {
            ctx.translate(px + bw / 2, py); ctx.scale(-1, 1); ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }
        this._drawTinted(ctx, bw, bh);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, px + bw / 2, py - 6);
        ctx.textAlign = 'left';
        ctx.restore();

        if (this.bubble) this._renderBubble(ctx, px + bw / 2, py - 14);
    }

    renderInLobby(ctx, floorY) {
        const bw = this.bodyWidth;
        const bh = this.bodyHeight;
        const px = Math.round(this.x);
        const py = Math.round(floorY - bh);

        ctx.save();
        if (!this.facing) {
            ctx.translate(px + bw / 2, py); ctx.scale(-1, 1); ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }
        ctx.globalAlpha = 1;
        this._drawTinted(ctx, bw, bh);
        ctx.restore();

        ctx.fillStyle = this.color;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, px + bw / 2, py - 18);
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.fillText(`${this.weight.toFixed(1)} кг`, px + bw / 2, py - 6);
        if (this.ready) {
            ctx.fillStyle = '#4f4';
            ctx.font = '12px monospace';
            ctx.fillText('✓ ГОТОВ', px + bw / 2, py - 30);
        }
        if (this.bubble) this._renderBubble(ctx, px + bw / 2, py - 34);
        ctx.textAlign = 'left';
    }

    _drawTinted(ctx, bw, bh) {
        const color = this.color;
        const legOff = this.state === 'run' ? Math.sin(this.animFrame * 1.5) * 3 : 0;
        ctx.fillStyle = color;
        ctx.fillRect(2, bh - 14, bw / 2 - 3, 14 + legOff);
        ctx.fillRect(bw / 2 + 1, bh - 14, bw / 2 - 3, 14 - legOff);
        ctx.fillRect(1, Math.floor(bh * 0.35), bw - 2, Math.ceil(bh * 0.45));
        ctx.fillRect(Math.floor(bw * 0.1), Math.floor(bh * 0.06), Math.ceil(bw * 0.8), Math.ceil(bh * 0.28));
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(Math.floor(bw * 0.25), Math.floor(bh * 0.14), 3, 3);
        ctx.fillRect(Math.floor(bw * 0.60), Math.floor(bh * 0.14), 3, 3);
    }

    _renderBubble(ctx, cx, ty) {
        const text = this.bubble.substring(0, 20);
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.bubbleTimer);
        const bw = text.length * 7 + 10;
        const bx = cx - bw / 2;
        const by = ty - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(bx, by, bw, 20);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, cx, by + 13);
        ctx.textAlign = 'left';
        ctx.restore();
    }
}
