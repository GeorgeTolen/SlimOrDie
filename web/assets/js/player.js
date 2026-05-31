'use strict';

class Player {
    constructor(x, y, weight) {
        this.x = x; this.y = y;
        this.weight = weight;
        this.vx = 0; this.vy = 0;
        this.width = 28; this.height = 36;
        this.onGround = false;
        this.jumpsLeft = 2;
        this.alive = true;
        this.facingRight = true;
        this.animFrame = 0;
        this.animTimer = 0;
        this.state = 'idle'; // idle, run, jump, fall, hurt
        this.hurtTimer = 0;
        this.sweatTimer = 0;
        this.dashCooldown = 0;
        this.dashing = false;
        this.dashTimer = 0;
        this.speed = 1;
        this.strength = 1;

        this.GRAVITY = 800;
        this.JUMP_FORCE = -330;
        this.WALK_SPEED = 160;
        this.DASH_SPEED = 380;
        this.DASH_DURATION = 0.15;
        this.DASH_COOLDOWN = 0.8;
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

    jump(audio) {
        if (this.jumpsLeft > 0) {
            this.vy = this.JUMP_FORCE;
            this.jumpsLeft--;
            this.onGround = false;
            if (this.jumpsLeft === 1) audio && audio.playJump();
            else audio && audio.playDoubleJump();
            return true;
        }
        return false;
    }

    dash(audio) {
        if (this.dashCooldown > 0 || this.dashing) return;
        this.dashing = true;
        this.dashTimer = this.DASH_DURATION;
        this.dashCooldown = this.DASH_COOLDOWN;
        this.vx = this.facingRight ? this.DASH_SPEED : -this.DASH_SPEED;
        audio && audio.playJump();
    }

    applyInput(keys, dt) {
        let moveX = 0;
        if (keys['ArrowLeft'] || keys['KeyA']) moveX = -1;
        if (keys['ArrowRight'] || keys['KeyD']) moveX = 1;

        const spd = this.WALK_SPEED * (1 + (this.speed - 1) * 0.15) * (1 + (110 - this.weight) / 110 * 0.4);

        if (!this.dashing) {
            if (moveX !== 0) {
                this.vx = moveX * spd;
                this.facingRight = moveX > 0;
                this.state = this.onGround ? 'run' : this.state;
            } else {
                this.vx *= this.onGround ? 0.6 : 0.95;
                if (Math.abs(this.vx) < 5) this.vx = 0;
                if (this.onGround && this.state === 'run') this.state = 'idle';
            }
        }

        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        if (this.dashing) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.dashing = false;
                this.vx *= 0.4;
            }
        }
    }

    update(dt, platforms, obstacles, collectibles, particles, audio) {
        if (!this.alive) return;

        this.vy += this.GRAVITY * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.onGround = false;
        this._collidePlatforms(platforms, dt);

        if (this.onGround) this.jumpsLeft = 2;

        this.hurtTimer = Math.max(0, this.hurtTimer - dt);

        // Sweat effect
        this.sweatTimer -= dt;
        if (this.sweatTimer <= 0 && this.state === 'run') {
            this.sweatTimer = 0.3 + Math.random() * 0.3;
            particles && particles.emitSweat(this.x + this.bodyWidth / 2, this.y);
        }

        // Dust effect
        if (this.onGround && Math.abs(this.vx) > 100) {
            particles && particles.emitDust(this.x + (this.facingRight ? 0 : this.bodyWidth), this.y + this.bodyHeight, this.facingRight ? -1 : 1);
        }

        // Animation
        this.animTimer += dt;
        if (this.animTimer > 0.12) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        // State
        if (!this.onGround) {
            this.state = this.vy < 0 ? 'jump' : 'fall';
        } else if (Math.abs(this.vx) > 10) {
            this.state = 'run';
        } else {
            this.state = 'idle';
        }

        // Check obstacles
        if (obstacles) {
            for (const obs of obstacles) {
                if (this._overlaps(obs)) {
                    if (!obs.collected && obs.type === 'collectible') {
                        obs.collected = true;
                        particles && particles.emitStar(this.x + this.bodyWidth / 2, this.y + this.bodyHeight / 2);
                        audio && audio.playCollect();
                        collectibles && collectibles.push({ type: obs.subtype });
                    } else if (obs.type === 'obstacle' && this.hurtTimer <= 0) {
                        this.hurtTimer = 1.5;
                        particles && particles.emitBlood(this.x + this.bodyWidth / 2, this.y);
                        audio && audio.playHurt();
                        if (obs.deadly) this.alive = false;
                        return;
                    }
                }
            }
        }
    }

    _collidePlatforms(platforms, dt) {
        const TOLERANCE = 4;
        for (const p of platforms) {
            if (!this._overlaps(p)) continue;
            const ox = Math.min(this.x + this.bodyWidth, p.x + p.w) - Math.max(this.x, p.x);
            const oy = Math.min(this.y + this.bodyHeight, p.y + p.h) - Math.max(this.y, p.y);
            if (ox < oy) {
                if (this.x + this.bodyWidth / 2 < p.x + p.w / 2) this.x -= ox; else this.x += ox;
                this.vx = 0;
            } else {
                if (this.y + this.bodyHeight / 2 < p.y + p.h / 2) {
                    this.y -= oy;
                    if (this.vy > 0) { this.vy = 0; this.onGround = true; }
                } else {
                    this.y += oy;
                    if (this.vy < 0) this.vy = 0;
                }
            }
        }
    }

    _overlaps(rect) {
        return this.x < rect.x + (rect.w || rect.width) &&
               this.x + this.bodyWidth > rect.x &&
               this.y < rect.y + (rect.h || rect.height) &&
               this.y + this.bodyHeight > rect.y;
    }

    render(ctx, camX = 0, camY = 0) {
        if (!this.alive) return;
        const px = Math.round(this.x - camX);
        const py = Math.round(this.y - camY);
        const bw = this.bodyWidth;
        const bh = this.bodyHeight;
        const flash = this.hurtTimer > 0 && Math.floor(this.hurtTimer * 8) % 2 === 0;

        ctx.save();
        if (!this.facingRight) {
            ctx.translate(px + bw / 2, py);
            ctx.scale(-1, 1);
            ctx.translate(-bw / 2, 0);
        } else {
            ctx.translate(px, py);
        }

        if (flash) ctx.globalAlpha = 0.4;

        this._drawSprite(ctx, bw, bh);

        ctx.restore();
    }

    _drawSprite(ctx, bw, bh) {
        const w = this.weight;
        // Colors
        const skinColor = '#f4c2a1';
        const shirtColor = w >= 100 ? '#e83a3a' : w >= 85 ? '#e86a2a' : w >= 70 ? '#2a8ae8' : '#2adb5b';
        const pantsColor = '#2a2a6e';
        const eyeColor = '#1a1a1a';

        // Legs (animated)
        const legOff = this.state === 'run' ? Math.sin(this.animFrame * 1.5) * 3 : 0;
        ctx.fillStyle = pantsColor;
        ctx.fillRect(2, bh - 14, bw / 2 - 3, 14); // left leg
        ctx.fillRect(bw / 2 + 1, bh - 14, bw / 2 - 3, 14); // right leg
        // Leg animation
        if (this.state === 'run') {
            ctx.fillStyle = '#1a1a50';
            ctx.fillRect(2, bh - 14 + legOff, bw / 2 - 3, 6);
            ctx.fillRect(bw / 2 + 1, bh - 14 - legOff, bw / 2 - 3, 6);
        }

        // Shoes
        ctx.fillStyle = '#333';
        ctx.fillRect(0, bh - 4, bw / 2, 4);
        ctx.fillRect(bw / 2, bh - 4, bw / 2, 4);

        // Body
        ctx.fillStyle = shirtColor;
        const bodyY = bh - 14 - (bh - 14) * 0.55;
        ctx.fillRect(1, Math.floor(bodyY), bw - 2, Math.ceil((bh - 14) * 0.55));

        // Belly bump for fat characters
        if (w >= 90) {
            ctx.fillStyle = shirtColor;
            ctx.beginPath();
            ctx.arc(bw / 2, bodyY + (bh * 0.3), bw * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }

        // Arms
        const armY = Math.floor(bodyY) + 4;
        const armAnim = this.state === 'run' ? Math.sin(this.animFrame * 1.5) * 4 : 0;
        ctx.fillStyle = skinColor;
        ctx.fillRect(-4, armY + armAnim, 5, 10);
        ctx.fillRect(bw - 1, armY - armAnim, 5, 10);

        // Head
        const headW = bw * 0.9;
        const headH = bh * 0.28;
        const headX = (bw - headW) / 2;
        const headY = Math.floor(bodyY) - headH;
        ctx.fillStyle = skinColor;
        ctx.fillRect(Math.floor(headX), Math.floor(headY), Math.ceil(headW), Math.ceil(headH));

        // Hair
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(Math.floor(headX), Math.floor(headY), Math.ceil(headW), 4);

        // Eyes
        ctx.fillStyle = eyeColor;
        ctx.fillRect(Math.floor(headX + headW * 0.2), Math.floor(headY + headH * 0.3), 3, 3);
        ctx.fillRect(Math.floor(headX + headW * 0.6), Math.floor(headY + headH * 0.3), 3, 3);

        // Sweat drops when running
        if (this.state === 'run' && this.animFrame % 2 === 0) {
            ctx.fillStyle = '#4af';
            ctx.fillRect(Math.floor(headX + headW * 0.8), Math.floor(headY), 2, 3);
        }

        // Jump pose
        if (this.state === 'jump') {
            ctx.fillStyle = pantsColor;
            ctx.fillRect(0, bh - 10, bw, 10);
        }

        // Dash effect
        if (this.dashing) {
            ctx.fillStyle = 'rgba(100,200,255,0.3)';
            ctx.fillRect(-6, 0, bw + 12, bh);
        }
    }
}
