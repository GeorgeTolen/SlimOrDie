'use strict';

class Particle {
    constructor(x, y, opts = {}) {
        this.x = x; this.y = y;
        this.vx = opts.vx ?? (Math.random() - 0.5) * 60;
        this.vy = opts.vy ?? -Math.random() * 80 - 20;
        this.life = 1.0;
        this.decay = opts.decay ?? 0.8 + Math.random() * 0.5;
        this.size = opts.size ?? 2 + Math.random() * 3;
        this.color = opts.color ?? '#4af';
        this.gravity = opts.gravity ?? 80;
        this.alpha = 1.0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.vy += this.gravity * dt;
        this.y += this.vy * dt;
        this.life -= this.decay * dt;
        this.alpha = Math.max(0, this.life);
    }

    get alive() { return this.life > 0; }
}

class ParticleSystem {
    constructor(ctx) {
        this.ctx = ctx;
        this.particles = [];
    }

    emit(x, y, count, opts = {}) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, opts));
        }
    }

    emitSweat(x, y) {
        this.emit(x, y, 3, {
            color: '#4af',
            vx: (Math.random() - 0.5) * 40,
            vy: -Math.random() * 50 - 10,
            size: 2,
            decay: 1.5,
            gravity: 120,
        });
    }

    emitDust(x, y, dir = 1) {
        this.emit(x, y, 4, {
            color: '#b8a060',
            vx: dir * (Math.random() * 60 + 20),
            vy: -Math.random() * 20,
            size: 3,
            decay: 2.0,
            gravity: 40,
        });
    }

    emitStar(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.emit(x, y, 1, {
                color: '#ff0',
                vx: Math.cos(angle) * 80,
                vy: Math.sin(angle) * 80,
                size: 4,
                decay: 1.0,
                gravity: 0,
            });
        }
    }

    emitBlood(x, y) {
        this.emit(x, y, 6, {
            color: '#f44',
            vx: (Math.random() - 0.5) * 100,
            vy: -Math.random() * 80 - 30,
            size: 3,
            decay: 0.9,
            gravity: 150,
        });
    }

    emitFood(x, y, color) {
        this.emit(x, y, 5, {
            color,
            vx: (Math.random() - 0.5) * 70,
            vy: -Math.random() * 60 - 20,
            size: 4,
            decay: 1.2,
            gravity: 100,
        });
    }

    emitLevel(x, y) {
        const colors = ['#ff0', '#f80', '#0f0', '#0ff', '#f0f'];
        for (let i = 0; i < 20; i++) {
            this.emit(x, y, 1, {
                color: colors[i % colors.length],
                vx: (Math.random() - 0.5) * 200,
                vy: -Math.random() * 200 - 50,
                size: 5,
                decay: 0.6,
                gravity: 120,
            });
        }
    }

    update(dt) {
        this.particles = this.particles.filter(p => {
            p.update(dt);
            return p.alive;
        });
    }

    render(camX = 0, camY = 0) {
        const ctx = this.ctx;
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), Math.ceil(p.size), Math.ceil(p.size));
            ctx.restore();
        });
    }
}
