'use strict';

class ParkourGame {
    constructor(ctx, W, H, levelData, gameData, audio, particles, mp) {
        this.ctx = ctx;
        this.W = W; this.H = H;
        this.levelData = levelData;
        this.gameData = gameData;
        this.audio = audio;
        this.particles = particles;
        this.mp = mp || null;          // MultiplayerClient (optional)
        this.remotePlayers = {};       // id -> RemotePlayer

        this.player = null;
        this.platforms = [];
        this.obstacles = [];
        this.collectedItems = [];
        this.camX = 0;
        this.camY = 0;
        this.timer = 0;
        this.done = false;
        this.success = false;
        this.deathReason = '';
        this.deaths = 0;
        this.maxDeaths = 3;
        this.bossX = -200;
        this.bossTimer = 0;
        this.floatingTexts = [];

        this._keys = {};
        this._justJumped = false;
        this._justDashed = false;

        this._moveThrottle = 0;
        this._onKey = this._handleKey.bind(this);
        document.addEventListener('keydown', this._onKey);
        document.addEventListener('keyup', this._onKey);
        this._setupMPHandlers();
    }

    init() {
        const ld = this.levelData;
        this.player = new Player(ld.startX, ld.startY, this.gameData.weight);
        this.player.speed = this.gameData.speed;
        this.player.strength = this.gameData.strength;

        this.platforms = ld.platforms.map(p => ({ ...p }));
        this.obstacles = ld.obstacles.map(o => ({ ...o, collected: false }));
        this.collectedItems = [];
        this.timer = 0;
        this.done = false;
        this.success = false;
        this.bossX = -200;
        this.floatingTexts = [];

        // Init moving platform offsets
        this.platforms.forEach(p => {
            if (p.moving) { p._off = 0; p._dir = 1; p._ox = p.x; }
        });
    }

    _setupMPHandlers() {
        if (!this.mp) return;
        this.mp.on('player_move', p => {
            if (!this.remotePlayers[p.player_id]) {
                // Create a stub remote player at received position
                this.remotePlayers[p.player_id] = new RemotePlayer({
                    id: p.player_id, name: '???', weight: p.weight || 110,
                    color: '#aaf', x: p.x, y: p.y, state: p.state, facing: p.facing,
                });
            } else {
                this.remotePlayers[p.player_id].update({
                    x: p.x, y: p.y, state: p.state, facing: p.facing, weight: p.weight,
                });
            }
        });
        this.mp.on('player_join', p => {
            this.remotePlayers[p.id] = new RemotePlayer(p);
        });
        this.mp.on('player_leave', p => {
            delete this.remotePlayers[p.player_id];
        });
        this.mp.on('lobby_update', p => {
            (p.players || []).forEach(pi => {
                if (pi.id === this.mp.playerId) return;
                if (!this.remotePlayers[pi.id]) {
                    this.remotePlayers[pi.id] = new RemotePlayer(pi);
                } else {
                    this.remotePlayers[pi.id].update(pi);
                }
            });
        });
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('keyup', this._onKey);
        if (this.mp) {
            this.mp.off('player_move');
            this.mp.off('player_join');
            this.mp.off('player_leave');
            this.mp.off('lobby_update');
        }
    }

    _handleKey(e) {
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','Space','ShiftLeft','ShiftRight'].includes(e.code)) {
            e.preventDefault();
        }
        this._keys[e.code] = e.type === 'keydown';

        if (e.type === 'keydown') {
            if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
                if (!this._justJumped) {
                    this._justJumped = true;
                    if (this.player && this.player.alive) this.player.jump(this.audio);
                }
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                if (this.player && this.player.alive) this.player.dash(this.audio);
            }
        }
        if (e.type === 'keyup') {
            if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
                this._justJumped = false;
            }
        }
    }

    update(dt) {
        if (this.done) return;
        this.timer += dt;

        // Update moving platforms
        this.platforms.forEach(p => {
            if (!p.moving) return;
            p._off += p._dir * p.moveSpeed * dt;
            if (Math.abs(p._off) >= p.moveX) p._dir *= -1;
            p.x = p._ox + p._off;
        });

        // Boss on level 5
        if (this.levelData.hasBoss) {
            this.bossX += this.levelData.bossSpeed * (1 + this.timer * 0.005) * dt;
            this.bossTimer += dt;
        }

        if (this.player && this.player.alive) {
            this.player.applyInput(this._keys, dt);
            this.player.update(dt, this.platforms, this.obstacles, this.collectedItems, this.particles, this.audio);

            // Camera
            const targetCamX = this.player.x - this.W * 0.3;
            this.camX += (targetCamX - this.camX) * 8 * dt;
            this.camX = Math.max(0, Math.min(this.camX, this.levelData.width - this.W));

            // Fall death
            if (this.player.y > this.H + 100) {
                this.player.alive = false;
                this.deathReason = 'Упал в яму!';
                this._respawn();
                return;
            }

            // Boss catch
            if (this.levelData.hasBoss && this.bossX + 60 > this.player.x) {
                this.player.alive = false;
                this.deathReason = 'Тебя догнал бургер-монстр!';
                this._respawn();
                return;
            }

            // Finish — generous 100px wide trigger zone, only check X proximity
            const fx = this.levelData.finishX;
            if (this.player.x + this.player.bodyWidth >= fx - 40 && this.player.x < fx + 80) {
                this._complete();
            }
        }

        // Remote players tick
        Object.values(this.remotePlayers).forEach(rp => rp.tick(dt));

        // Send local position to multiplayer server
        if (this.mp && this.mp.connected && this.player) {
            this._moveThrottle += dt;
            if (this._moveThrottle >= 1 / 20) {
                this._moveThrottle = 0;
                this.mp.sendMove(
                    this.player.x, this.player.y,
                    this.player.state, this.player.facingRight,
                    this.gameData.weight
                );
            }
        }

        // Floating texts
        this.floatingTexts = this.floatingTexts.filter(t => {
            t.life -= dt;
            t.y -= 30 * dt;
            return t.life > 0;
        });
    }

    _respawn() {
        this.deaths++;
        if (this.deaths >= this.maxDeaths) {
            this.done = true;
            this.success = false;
            return;
        }
        this.audio && this.audio.playHurt();
        setTimeout(() => {
            if (!this.done) {
                const ld = this.levelData;
                this.player = new Player(ld.startX, ld.startY, this.gameData.weight);
                this.player.speed = this.gameData.speed;
                this.player.strength = this.gameData.strength;
                this.bossX = -200;
            }
        }, 1500);
    }

    _complete() {
        this.done = true;
        this.success = true;
        const ld = this.levelData;
        const loss = ld.weightLossMin + (Math.random() * (ld.weightLossMax - ld.weightLossMin));
        this.weightLost = parseFloat(loss.toFixed(1));
        this.timeBonus = Math.max(0, ld.par - Math.floor(this.timer));
        this.audio && this.audio.playLevelComplete();
        this.particles && this.particles.emitLevel(this.W / 2, this.H / 2);
    }

    addFloatingText(x, y, text, color = '#ff0') {
        this.floatingTexts.push({ x, y, text, color, life: 1.5 });
    }

    render() {
        const ctx = this.ctx;
        const ld = this.levelData;
        const camX = Math.round(this.camX);
        const camY = Math.round(this.camY);

        // Background
        ctx.fillStyle = ld.bgColor;
        ctx.fillRect(0, 0, this.W, this.H);

        // Background decorations
        this._renderBg(camX);

        // Platforms
        this.platforms.forEach(p => {
            const px = Math.round(p.x - camX);
            const py = Math.round(p.y - camY);
            if (px > this.W + 100 || px + p.w < -100) return;
            ctx.fillStyle = p.color || ld.groundColor;
            ctx.fillRect(px, py, p.w, p.h);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(px, py, p.w, 3);
            if (p.moving) {
                ctx.fillStyle = 'rgba(255,200,100,0.4)';
                ctx.fillRect(px, py, p.w, 3);
            }
        });

        // Obstacles and collectibles
        this.obstacles.forEach(o => {
            if (o.collected) return;
            const ox = Math.round(o.x - camX);
            const oy = Math.round(o.y - camY);
            if (ox > this.W + 100 || ox + (o.w || 30) < -100) return;
            this._renderObstacle(ctx, o, ox, oy);
        });

        // Finish flag
        const fx = Math.round(ld.finishX - camX);
        const fy = Math.round(ld.finishY - camY);
        this._renderFinish(ctx, fx, fy);

        // Remote players (ghosts)
        Object.values(this.remotePlayers).forEach(rp => {
            rp.renderGhost(ctx, camX, camY);
        });

        // Local player
        this.player && this.player.render(ctx, camX, camY);

        // Boss
        if (ld.hasBoss) this._renderBoss(ctx, camX);

        // Particles
        this.particles && this.particles.render(camX, camY);

        // Floating texts
        this.floatingTexts.forEach(t => {
            ctx.save();
            ctx.globalAlpha = t.life;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 16px monospace';
            ctx.fillText(t.text, Math.round(t.x - camX), Math.round(t.y - camY));
            ctx.restore();
        });

        // HUD
        this._renderHUD();

        // Death/respawn overlay
        if (this.player && !this.player.alive && !this.done) {
            ctx.fillStyle = 'rgba(200,0,0,0.4)';
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.deathReason}`, this.W / 2, this.H / 2 - 20);
            ctx.font = '18px monospace';
            ctx.fillText(`Осталось жизней: ${this.maxDeaths - this.deaths}`, this.W / 2, this.H / 2 + 20);
            ctx.textAlign = 'left';
        }
    }

    _renderBg(camX) {
        const ctx = this.ctx;
        const ld = this.levelData;
        // Simple cloud/mountain parallax
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let i = 0; i < 8; i++) {
            const cx = ((i * 600 + 50) - camX * 0.2) % (this.W + 200) - 100;
            const cy = 60 + (i % 3) * 40;
            ctx.fillRect(cx, cy, 80 + (i % 3) * 30, 20);
            ctx.fillRect(cx + 20, cy - 10, 40, 10);
        }
        // Ground line
        ctx.fillStyle = ld.groundColor;
        ctx.fillRect(0, 460, this.W, this.H);
    }

    _renderObstacle(ctx, o, ox, oy) {
        if (o.type === 'collectible') {
            if (o.subtype === 'water') {
                ctx.fillStyle = '#4af';
                ctx.fillRect(ox, oy + 6, 6, 14);
                ctx.fillRect(ox + 2, oy, 16, 20);
                ctx.fillStyle = '#8df';
                ctx.fillRect(ox + 4, oy + 4, 4, 6);
            } else if (o.subtype === 'protein') {
                ctx.fillStyle = '#fa0';
                ctx.fillRect(ox, oy, o.w, o.h);
                ctx.fillStyle = '#fc0';
                ctx.fillRect(ox + 4, oy + 4, 8, 6);
                ctx.fillStyle = '#fff';
                ctx.font = '8px monospace';
                ctx.fillText('P', ox + 7, oy + 14);
            } else if (o.subtype === 'fruit') {
                ctx.fillStyle = '#f44';
                ctx.beginPath();
                ctx.arc(ox + 10, oy + 12, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#4a2';
                ctx.fillRect(ox + 8, oy, 4, 8);
            }
        } else if (o.type === 'obstacle') {
            if (o.subtype === 'burger') {
                ctx.fillStyle = '#c85';
                ctx.fillRect(ox, oy + 20, 30, 10);
                ctx.fillStyle = '#a30';
                ctx.fillRect(ox + 2, oy + 14, 26, 8);
                ctx.fillStyle = '#4a0';
                ctx.fillRect(ox + 2, oy + 10, 26, 5);
                ctx.fillStyle = '#c85';
                ctx.fillRect(ox, oy, 30, 12);
                ctx.fillStyle = '#e95';
                ctx.fillRect(ox + 2, oy + 2, 6, 3);
                ctx.fillRect(ox + 10, oy + 1, 6, 3);
                ctx.fillRect(ox + 18, oy + 2, 6, 3);
            } else if (o.subtype === 'cola') {
                ctx.fillStyle = '#e33';
                ctx.fillRect(ox, oy + 8, o.w, o.h - 8);
                ctx.fillStyle = '#c22';
                ctx.fillRect(ox + 4, oy + 4, o.w - 8, 8);
                ctx.fillStyle = '#888';
                ctx.fillRect(ox + 6, oy, o.w - 12, 6);
                ctx.fillStyle = '#fff';
                ctx.font = '8px monospace';
                ctx.fillText('КОЛ', ox + 1, oy + 20);
            } else if (o.subtype === 'spikes') {
                ctx.fillStyle = '#888';
                const sw = o.w || 80;
                for (let i = 0; i < Math.floor(sw / 12); i++) {
                    ctx.fillStyle = '#aaa';
                    ctx.beginPath();
                    ctx.moveTo(ox + i * 12, oy + 20);
                    ctx.lineTo(ox + i * 12 + 6, oy);
                    ctx.lineTo(ox + i * 12 + 12, oy + 20);
                    ctx.fill();
                }
            }
        }
    }

    _renderFinish(ctx, fx, fy) {
        ctx.fillStyle = '#ff0';
        ctx.fillRect(fx, fy - 60, 4, 60);
        ctx.fillStyle = '#f00';
        ctx.fillRect(fx + 4, fy - 60, 30, 20);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('ФИНИШ', fx - 20, fy + 16);

        // Pulsing glow
        ctx.save();
        ctx.globalAlpha = 0.2 + 0.1 * Math.sin(Date.now() * 0.004);
        ctx.fillStyle = '#ff0';
        ctx.fillRect(fx - 10, fy - 70, 60, 80);
        ctx.restore();
    }

    _renderBoss(ctx, camX) {
        const bx = Math.round(this.bossX - camX);
        if (bx > this.W + 200 || bx < -200) return;
        const by = 360;
        const t = this.bossTimer;

        // Giant burger boss
        ctx.save();
        ctx.translate(bx, by + Math.sin(t * 3) * 6);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-30, 110, 120, 12);

        // Body (giant burger)
        ctx.fillStyle = '#c85';
        ctx.fillRect(0, 70, 80, 35);
        ctx.fillStyle = '#a30';
        ctx.fillRect(5, 45, 70, 28);
        ctx.fillStyle = '#4a0';
        ctx.fillRect(5, 38, 70, 10);
        ctx.fillStyle = '#e30';
        ctx.fillRect(5, 32, 70, 8);
        ctx.fillStyle = '#c85';
        ctx.fillRect(0, 5, 80, 30);

        // Sesame seeds
        ctx.fillStyle = '#e95';
        ctx.fillRect(10, 8, 8, 5);
        ctx.fillRect(30, 6, 8, 5);
        ctx.fillRect(50, 9, 8, 5);
        ctx.fillRect(65, 7, 8, 5);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(15, 14, 14, 12);
        ctx.fillRect(50, 14, 14, 12);
        ctx.fillStyle = '#f00';
        ctx.fillRect(19, 18, 6, 6);
        ctx.fillRect(54, 18, 6, 6);

        // Teeth
        ctx.fillStyle = '#fff';
        ctx.fillRect(10, 73, 12, 8);
        ctx.fillRect(26, 73, 12, 8);
        ctx.fillRect(42, 73, 12, 8);
        ctx.fillRect(58, 73, 12, 8);

        // Legs
        ctx.fillStyle = '#a30';
        ctx.fillRect(15, 100, 20, 15);
        ctx.fillRect(45, 100, 20, 15);

        ctx.restore();

        // Warning
        if (bx < this.W - 200) {
            ctx.fillStyle = '#f00';
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⚠ БУРГЕР-МОНСТР ДОГОНЯЕТ!', this.W / 2, 30);
            ctx.textAlign = 'left';
        }
    }

    _renderHUD() {
        const ctx = this.ctx;
        const W = this.W;
        // Timer
        const mins = Math.floor(this.timer / 60);
        const secs = Math.floor(this.timer % 60);
        const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, 40);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`УРОВЕНЬ ${this.levelData.id}: ${this.levelData.name}`, 10, 26);
        ctx.fillText(`⏱ ${timeStr}`, W - 120, 26);
        ctx.fillText(`♥ ${'■'.repeat(this.maxDeaths - this.deaths)}${'□'.repeat(this.deaths)}`, W / 2 - 40, 26);

        // Controls hint
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px monospace';
        ctx.fillText('←→:Бег  ↑/W:Прыжок  Shift:Рывок', 10, this.H - 8);
    }
}
