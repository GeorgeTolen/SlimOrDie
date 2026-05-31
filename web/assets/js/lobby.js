'use strict';

/**
 * LobbyManager handles the multiplayer lobby screen:
 * - Walking pixel characters for all players
 * - Vote system (parkour / gym / eat)
 * - Chat panel
 * - Day tracker
 * - Ready button
 */
class LobbyManager {
    constructor(ctx, W, H, mp, gameData, audio, particles) {
        this.ctx = ctx;
        this.W = W; this.H = H;
        this.mp = mp;
        this.gameData = gameData;
        this.audio = audio;
        this.particles = particles;

        this.remotePlayers = {}; // id -> RemotePlayer
        this.localX = 200;
        this.localDir = 1;
        this.localAnim = 0;
        this.localAnimTimer = 0;

        this.chat = [];        // { name, text, color, time }
        this.chatInput = '';
        this.chatActive = false;
        this.votes = {};       // playerId -> choice
        this.voteTally = {};
        this.readyCount = 0;
        this.totalCount = 1;
        this.gameDay = 1;
        this.phase = 'lobby';
        this.animTimer = 0;
        this.notification = null;
        this.notifTimer = 0;
        this.activityResults = []; // recent results

        this._keys = {};
        this._onKey = this._handleKey.bind(this);
        this._onClick = this._handleClick.bind(this);
        document.addEventListener('keydown', this._onKey);
        document.addEventListener('click', this._onClick);

        this._setupMPHandlers();
    }

    _setupMPHandlers() {
        const mp = this.mp;
        if (!mp) return;

        mp.on('lobby_update', p => {
            this.gameDay = p.game_day;
            this.phase = p.phase;
            this.votes = p.votes || {};
            this.readyCount = p.ready_count || 0;
            this.totalCount = p.total || 1;
            (p.players || []).forEach(pi => {
                if (pi.id === mp.playerId) return;
                if (!this.remotePlayers[pi.id]) {
                    this.remotePlayers[pi.id] = new RemotePlayer(pi);
                } else {
                    this.remotePlayers[pi.id].update(pi);
                }
            });
            // Remove disconnected players
            const alive = new Set((p.players || []).map(x => x.id));
            Object.keys(this.remotePlayers).forEach(id => {
                if (!alive.has(id)) delete this.remotePlayers[id];
            });
        });

        mp.on('player_join', p => {
            if (p.id === mp.playerId) return;
            this.remotePlayers[p.id] = new RemotePlayer(p);
            this._addChat(null, `${p.name} присоединился!`, '#4f4');
            this.particles && this.particles.emitStar(this.W / 2, this.H / 2);
        });

        mp.on('player_leave', p => {
            const rp = this.remotePlayers[p.player_id];
            if (rp) this._addChat(null, `${rp.name} вышел`, '#f44');
            delete this.remotePlayers[p.player_id];
        });

        mp.on('player_move', p => {
            if (this.remotePlayers[p.player_id]) {
                this.remotePlayers[p.player_id].update({
                    x: p.x, y: p.y, state: p.state, facing: p.facing, weight: p.weight,
                });
            }
        });

        mp.on('vote_update', p => {
            this.votes = p.votes || {};
            this.voteTally = p.tally || {};
        });

        mp.on('activity_result', p => {
            this.activityResults.unshift({
                text: `${p.player_name}: -${p.weight_lost.toFixed(1)} кг (${p.activity})`,
                color: p.color,
                time: 4,
            });
            if (this.activityResults.length > 5) this.activityResults.length = 5;
            this._addChat(null, `${p.player_name} завершил ${p.activity}!`, p.color);
        });

        mp.on('group_bonus', p => {
            this._setNotification(`🎉 ${p.reason} −${p.weight_drop} кг всем!`, '#ff0');
            this.particles && this.particles.emitLevel(this.W / 2, this.H / 2);
        });

        mp.on('stats_update', p => {
            if (this.remotePlayers[p.player_id]) {
                this.remotePlayers[p.player_id].update(p);
            }
        });

        mp.on('chat', p => {
            this._addChat(p.player_name, p.text, p.color);
            if (this.remotePlayers[p.player_id]) {
                this.remotePlayers[p.player_id].showBubble(p.text);
            }
        });

        mp.on('ready_status', p => {
            this.readyCount = p.ready_count;
            this.totalCount = p.total;
        });

        mp.on('day_start', p => {
            this.gameDay = p.day;
            this._setNotification(`🌅 ДЕНЬ ${p.day} НАЧИНАЕТСЯ!`, '#ff0');
        });

        mp.on('disconnected', () => {
            this._setNotification('Соединение потеряно. Переподключение...', '#f44');
        });
    }

    _addChat(name, text, color) {
        this.chat.unshift({ name, text, color: color || '#fff', time: Date.now() });
        if (this.chat.length > 30) this.chat.length = 30;
    }

    _setNotification(text, color) {
        this.notification = { text, color };
        this.notifTimer = 3.5;
    }

    _handleKey(e) {
        this._keys[e.code] = e.type === 'keydown';

        if (this.chatActive) {
            if (e.type !== 'keydown') return;
            e.preventDefault();
            if (e.code === 'Enter') {
                if (this.chatInput.trim()) {
                    this.mp && this.mp.sendChat(this.chatInput.trim());
                    this._addChat(this.gameData.playerName, this.chatInput.trim(), '#fff');
                    this.chatInput = '';
                }
                this.chatActive = false;
            } else if (e.code === 'Escape') {
                this.chatActive = false;
                this.chatInput = '';
            } else if (e.code === 'Backspace') {
                this.chatInput = this.chatInput.slice(0, -1);
            } else if (e.key.length === 1 && this.chatInput.length < 60) {
                this.chatInput += e.key;
            }
        } else {
            if (e.type === 'keydown' && e.code === 'KeyT') {
                this.chatActive = true;
                e.preventDefault();
            }
        }
    }

    _getCanvasMouse(e) {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    _handleClick(e) {
        if (this.chatActive) return;
        const { x, y } = this._getCanvasMouse(e);
        const W = this.W; const H = this.H;

        // Vote buttons
        const votes = [
            { id: 'parkour', label: '🏃 Паркур',   x: W/2 - 260, y: H - 160 },
            { id: 'gym',     label: '💪 Тренажёр',  x: W/2 - 90,  y: H - 160 },
            { id: 'food',    label: '🍽 Поесть',    x: W/2 + 80,  y: H - 160 },
        ];
        for (const v of votes) {
            if (x >= v.x && x <= v.x + 160 && y >= v.y && y <= v.y + 44) {
                this.mp && this.mp.sendVote(v.id);
                this.audio && this.audio.playClick();
                return;
            }
        }

        // Ready button
        if (x >= W/2 - 100 && x <= W/2 + 100 && y >= H - 100 && y <= H - 58) {
            this.mp && this.mp.sendReady();
            this.audio && this.audio.playClick();
            return;
        }

        // Chat activate area
        if (x >= 10 && x <= 320 && y >= H - 280 && y <= H - 50) {
            this.chatActive = true;
        }
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('click', this._onClick);
    }

    update(dt) {
        this.animTimer += dt;

        // Local player walking
        if (!this.chatActive) {
            const spd = 80;
            if (this._keys['ArrowLeft'] || this._keys['KeyA']) {
                this.localX -= spd * dt;
                this.localDir = -1;
            } else if (this._keys['ArrowRight'] || this._keys['KeyD']) {
                this.localX += spd * dt;
                this.localDir = 1;
            }
            this.localX = Math.max(60, Math.min(this.W - 100, this.localX));
        }

        this.localAnimTimer += dt;
        if (this.localAnimTimer > 0.15) {
            this.localAnimTimer = 0;
            this.localAnim = (this.localAnim + 1) % 4;
        }

        // Send local position to server
        if (this.mp && this.mp.connected) {
            const isMoving = this._keys['ArrowLeft'] || this._keys['KeyA'] ||
                             this._keys['ArrowRight'] || this._keys['KeyD'];
            this.mp.sendMoveThrottled(
                this.localX, 380,
                isMoving ? 'run' : 'idle',
                this.localDir > 0,
                this.gameData.weight,
                dt
            );
        }

        // Update remote players
        Object.values(this.remotePlayers).forEach(rp => rp.tick(dt));

        // Notification timer
        if (this.notifTimer > 0) {
            this.notifTimer -= dt;
            if (this.notifTimer <= 0) this.notification = null;
        }

        // Activity results timeout
        this.activityResults.forEach(r => r.time -= dt);
        this.activityResults = this.activityResults.filter(r => r.time > 0);
    }

    render() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.animTimer;

        // Sky
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#1a1a4a');
        grad.addColorStop(0.6, '#2a2a6a');
        grad.addColorStop(1, '#1a3a1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (let i = 0; i < 40; i++) {
            const sx = (i * 127) % W;
            const sy = (i * 179) % (H * 0.4);
            ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t * 2 + i)})`;
            ctx.fillRect(sx, sy, 2, 2);
        }

        // Ground
        ctx.fillStyle = '#2a4a1a';
        ctx.fillRect(0, H - 120, W, 120);
        ctx.fillStyle = '#3a6a2a';
        ctx.fillRect(0, H - 122, W, 4);

        // Building silhouettes in bg
        const buildings = [
            { x: 50,  w: 120, h: 160 },
            { x: 200, w: 80,  h: 200 },
            { x: 700, w: 100, h: 180 },
            { x: 820, w: 140, h: 140 },
        ];
        buildings.forEach(b => {
            ctx.fillStyle = '#0a0a2a';
            ctx.fillRect(b.x, H - 120 - b.h, b.w, b.h);
            // Windows
            ctx.fillStyle = 'rgba(255,200,100,0.3)';
            for (let wy = H - 120 - b.h + 10; wy < H - 130; wy += 24) {
                for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 20) {
                    if (Math.random() > 0.3) ctx.fillRect(wx, wy, 10, 14);
                }
            }
        });

        // Gym entrance in center
        ctx.fillStyle = '#2a2a4a';
        ctx.fillRect(W / 2 - 120, H - 240, 240, 120);
        ctx.fillStyle = '#3a3a6a';
        ctx.fillRect(W / 2 - 130, H - 250, 260, 18);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏋️ ФИТНЕС-ЦЕНТР', W / 2, H - 200);
        ctx.fillStyle = '#4a4a8a';
        ctx.fillRect(W / 2 - 30, H - 180, 60, 60);
        ctx.fillStyle = '#222';
        ctx.fillRect(W / 2 - 24, H - 174, 48, 48);

        // Render remote players in lobby
        Object.values(this.remotePlayers).forEach(rp => {
            rp.renderInLobby(ctx, H - 122);
        });

        // Render local player
        this._renderLocalPlayer();

        // Particles
        this.particles && this.particles.render(0, 0);

        // UI overlay
        this._renderTopBar();
        this._renderVotePanel();
        this._renderChatPanel();
        this._renderActivityFeed();
        this._renderControlHints();

        // Notification
        if (this.notification) {
            const alpha = Math.min(1, this.notifTimer);
            ctx.save();
            ctx.globalAlpha = alpha;
            const nW = 500;
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(W / 2 - nW / 2, H / 2 - 30, nW, 50);
            ctx.strokeStyle = this.notification.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(W / 2 - nW / 2, H / 2 - 30, nW, 50);
            ctx.fillStyle = this.notification.color;
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.notification.text, W / 2, H / 2 + 6);
            ctx.textAlign = 'left';
            ctx.restore();
        }
    }

    _renderLocalPlayer() {
        const ctx = this.ctx;
        const H = this.H;
        const gd = this.gameData;
        const bw = gd.weight >= 100 ? 32 : gd.weight >= 85 ? 28 : gd.weight >= 70 ? 24 : 20;
        const bh = gd.weight >= 100 ? 38 : gd.weight >= 85 ? 34 : gd.weight >= 70 ? 30 : 28;
        const py = H - 122 - bh;
        const px = Math.round(this.localX);
        const isMoving = this._keys['ArrowLeft'] || this._keys['KeyA'] ||
                         this._keys['ArrowRight'] || this._keys['KeyD'];
        const skinColor = '#f4c2a1';
        const shirtColor = gd.weight >= 100 ? '#e83a3a' : gd.weight >= 85 ? '#e86a2a' : '#2a8ae8';
        const legOff = isMoving ? Math.sin(this.localAnim * 1.5) * 3 : 0;

        ctx.save();
        if (this.localDir < 0) {
            ctx.translate(px + bw / 2, py);
            ctx.scale(-1, 1);
            ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }

        ctx.fillStyle = '#2a2a6e';
        ctx.fillRect(2, bh - 14, bw / 2 - 3, 14 + legOff);
        ctx.fillRect(bw / 2 + 1, bh - 14, bw / 2 - 3, 14 - legOff);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, bh - 4, bw / 2, 4);
        ctx.fillRect(bw / 2, bh - 4, bw / 2, 4);
        ctx.fillStyle = shirtColor;
        ctx.fillRect(1, Math.floor(bh * 0.36), bw - 2, Math.ceil(bh * 0.5));
        if (gd.weight >= 90) {
            ctx.beginPath();
            ctx.arc(bw / 2, bh * 0.58, bw * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = skinColor;
        ctx.fillRect(Math.floor(bw * 0.1), Math.floor(bh * 0.12), Math.ceil(bw * 0.8), Math.ceil(bh * 0.28));
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(Math.floor(bw * 0.1), Math.floor(bh * 0.12), Math.ceil(bw * 0.8), 4);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(Math.floor(bw * 0.22), Math.floor(bh * 0.18), 3, 3);
        ctx.fillRect(Math.floor(bw * 0.62), Math.floor(bh * 0.18), 3, 3);
        ctx.restore();

        // Name tag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(gd.playerName + ' (ты)', px + bw / 2, py - 18);
        ctx.fillStyle = '#ff0';
        ctx.font = '11px monospace';
        ctx.fillText(`${gd.weight.toFixed(1)} кг`, px + bw / 2, py - 6);
        ctx.textAlign = 'left';
    }

    _renderTopBar() {
        const ctx = this.ctx;
        const W = this.W;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, 46);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏋️ ПОХУДЕЙ ИЛИ УМРИ — ЛОББИ', W / 2, 30);
        ctx.fillStyle = '#aaa';
        ctx.font = '13px monospace';
        const online = 1 + Object.keys(this.remotePlayers).length;
        ctx.fillText(`👥 Онлайн: ${online}  |  ДЕНЬ ${this.gameDay}/5  |  Готовы: ${this.readyCount}/${this.totalCount}`, W / 2, 44);
        ctx.textAlign = 'left';
    }

    _renderVotePanel() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(W / 2 - 280, H - 170, 560, 120);
        ctx.strokeStyle = '#4af';
        ctx.lineWidth = 1;
        ctx.strokeRect(W / 2 - 280, H - 170, 560, 120);

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ВЫБЕРИ АКТИВНОСТЬ (ГОЛОСОВАНИЕ)', W / 2, H - 152);

        const voteOpts = [
            { id: 'parkour', label: '🏃 Паркур',   x: W/2 - 260, count: this.voteTally['parkour'] || 0 },
            { id: 'gym',     label: '💪 Тренажёр',  x: W/2 - 90,  count: this.voteTally['gym'] || 0 },
            { id: 'food',    label: '🍽 Поесть',    x: W/2 + 80,  count: this.voteTally['food'] || 0 },
        ];

        voteOpts.forEach(v => {
            const hasMyVote = this.votes[this.mp && this.mp.playerId] === v.id;
            ctx.fillStyle = hasMyVote ? '#2a6a2a' : '#2a2a4a';
            ctx.fillRect(v.x, H - 164, 160, 44);
            ctx.strokeStyle = hasMyVote ? '#4f4' : '#333';
            ctx.lineWidth = hasMyVote ? 2 : 1;
            ctx.strokeRect(v.x, H - 164, 160, 44);
            ctx.fillStyle = hasMyVote ? '#4f4' : '#fff';
            ctx.font = 'bold 15px monospace';
            ctx.fillText(v.label, v.x + 80, H - 140);
            ctx.fillStyle = '#ff0';
            ctx.font = '12px monospace';
            ctx.fillText(v.count > 0 ? `▲ ${v.count}` : '', v.x + 80, H - 126);
        });

        // Ready button
        ctx.fillStyle = '#2a5a2a';
        ctx.fillRect(W/2 - 100, H - 106, 200, 42);
        ctx.strokeStyle = '#4f4';
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 100, H - 106, 200, 42);
        ctx.fillStyle = '#4f4';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`✓ ГОТОВ (${this.readyCount}/${this.totalCount})`, W/2, H - 79);
        ctx.textAlign = 'left';
    }

    _renderChatPanel() {
        const ctx = this.ctx;
        const H = this.H;
        const panelH = 200;
        const panelY = H - panelH - 180;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(10, panelY, 310, panelH);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, panelY, 310, panelH);

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('💬 ЧАТ [T]', 18, panelY + 16);

        // Messages
        const visible = this.chat.slice(0, 8);
        visible.forEach((msg, i) => {
            const y = panelY + 32 + i * 20;
            ctx.fillStyle = msg.color;
            ctx.font = '11px monospace';
            const prefix = msg.name ? `${msg.name}: ` : '';
            const full = `${prefix}${msg.text}`;
            ctx.fillText(full.substring(0, 34), 14, y);
        });

        // Input box
        const inputY = panelY + panelH - 24;
        ctx.fillStyle = this.chatActive ? '#0a1a2a' : '#050a10';
        ctx.fillRect(10, inputY, 310, 22);
        ctx.strokeStyle = this.chatActive ? '#4af' : '#333';
        ctx.lineWidth = this.chatActive ? 2 : 1;
        ctx.strokeRect(10, inputY, 310, 22);
        ctx.fillStyle = this.chatActive ? '#fff' : '#555';
        ctx.font = '11px monospace';
        const disp = this.chatActive ? this.chatInput + '|' : 'Нажми T для чата...';
        ctx.fillText(disp.substring(0, 38), 14, inputY + 15);
    }

    _renderActivityFeed() {
        const ctx = this.ctx;
        const W = this.W;
        if (this.activityResults.length === 0) return;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W - 340, 56, 330, this.activityResults.length * 22 + 10);

        this.activityResults.forEach((r, i) => {
            ctx.save();
            ctx.globalAlpha = Math.min(1, r.time);
            ctx.fillStyle = r.color;
            ctx.font = '12px monospace';
            ctx.fillText(r.text, W - 334, 72 + i * 22);
            ctx.restore();
        });
    }

    _renderControlHints() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '11px monospace';
        ctx.fillText('←→: Ходить  T: Чат  Кликни голосование/Готов', 10, this.H - 8);
    }
}
