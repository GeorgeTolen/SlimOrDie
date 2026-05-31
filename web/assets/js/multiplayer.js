'use strict';

/**
 * MultiplayerClient wraps the WebSocket connection.
 * All received messages are dispatched through this.on(type, handler).
 */
class MultiplayerClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.playerId = null;
        this.playerColor = '#fff';
        this.handlers = {};
        this.reconnectTimer = null;
        this.pingInterval = null;
        this._moveThrottle = 0;
        this.MOVE_INTERVAL = 1 / 20; // 20 updates/s
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
            // Server may batch messages separated by newlines
            const lines = e.data.split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const msgs = JSON.parse(line);
                    this._dispatch(msgs);
                } catch (_) {}
            });
        };

        this.ws.onclose = () => {
            this.connected = false;
            console.log('[MP] disconnected');
            this._dispatch({ type: 'disconnected', payload: {} });
        };

        this.ws.onerror = err => {
            console.warn('[MP] error', err);
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    on(type, fn) {
        if (!this.handlers[type]) this.handlers[type] = [];
        this.handlers[type].push(fn);
        return this;
    }

    off(type) {
        delete this.handlers[type];
    }

    _dispatch(msg) {
        const handlers = this.handlers[msg.type] || [];
        handlers.forEach(h => h(msg.payload));
        const allHandlers = this.handlers['*'] || [];
        allHandlers.forEach(h => h(msg));
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type, payload }));
    }

    // --- Convenience methods ---

    join(name) {
        this.send('join', { name });
    }

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

    sendVote(choice) {
        this.send('vote', { choice });
    }

    sendActivityResult(activity, success, weightLost, newWeight) {
        this.send('activity_result', { activity, success, weight_lost: weightLost, new_weight: newWeight });
    }

    sendStatsUpdate(weight, energy, mood, score, day) {
        this.send('stats_update', { weight, energy, mood, score, day });
    }

    sendChat(text) {
        if (text && text.trim()) this.send('chat', { text: text.trim() });
    }

    sendReady() {
        this.send('ready', {});
    }
}

// Remote player — rendered as ghost in parkour and lobby
class RemotePlayer {
    constructor(info) {
        this.id = info.id;
        this.name = info.name;
        this.weight = info.weight || 110;
        this.color = info.color || '#fff';
        this.x = info.x || 0;
        this.y = info.y || 0;
        this.state = info.state || 'idle';
        this.facing = info.facing !== undefined ? info.facing : true;
        this.energy = info.energy || 100;
        this.mood = info.mood || 100;
        this.score = info.score || 0;
        this.day = info.day || 1;
        this.ready = info.ready || false;
        // Smooth interpolation targets
        this._tx = this.x;
        this._ty = this.y;
        this.animFrame = 0;
        this.animTimer = 0;
        // Speech bubble
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

    showBubble(text) {
        this.bubble = text;
        this.bubbleTimer = 3.0;
    }

    tick(dt) {
        // Lerp towards target position
        this.x += (this._tx - this.x) * Math.min(1, dt * 12);
        this.y += (this._ty - this.y) * Math.min(1, dt * 12);

        this.animTimer += dt;
        if (this.animTimer > 0.15) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        if (this.bubbleTimer > 0) {
            this.bubbleTimer -= dt;
            if (this.bubbleTimer <= 0) this.bubble = null;
        }
    }

    get bodyWidth() {
        if (this.weight >= 100) return 32;
        if (this.weight >= 85) return 28;
        if (this.weight >= 70) return 24;
        return 20;
    }
    get bodyHeight() {
        if (this.weight >= 100) return 38;
        if (this.weight >= 85) return 34;
        if (this.weight >= 70) return 30;
        return 28;
    }

    renderGhost(ctx, camX = 0, camY = 0) {
        const px = Math.round(this.x - camX);
        const py = Math.round(this.y - camY);
        const bw = this.bodyWidth;
        const bh = this.bodyHeight;

        ctx.save();
        ctx.globalAlpha = 0.55;

        if (!this.facing) {
            ctx.translate(px + bw / 2, py);
            ctx.scale(-1, 1);
            ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }

        // Draw tinted ghost version
        this._drawTinted(ctx, bw, bh);

        ctx.restore();

        // Name tag above ghost
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, px + bw / 2, py - 6);
        ctx.textAlign = 'left';
        ctx.restore();

        // Speech bubble
        if (this.bubble) {
            this._renderBubble(ctx, px + bw / 2, py - 14);
        }
    }

    _drawTinted(ctx, bw, bh) {
        const color = this.color;
        const legOff = this.state === 'run' ? Math.sin(this.animFrame * 1.5) * 3 : 0;

        ctx.fillStyle = color;
        // Legs
        ctx.fillRect(2, bh - 14, bw / 2 - 3, 14);
        ctx.fillRect(bw / 2 + 1, bh - 14, bw / 2 - 3, 14);
        if (this.state === 'run') {
            ctx.globalAlpha = 0.3;
            ctx.fillRect(2, bh - 14 + legOff, bw / 2 - 3, 6);
            ctx.fillRect(bw / 2 + 1, bh - 14 - legOff, bw / 2 - 3, 6);
            ctx.globalAlpha = 0.55;
        }
        // Body
        ctx.fillRect(1, Math.floor(bh * 0.35), bw - 2, Math.ceil(bh * 0.45));
        // Head
        ctx.fillRect(Math.floor(bw * 0.1), Math.floor(bh * 0.06), Math.ceil(bw * 0.8), Math.ceil(bh * 0.28));
        // Eyes as dark dots
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(Math.floor(bw * 0.25), Math.floor(bh * 0.14), 3, 3);
        ctx.fillRect(Math.floor(bw * 0.6), Math.floor(bh * 0.14), 3, 3);
    }

    _renderBubble(ctx, cx, ty) {
        const text = this.bubble.substring(0, 20);
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.bubbleTimer);
        const bw = text.length * 7 + 10;
        const bh = 20;
        const bx = cx - bw / 2;
        const by = ty - bh - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, cx, by + 13);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    renderInLobby(ctx, lobbyY) {
        const bw = this.bodyWidth;
        const bh = this.bodyHeight;
        const px = Math.round(this.x);
        const py = Math.round(lobbyY - bh);

        ctx.save();
        if (!this.facing) {
            ctx.translate(px + bw / 2, py);
            ctx.scale(-1, 1);
            ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }
        ctx.globalAlpha = 1;
        this._drawTinted(ctx, bw, bh);
        ctx.restore();

        // Name + weight tag
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

        if (this.bubble) {
            this._renderBubble(ctx, px + bw / 2, py - 34);
        }
        ctx.textAlign = 'left';
    }
}
