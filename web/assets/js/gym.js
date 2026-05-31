'use strict';

const GYM_EXERCISES = [
    {
        id: 'bench',
        name: 'Жим Лежа',
        icon: '🏋️',
        description: 'Быстро кликай мышкой!',
        reps: 15,
        weightLoss: [0.8, 1.8],
        strengthGain: 1,
        energyCost: 20,
        duration: 30,
    },
    {
        id: 'squat',
        name: 'Приседания',
        icon: '🦵',
        description: 'Нажимай ПРОБЕЛ в ритм!',
        reps: 20,
        weightLoss: [1.0, 2.2],
        strengthGain: 1,
        energyCost: 25,
        duration: 35,
    },
    {
        id: 'cardio',
        name: 'Кардио Дорожка',
        icon: '🏃',
        description: 'Чередуй A и D!',
        reps: 100,
        weightLoss: [1.5, 3.0],
        strengthGain: 0,
        speedGain: 1,
        energyCost: 30,
        duration: 40,
    },
    {
        id: 'cycle',
        name: 'Велотренажер',
        icon: '🚴',
        description: 'Чередуй ↑ и ↓!',
        reps: 80,
        weightLoss: [1.2, 2.5],
        strengthGain: 0,
        speedGain: 1,
        energyCost: 28,
        duration: 38,
    },
];

class GymGame {
    constructor(ctx, W, H, exercise, gameData, audio, particles) {
        this.ctx = ctx;
        this.W = W; this.H = H;
        this.exercise = exercise;
        this.gameData = gameData;
        this.audio = audio;
        this.particles = particles;

        this.reps = 0;
        this.targetReps = exercise.reps;
        this.timer = exercise.duration;
        this.done = false;
        this.success = false;
        this.animFrame = 0;
        this.animTimer = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.floatingTexts = [];

        // Bench press state
        this.barPos = 0.5;
        this.barTarget = 0.5;
        this.barGreenLow = 0.3;
        this.barGreenHigh = 0.7;
        this.holdingClick = false;
        this.clickPower = 0;
        this.lastKey = '';
        this.expectKey = 'KeyA';

        // Cardio/cycle
        this.runSpeed = 0;
        this.lastAlt = '';
        this.altTimer = 0;

        this._keys = {};
        this._clicks = 0;
        this._justClicked = false;

        this._onKey = this._handleKey.bind(this);
        this._onDown = this._handleClick.bind(this);
        this._onUp = () => { this.holdingClick = false; };

        document.addEventListener('keydown', this._onKey);
        document.addEventListener('keyup', e => { this._keys[e.code] = false; });
        document.addEventListener('mousedown', this._onDown);
        document.addEventListener('mouseup', this._onUp);
    }

    _handleKey(e) {
        if (['Space','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code)) e.preventDefault();
        this._keys[e.code] = true;

        if (this.exercise.id === 'squat' && e.code === 'Space') {
            this._doRep();
        }
        if (this.exercise.id === 'cardio') {
            if (e.code === 'KeyA' && this.expectKey === 'KeyA') {
                this.expectKey = 'KeyD';
                this._doRep();
            } else if (e.code === 'KeyD' && this.expectKey === 'KeyD') {
                this.expectKey = 'KeyA';
                this._doRep();
            }
        }
        if (this.exercise.id === 'cycle') {
            if (e.code === 'ArrowUp' && this.expectKey === 'ArrowUp') {
                this.expectKey = 'ArrowDown';
                this._doRep();
            } else if (e.code === 'ArrowDown' && this.expectKey === 'ArrowDown') {
                this.expectKey = 'ArrowUp';
                this._doRep();
            }
        }
    }

    _handleClick() {
        this.holdingClick = true;
        if (this.exercise.id === 'bench') {
            this.clickPower = Math.min(1.0, this.clickPower + 0.25);
            this._doRep();
        }
    }

    _doRep() {
        if (this.done) return;
        this.reps = Math.min(this.targetReps, this.reps + 1);
        this.audio && this.audio.playGymHit();
        this.shakeX = (Math.random() - 0.5) * 8;
        this.shakeY = (Math.random() - 0.5) * 4;
        this.particles && this.particles.emitSweat(this.W / 2 + this.shakeX, this.H / 2 + this.shakeY);
        this.floatingTexts.push({
            x: this.W / 2 + (Math.random() - 0.5) * 100,
            y: this.H / 2 - 60,
            text: `+1`,
            color: '#4f4',
            life: 0.8,
        });

        if (this.reps >= this.targetReps) {
            this._complete(true);
        }
    }

    _complete(success) {
        this.done = true;
        this.success = success;
        const ex = this.exercise;
        if (success) {
            this.audio && this.audio.playGymSuccess();
            this.weightLost = ex.weightLoss[0] + Math.random() * (ex.weightLoss[1] - ex.weightLoss[0]);
            this.weightLost = parseFloat(this.weightLost.toFixed(1));
            this.particles && this.particles.emitLevel(this.W / 2, this.H / 2);
        } else {
            this.weightLost = ex.weightLoss[0] * 0.3;
            this.weightLost = parseFloat(this.weightLost.toFixed(1));
        }
    }

    destroy() {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('mousedown', this._onDown);
        document.removeEventListener('mouseup', this._onUp);
    }

    update(dt) {
        if (this.done) return;
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            this._complete(this.reps >= this.targetReps * 0.7);
            return;
        }

        // Animation
        this.animTimer += dt;
        if (this.animTimer > 0.15) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }

        // Shake decay
        this.shakeX *= 0.8;
        this.shakeY *= 0.8;

        // Click power decay
        this.clickPower = Math.max(0, this.clickPower - dt * 0.8);

        // Run speed decay for cardio/cycle
        this.runSpeed = Math.max(0, this.runSpeed - dt * 2);
        this.altTimer = Math.max(0, this.altTimer - dt);

        // Cardio: penalize if too slow
        if ((this.exercise.id === 'cardio' || this.exercise.id === 'cycle') && this.altTimer <= 0) {
            this.altTimer = 0.5;
        }

        // Floating texts
        this.floatingTexts = this.floatingTexts.filter(t => {
            t.life -= dt;
            t.y -= 50 * dt;
            return t.life > 0;
        });

        // Particles
        if (this.reps > 0 && Math.random() < dt * 3) {
            this.particles && this.particles.emitSweat(
                this.W / 2 + (Math.random() - 0.5) * 60,
                this.H / 2 - 20
            );
        }
    }

    render() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        // BG
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);

        // Gym background
        ctx.fillStyle = '#2a2a3e';
        ctx.fillRect(0, H - 100, W, 100);
        ctx.fillStyle = '#333355';
        ctx.fillRect(0, H - 102, W, 4);

        // Equipment in background
        this._renderGymBg();

        const sx = this.shakeX;
        const sy = this.shakeY;

        ctx.save();
        ctx.translate(sx, sy);

        // Character doing exercise
        this._renderCharacter();

        ctx.restore();

        // Particles
        this.particles && this.particles.render(0, 0);

        // Progress bar
        this._renderProgress();

        // Timer
        this._renderTimer();

        // Floating texts
        this.floatingTexts.forEach(t => {
            ctx.save();
            ctx.globalAlpha = t.life;
            ctx.fillStyle = t.color;
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x, t.y);
            ctx.restore();
        });

        // Instructions
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.exercise.description, W / 2, H - 20);
        ctx.textAlign = 'left';

        // Completion overlay
        if (this.done) {
            ctx.fillStyle = this.success ? 'rgba(0,180,0,0.5)' : 'rgba(180,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 36px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.success ? 'ОТЛИЧНО!' : 'СЛАБАК!', W / 2, H / 2 - 20);
            ctx.font = '22px monospace';
            ctx.fillText(this.success ? `Сброшено: -${this.weightLost} кг` : `Сброшено: -${this.weightLost} кг`, W / 2, H / 2 + 30);
            ctx.textAlign = 'left';
        }
    }

    _renderGymBg() {
        const ctx = this.ctx;
        const H = this.H;
        // Weights on shelf
        ctx.fillStyle = '#555';
        ctx.fillRect(50, H - 150, 80, 8);
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#777';
            ctx.fillRect(60 + i * 22, H - 160, 14, 12);
        }
        // Treadmill
        ctx.fillStyle = '#444';
        ctx.fillRect(this.W - 200, H - 140, 140, 60);
        ctx.fillStyle = '#333';
        ctx.fillRect(this.W - 195, H - 150, 130, 15);
        // Motivational poster
        ctx.fillStyle = '#2a2a5e';
        ctx.fillRect(this.W / 2 - 80, 40, 160, 80);
        ctx.fillStyle = '#4a4aae';
        ctx.fillRect(this.W / 2 - 76, 44, 152, 72);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('НЕТ БОЛИ —', this.W / 2, 80);
        ctx.fillText('НЕТ РЕЗУЛЬТАТА!', this.W / 2, 100);
        ctx.textAlign = 'left';
    }

    _renderCharacter() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const ex = this.exercise;
        const af = this.animFrame;
        const w = this.gameData.weight;

        // Character color based on weight
        const shirtColor = w >= 100 ? '#e83a3a' : w >= 85 ? '#e86a2a' : '#2a8ae8';
        const skinColor = '#f4c2a1';

        if (ex.id === 'bench') {
            // Bench press: character lying on bench
            const bx = W / 2 - 60;
            const by = H - 200;

            // Bench
            ctx.fillStyle = '#444';
            ctx.fillRect(bx - 20, by + 50, 160, 12);
            ctx.fillStyle = '#333';
            ctx.fillRect(bx - 20, by + 62, 20, 40);
            ctx.fillRect(bx + 120, by + 62, 20, 40);

            // Barbell
            const liftY = by + 20 - af * 6;
            ctx.fillStyle = '#888';
            ctx.fillRect(bx - 40, liftY, 200, 8);
            ctx.fillStyle = '#555';
            ctx.fillRect(bx - 40, liftY - 4, 20, 16);
            ctx.fillRect(bx + 140, liftY - 4, 20, 16);
            ctx.fillStyle = '#777';
            ctx.fillRect(bx - 50, liftY - 8, 16, 24);
            ctx.fillRect(bx + 154, liftY - 8, 16, 24);

            // Body
            ctx.fillStyle = shirtColor;
            ctx.fillRect(bx, by + 20, 120, 38);
            ctx.fillStyle = skinColor;
            ctx.fillRect(bx + 40, by + 8, 40, 22);
            ctx.fillStyle = '#3a2010';
            ctx.fillRect(bx + 42, by + 8, 36, 5);
            // Arms stretched up
            ctx.fillStyle = skinColor;
            ctx.fillRect(bx - 10, liftY + 4, 30, 20);
            ctx.fillRect(bx + 100, liftY + 4, 30, 20);

        } else if (ex.id === 'squat') {
            // Squat
            const cx = W / 2 - 20;
            const squat = af % 2 === 0 ? 0 : 16;

            // Barbell on shoulders
            ctx.fillStyle = '#888';
            ctx.fillRect(cx - 50, H - 200 + squat, 140, 8);
            ctx.fillStyle = '#555';
            ctx.fillRect(cx - 60, H - 200 + squat, 16, 20);
            ctx.fillRect(cx + 84, H - 200 + squat, 16, 20);

            // Body
            ctx.fillStyle = shirtColor;
            ctx.fillRect(cx, H - 190 + squat, 50, 60);
            ctx.fillStyle = '#2a2a6e';
            ctx.fillRect(cx, H - 130 + squat, 50, 40 - squat);
            // Legs bent on squat
            ctx.fillRect(cx - 10, H - 90, 20, 50);
            ctx.fillRect(cx + 40, H - 90, 20, 50);
            // Head
            ctx.fillStyle = skinColor;
            ctx.fillRect(cx + 8, H - 218 + squat, 34, 28);

        } else if (ex.id === 'cardio') {
            // Treadmill running
            const cx = W / 2 - 30;
            const runAf = this.reps % 4;
            const legSwing = Math.sin(runAf * 1.5) * 15;

            // Treadmill
            ctx.fillStyle = '#333';
            ctx.fillRect(cx - 30, H - 140, 180, 60);
            ctx.fillStyle = '#444';
            ctx.fillRect(cx - 25, H - 150, 170, 15);
            // Belt
            ctx.fillStyle = '#222';
            ctx.fillRect(cx - 20, H - 138, 160, 8);

            // Running character
            ctx.fillStyle = shirtColor;
            ctx.fillRect(cx + 30, H - 220, 50, 60);
            ctx.fillStyle = '#2a2a6e';
            ctx.fillRect(cx + 30, H - 160, 50, 25);
            // Legs alternating
            ctx.fillStyle = '#2a2a6e';
            ctx.fillRect(cx + 30, H - 135 + legSwing, 20, 30);
            ctx.fillRect(cx + 60, H - 135 - legSwing, 20, 30);
            // Head
            ctx.fillStyle = skinColor;
            ctx.fillRect(cx + 38, H - 240, 34, 28);
            // Arms pumping
            ctx.fillStyle = skinColor;
            ctx.fillRect(cx + 14, H - 205 - legSwing * 0.5, 20, 12);
            ctx.fillRect(cx + 76, H - 205 + legSwing * 0.5, 20, 12);

        } else if (ex.id === 'cycle') {
            // Cycling
            const cx = W / 2 - 60;
            const pedalAf = (this.reps % 8);
            const wheelRot = pedalAf * 45;

            // Bike frame
            ctx.fillStyle = '#888';
            ctx.fillRect(cx + 20, H - 140, 100, 8);
            ctx.fillRect(cx + 60, H - 200, 8, 64);
            ctx.fillRect(cx + 20, H - 200, 8, 64);

            // Wheels
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx + 24, H - 108, 36, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + 116, H - 108, 36, 0, Math.PI * 2);
            ctx.stroke();

            // Pedals
            const px1 = cx + 68 + Math.cos((wheelRot * Math.PI / 180)) * 18;
            const py1 = H - 148 + Math.sin((wheelRot * Math.PI / 180)) * 18;
            const px2 = cx + 68 - Math.cos((wheelRot * Math.PI / 180)) * 18;
            const py2 = H - 148 - Math.sin((wheelRot * Math.PI / 180)) * 18;
            ctx.fillStyle = '#555';
            ctx.fillRect(px1 - 6, py1 - 4, 12, 8);
            ctx.fillRect(px2 - 6, py2 - 4, 12, 8);

            // Rider
            ctx.fillStyle = shirtColor;
            ctx.fillRect(cx + 38, H - 220, 50, 55);
            ctx.fillStyle = '#2a2a6e';
            ctx.fillRect(cx + 38, H - 165, 50, 20);
            // Legs on pedals
            ctx.fillStyle = '#2a2a6e';
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#2a2a6e';
            ctx.beginPath();
            ctx.moveTo(cx + 63, H - 145);
            ctx.lineTo(px1, py1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 63, H - 145);
            ctx.lineTo(px2, py2);
            ctx.stroke();
            // Head
            ctx.fillStyle = skinColor;
            ctx.fillRect(cx + 46, H - 240, 34, 28);
        }
    }

    _renderProgress() {
        const ctx = this.ctx;
        const W = this.W;
        const progress = this.reps / this.targetReps;
        const barW = W * 0.6;
        const barX = (W - barW) / 2;
        const barY = 30;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX - 10, barY - 10, barW + 20, 36);

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, 16);

        const col = progress < 0.4 ? '#f44' : progress < 0.7 ? '#fa0' : '#4f4';
        ctx.fillStyle = col;
        ctx.fillRect(barX, barY, barW * progress, 16);

        ctx.fillStyle = '#fff';
        ctx.fillRect(barX, barY, 2, 16);
        ctx.fillRect(barX + barW - 2, barY, 2, 16);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.reps} / ${this.targetReps} повторений`, W / 2, barY + 32);
        ctx.textAlign = 'left';
    }

    _renderTimer() {
        const ctx = this.ctx;
        const t = Math.ceil(this.timer);
        const urgent = t <= 10;

        ctx.fillStyle = urgent ? '#f44' : '#fff';
        ctx.font = `bold ${urgent ? 28 : 22}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`⏱ ${t}с`, this.W - 20, 26);
        ctx.textAlign = 'left';

        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.exercise.icon} ${this.exercise.name}`, this.W / 2, this.H - 50);
        ctx.textAlign = 'left';
    }
}
