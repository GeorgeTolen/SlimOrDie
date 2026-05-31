'use strict';

class UIManager {
    constructor(ctx, W, H) {
        this.ctx = ctx;
        this.W = W; this.H = H;
        this.glitchTimer = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.flashAlpha = 0;
        this.flashColor = '#f00';
        this.animTimer = 0;
    }

    update(dt) {
        this.glitchTimer += dt;
        this.shakeX *= 0.75;
        this.shakeY *= 0.75;
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2);
        this.animTimer += dt;
    }

    triggerShake(strength = 15) {
        this.shakeX = (Math.random() - 0.5) * strength * 2;
        this.shakeY = (Math.random() - 0.5) * strength;
    }

    triggerFlash(color = '#f00', alpha = 0.8) {
        this.flashColor = color;
        this.flashAlpha = alpha;
    }

    drawPixelText(text, x, y, size = 16, color = '#fff', shadow = true) {
        const ctx = this.ctx;
        if (shadow) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${size}px monospace`;
            ctx.fillText(text, x + 2, y + 2);
        }
        ctx.fillStyle = color;
        ctx.font = `bold ${size}px monospace`;
        ctx.fillText(text, x, y);
    }

    // ── Exit button ─────────────────────────────────────────────────────────────
    // Draws a consistent "← Выйти" button at top-right. Returns its hit rect.
    drawExitBtn(label = '← Выйти', hovered = false) {
        const ctx = this.ctx;
        const W = this.W;
        const bx = W - 130; const by = 8; const bw = 120; const bh = 30;
        ctx.fillStyle = hovered ? '#5a1a1a' : 'rgba(60,10,10,0.85)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = hovered ? '#f44' : '#622';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = hovered ? '#f88' : '#f44';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + bw / 2, by + 20);
        ctx.textAlign = 'left';
        return { x: bx, y: by, w: bw, h: bh };
    }

    // Returns true if (mx,my) is inside the exit button area
    isExitBtnHit(mx, my) {
        const bx = this.W - 130; const by = 8;
        return mx >= bx && mx <= bx + 120 && my >= by && my <= by + 30;
    }

    drawPanel(x, y, w, h, color = '#16162a', border = '#4a4aff') {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        // Pixel corners
        ctx.fillStyle = border;
        ctx.fillRect(x, y, 4, 4);
        ctx.fillRect(x + w - 4, y, 4, 4);
        ctx.fillRect(x, y + h - 4, 4, 4);
        ctx.fillRect(x + w - 4, y + h - 4, 4, 4);
    }

    drawButton(x, y, w, h, label, hover, color = '#2a5a8a') {
        const ctx = this.ctx;
        ctx.fillStyle = hover ? '#3a7aaa' : color;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, y, w, 4);
        ctx.fillStyle = hover ? '#5af' : '#fff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y + h / 2 + 6);
        ctx.textAlign = 'left';
    }

    drawProgressBar(x, y, w, h, value, max, color = '#4f4', bg = '#222') {
        const ctx = this.ctx;
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, w, h);
        const fill = Math.max(0, (value / max)) * w;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, fill, h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x, y, fill, 3);
    }

    renderMainMenu(gameData, hovered, saves, leaderboard) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        // Background gradient
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);

        // Animated background pixels
        const t = this.animTimer;
        for (let i = 0; i < 30; i++) {
            const px = ((i * 137 + t * 20) % W);
            const py = ((i * 211 + t * 15) % H);
            ctx.fillStyle = `rgba(${i * 8 % 255},${i * 13 % 255},${i * 7 % 255},0.15)`;
            ctx.fillRect(Math.floor(px), Math.floor(py), 3, 3);
        }

        // Title
        const titlePulse = 0.95 + 0.05 * Math.sin(t * 2);
        ctx.save();
        ctx.translate(W / 2, 120);
        ctx.scale(titlePulse, titlePulse);

        ctx.fillStyle = '#f00';
        ctx.font = 'bold 52px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ПОХУДЕЙ', 0, 0);
        ctx.fillStyle = '#ff0';
        ctx.fillText('ИЛИ УМРИ', 0, 54);

        ctx.restore();

        // Subtitle
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Симулятор выживания 2024 | Pixel Art Edition', W / 2, 200);

        // Fat hero sprite
        this._drawHero(W / 2 - 20, 215, 110);

        // Buttons
        const btns = [
            { label: '▶  НОВАЯ ИГРА', id: 'new', y: 340 },
            { label: '📂  ЗАГРУЗИТЬ', id: 'load', y: 390, disabled: !saves || saves.length === 0 },
            { label: '🏆  РЕКОРДЫ', id: 'leaderboard', y: 440 },
            { label: '⚙   НАСТРОЙКИ', id: 'settings', y: 490 },
        ];

        btns.forEach(btn => {
            const isHov = hovered === btn.id;
            const col = btn.disabled ? '#1a1a3a' : isHov ? '#3a7aaa' : '#2a5a8a';
            ctx.fillStyle = col;
            ctx.fillRect(W / 2 - 160, btn.y, 320, 38);
            if (!btn.disabled) {
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(W / 2 - 160, btn.y, 320, 4);
            }
            ctx.fillStyle = btn.disabled ? '#444' : isHov ? '#5af' : '#fff';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(btn.label, W / 2, btn.y + 26);
        });

        // Version
        ctx.fillStyle = '#333';
        ctx.font = '11px monospace';
        ctx.fillText('v1.0.0  |  Нажми для звука', W / 2, H - 16);
        ctx.textAlign = 'left';
    }

    _drawHero(x, y, weight) {
        const ctx = this.ctx;
        const bw = weight >= 100 ? 48 : weight >= 80 ? 38 : 30;
        const bh = weight >= 100 ? 54 : weight >= 80 ? 44 : 36;
        const skinColor = '#f4c2a1';
        const shirtColor = weight >= 100 ? '#e83a3a' : weight >= 85 ? '#e86a2a' : '#2a8ae8';

        ctx.fillStyle = '#2a2a6e';
        ctx.fillRect(x + 2, y + bh - 16, bw / 2 - 3, 16);
        ctx.fillRect(x + bw / 2 + 1, y + bh - 16, bw / 2 - 3, 16);
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y + bh - 4, bw / 2, 4);
        ctx.fillRect(x + bw / 2, y + bh - 4, bw / 2, 4);
        ctx.fillStyle = shirtColor;
        ctx.fillRect(x + 1, y + bh * 0.4, bw - 2, bh * 0.6 - 16);
        if (weight >= 90) {
            ctx.beginPath();
            ctx.arc(x + bw / 2, y + bh * 0.6, bw * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = skinColor;
        ctx.fillRect(x + bw * 0.1, y + bh * 0.12, bw * 0.8, bh * 0.28);
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(x + bw * 0.1, y + bh * 0.12, bw * 0.8, 4);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + bw * 0.22, y + bh * 0.18, 4, 4);
        ctx.fillRect(x + bw * 0.62, y + bh * 0.18, 4, 4);
    }

    renderHUD(gameData) {
        const ctx = this.ctx;
        const W = this.W;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, 50);

        // Day indicator
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`ДЕНЬ ${gameData.day}/5`, 10, 32);

        // Weight
        const weightColor = gameData.weight >= 100 ? '#f44' : gameData.weight >= 80 ? '#fa0' : '#4f4';
        ctx.fillStyle = weightColor;
        ctx.fillText(`⚖ ${gameData.weight.toFixed(1)} кг`, 120, 32);

        // Stats bars
        const bars = [
            { label: 'Энерг', val: gameData.energy, max: 100, color: '#ff0', x: 280 },
            { label: 'Настр', val: gameData.mood, max: 100, color: '#f8f', x: 440 },
        ];

        bars.forEach(b => {
            ctx.fillStyle = '#aaa';
            ctx.font = '11px monospace';
            ctx.fillText(b.label, b.x, 18);
            this.drawProgressBar(b.x, 22, 120, 12, b.val, b.max, b.color);
            ctx.fillStyle = '#fff';
            ctx.font = '11px monospace';
            ctx.fillText(Math.round(b.val), b.x + 125, 33);
        });

        // Strength / Speed
        ctx.fillStyle = '#4af';
        ctx.font = '13px monospace';
        ctx.fillText(`💪${gameData.strength}  🏃${gameData.speed}`, 620, 32);

        // Score
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`★ ${gameData.score}`, W - 140, 32);
        ctx.textAlign = 'left';

        // Exit button inside HUD bar
        ctx.fillStyle = 'rgba(80,10,10,0.9)';
        ctx.fillRect(W - 126, 8, 116, 30);
        ctx.strokeStyle = '#622';
        ctx.lineWidth = 1;
        ctx.strokeRect(W - 126, 8, 116, 30);
        ctx.fillStyle = '#f44';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✕ Выйти', W - 68, 28);
        ctx.textAlign = 'left';
    }

    renderMorning(gameData, lastNightEvents, hovered = null) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#ff6a00');
        grad.addColorStop(0.4, '#ffb347');
        grad.addColorStop(1, '#87CEEB');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Sun
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(120, 100, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(120, 100, 40, 0, Math.PI * 2);
        ctx.fill();

        // Ground
        ctx.fillStyle = '#4a7c2f';
        ctx.fillRect(0, H - 100, W, 100);

        // House/room
        ctx.fillStyle = '#e8d8b8';
        ctx.fillRect(W / 2 - 200, H - 300, 400, 200);
        ctx.fillStyle = '#c8a870';
        ctx.fillRect(W / 2 - 220, H - 320, 440, 30);

        // Scale
        ctx.fillStyle = '#888';
        ctx.fillRect(W / 2 - 30, H - 115, 60, 10);
        ctx.fillRect(W / 2 - 20, H - 105, 40, 5);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(W / 2 - 25, H - 130, 50, 20);
        ctx.fillStyle = '#333';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${gameData.weight.toFixed(1)}`, W / 2, H - 118);

        this._drawHero(W / 2 - 20, H - 240, gameData.weight);

        // Panel
        this.drawPanel(W / 2 - 280, 50, 560, 200, 'rgba(0,0,20,0.85)', '#ff0');

        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`🌅 УТРО — ДЕНЬ ${gameData.day}`, W / 2, 90);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText(`Вес: ${gameData.weight.toFixed(1)} кг`, W / 2, 118);
        ctx.fillText(`Цель: похудеть до 80 кг`, W / 2, 140);

        const target = 80;
        const remaining = gameData.weight - target;
        const color = remaining <= 0 ? '#4f4' : remaining <= 10 ? '#fa0' : '#f44';
        ctx.fillStyle = color;
        ctx.fillText(remaining > 0 ? `Нужно сбросить: ${remaining.toFixed(1)} кг` : `🎉 Цель достигнута!`, W / 2, 162);

        if (lastNightEvents && lastNightEvents.length > 0) {
            ctx.fillStyle = '#aaa';
            ctx.font = '13px monospace';
            lastNightEvents.forEach((ev, i) => {
                ctx.fillText(ev, W / 2, 188 + i * 18);
            });
        }

        ctx.fillStyle = '#4f4';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('[ПРОБЕЛ / КЛИК - ПРОДОЛЖИТЬ]', W / 2, 270);
        ctx.textAlign = 'left';
        this.drawExitBtn('← Меню', hovered === 'exit');
    }

    renderDaySelect(gameData, hovered, day, completedToday) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (let i = 0; i < 50; i++) {
            const sx = ((i * 137 + 50) % W);
            const sy = ((i * 211 + 80) % (H - 200));
            ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`;
            ctx.fillRect(sx, sy, 2, 2);
        }

        this.drawPanel(W / 2 - 320, 20, 640, 90, 'rgba(0,0,30,0.9)', '#4a4aff');
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`ДЕНЬ ${day} — ВЫБЕРИ АКТИВНОСТЬ`, W / 2, 58);
        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`Вес: ${gameData.weight.toFixed(1)} кг  |  Энергия: ${Math.round(gameData.energy)}%`, W / 2, 90);

        // Activities
        const activities = [
            {
                id: 'breakfast',
                label: '🍳 ЗАВТРАК',
                desc: 'Выбери правильный завтрак для энергии',
                sub: 'Влияет на вес и энергию',
                color: '#2a6a2a',
                hcolor: '#3a8a3a',
                done: completedToday.breakfast,
            },
            {
                id: 'parkour',
                label: '🏃 ПАРКУР',
                desc: 'Пробеги уровень и сбрось килограммы',
                sub: `-${LEVELS[(day-1) % LEVELS.length].weightLossMin}-${LEVELS[(day-1) % LEVELS.length].weightLossMax} кг`,
                color: '#2a2a8a',
                hcolor: '#3a3aaa',
                done: completedToday.parkour,
            },
            {
                id: 'gym',
                label: '💪 ТРЕНАЖЁРКА',
                desc: 'Тренируйся и качай мышцы',
                sub: '-1-3 кг | +сила',
                color: '#6a2a2a',
                hcolor: '#8a3a3a',
                done: completedToday.gym,
            },
            {
                id: 'dinner',
                label: '🍽 УЖИН',
                desc: 'Ешь правильно чтобы не поправиться',
                sub: 'Влияет на вес ночью',
                color: '#4a4a2a',
                hcolor: '#6a6a3a',
                done: completedToday.dinner,
            },
            {
                id: 'sleep',
                label: '💤 СПАТЬ',
                desc: 'Завершить день и перейти к следующему',
                sub: 'Обязательно 8 часов',
                color: '#2a4a4a',
                hcolor: '#3a6a6a',
                done: false,
                require: completedToday.breakfast && completedToday.dinner,
            },
        ];

        const cardW = 580; const cardH = 72;
        const startX = (W - cardW) / 2;
        let cardY = 120;

        activities.forEach((act, i) => {
            const isHov = hovered === act.id;
            const isDisabled = act.done || (act.require === false);
            const col = isDisabled ? '#1a1a2a' : isHov ? act.hcolor : act.color;

            ctx.fillStyle = col;
            ctx.fillRect(startX, cardY, cardW, cardH);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(startX, cardY, cardW, 4);

            ctx.strokeStyle = act.done ? '#4f4' : isHov ? '#5af' : '#333';
            ctx.lineWidth = 2;
            ctx.strokeRect(startX, cardY, cardW, cardH);

            ctx.fillStyle = isDisabled ? '#555' : '#fff';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(act.label + (act.done ? ' ✓' : ''), startX + 16, cardY + 30);

            ctx.fillStyle = isDisabled ? '#333' : '#aaa';
            ctx.font = '13px monospace';
            ctx.fillText(act.desc, startX + 16, cardY + 50);

            ctx.fillStyle = isDisabled ? '#333' : '#ff0';
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(act.sub, startX + cardW - 16, cardY + 50);

            cardY += cardH + 8;
        });

        ctx.fillStyle = '#555';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Нажми на активность чтобы начать', W / 2, H - 20);
        ctx.textAlign = 'left';
        this.drawExitBtn('← Меню', hovered === 'exit');
    }

    renderEvening(gameData, sleepQuality) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a0a2a');
        grad.addColorStop(0.5, '#1a1a4a');
        grad.addColorStop(1, '#0a0a15');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (let i = 0; i < 80; i++) {
            const sx = (i * 113) % W;
            const sy = (i * 173) % (H * 0.6);
            const alpha = 0.3 + (i % 5) * 0.12 + 0.1 * Math.sin(this.animTimer * 2 + i);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(sx, sy, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
        }

        // Moon
        ctx.fillStyle = '#fff8dc';
        ctx.beginPath();
        ctx.arc(W - 100, 80, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a4a';
        ctx.beginPath();
        ctx.arc(W - 88, 72, 34, 0, Math.PI * 2);
        ctx.fill();

        // Ground
        ctx.fillStyle = '#0a0a20';
        ctx.fillRect(0, H - 100, W, 100);

        // House with light
        ctx.fillStyle = '#1a1a30';
        ctx.fillRect(W / 2 - 160, H - 280, 320, 180);
        ctx.fillStyle = '#ff8c00';
        ctx.globalAlpha = 0.3 + 0.1 * Math.sin(this.animTimer * 3);
        ctx.fillRect(W / 2 - 40, H - 220, 80, 80);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#2a2a40';
        ctx.fillRect(W / 2 - 40, H - 220, 80, 80);

        this.drawPanel(W / 2 - 280, 60, 560, 280, 'rgba(0,0,20,0.9)', '#4af');

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🌙 ВЕЧЕР — ИТОГИ ДНЯ', W / 2, 100);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText(`Вес сейчас: ${gameData.weight.toFixed(1)} кг`, W / 2, 130);
        ctx.fillText(`Энергия: ${Math.round(gameData.energy)}%`, W / 2, 152);
        ctx.fillText(`Настроение: ${Math.round(gameData.mood)}%`, W / 2, 174);

        if (sleepQuality) {
            const sleepColor = sleepQuality === 'good' ? '#4f4' : sleepQuality === 'bad' ? '#f44' : '#fa0';
            ctx.fillStyle = sleepColor;
            const sleepText = sleepQuality === 'good' ? '8+ часов сна: +энергия' :
                              sleepQuality === 'bad' ? 'Мало сна: -энергия, +вес!' : 'Сон 6-7 часов: норм';
            ctx.fillText(sleepText, W / 2, 200);
        }

        const daysLeft = 5 - gameData.day;
        ctx.fillStyle = daysLeft <= 1 ? '#f44' : '#fa0';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(`Осталось дней: ${daysLeft}`, W / 2, 230);

        ctx.fillStyle = '#4f4';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ПРОБЕЛ / КЛИК — СЛЕДУЮЩИЙ ДЕНЬ]', W / 2, 300);
        ctx.textAlign = 'left';
        this.drawExitBtn('← Меню', false);
    }

    renderDeathScreen(gameData, glitchIntensity) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Glitch effect
        const g = glitchIntensity;
        if (g > 0) {
            ctx.fillStyle = `rgba(255,0,0,${g * 0.7})`;
            ctx.fillRect(0, 0, W, H);

            // Glitch lines
            for (let i = 0; i < Math.floor(g * 15); i++) {
                const ly = Math.random() * H;
                const lh = Math.random() * 8 + 2;
                const lx = (Math.random() - 0.5) * g * 30;
                ctx.fillStyle = `rgba(255,${Math.random() * 100},${Math.random() * 100},0.6)`;
                ctx.fillRect(lx, ly, W, lh);
            }
        }

        const shake = this.shakeX;
        ctx.save();
        ctx.translate(shake, this.shakeY);

        // Big red background
        ctx.fillStyle = '#800000';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,0,0,0.3)';
        ctx.fillRect(0, 0, W, H);

        // Main text with blink
        const blink = Math.floor(this.animTimer * 4) % 2 === 0;
        if (blink || g < 0.5) {
            ctx.fillStyle = '#000';
            ctx.font = 'bold 80px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('ТЫ ЖИРНЫЙ', W / 2 + 4, H / 2 - 60 + 4);
            ctx.fillStyle = '#ff0';
            ctx.fillText('ТЫ ЖИРНЫЙ', W / 2, H / 2 - 60);
        }

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Твой вес уничтожил тебя.', W / 2, H / 2 + 10);
        ctx.fillStyle = '#f88';
        ctx.font = '20px monospace';
        ctx.fillText(`Финальный вес: ${gameData.weight.toFixed(1)} кг`, W / 2, H / 2 + 46);
        ctx.fillText(`Цель была: меньше 80 кг`, W / 2, H / 2 + 74);

        // Restart button (huge)
        ctx.fillStyle = '#ff0';
        ctx.fillRect(W / 2 - 220, H - 160, 440, 100);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px monospace';
        ctx.fillText('НАЧАТЬ СНАЧАЛА', W / 2, H - 100);

        ctx.restore();

        // Scanlines
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let y = 0; y < H; y += 4) {
            ctx.fillRect(0, y, W, 2);
        }

        ctx.textAlign = 'left';
    }

    renderVictoryScreen(gameData, ending, elapsed) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.animTimer;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#001040');
        grad.addColorStop(0.5, '#002080');
        grad.addColorStop(1, '#001040');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Celebration particles (stars)
        for (let i = 0; i < 30; i++) {
            const sx = ((i * 113 + t * 40) % W);
            const sy = ((i * 157 + t * 30) % H);
            const colors = ['#ff0', '#f0f', '#0ff', '#0f0', '#f80'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i);
            ctx.fillRect(sx, sy, 4, 4);
        }
        ctx.globalAlpha = 1;

        // Fireworks
        for (let i = 0; i < 5; i++) {
            const fwX = (i * 200 + 100 + Math.sin(t * 2 + i) * 50) % W;
            const fwY = 50 + (i * 60 + Math.cos(t * 1.5 + i) * 30) % 200;
            for (let j = 0; j < 8; j++) {
                const angle = (j / 8) * Math.PI * 2 + t * 2;
                const r = 20 + 10 * Math.sin(t * 5 + i);
                const fx = fwX + Math.cos(angle) * r;
                const fy = fwY + Math.sin(angle) * r;
                ctx.fillStyle = ['#ff0', '#f0f', '#0ff'][i % 3];
                ctx.fillRect(fx, fy, 3, 3);
            }
        }

        // Trophy
        ctx.fillStyle = '#ff0';
        ctx.font = '60px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏆', W / 2, 120);

        // Title
        const endingTitles = {
            win:    { text: 'ТЫ ПОБЕДИЛ ЖИР!',   color: '#4f4' },
            good:   { text: 'СПОРТСМЕН!',          color: '#0ff' },
            secret: { text: 'ЛЕГЕНДА ЖАНРА!',      color: '#ff0' },
        };
        const title = endingTitles[ending] || endingTitles.win;

        const pulse = 1 + 0.03 * Math.sin(t * 3);
        ctx.save();
        ctx.translate(W / 2, 165);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 44px monospace';
        ctx.fillText(title.text, 2, 2);
        ctx.fillStyle = title.color;
        ctx.fillText(title.text, 0, 0);
        ctx.restore();

        // Stats panel
        this.drawPanel(W / 2 - 260, 210, 520, 180, 'rgba(0,0,40,0.9)', '#ff0');

        const weightLost = (110 - gameData.weight).toFixed(1);
        ctx.fillStyle = '#fff';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Начальный вес: 110 кг`, W / 2, 248);
        ctx.fillStyle = '#4f4';
        ctx.fillText(`Финальный вес: ${gameData.weight.toFixed(1)} кг`, W / 2, 274);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`Сброшено: ${weightLost} кг! 🎉`, W / 2, 308);
        ctx.fillStyle = '#aaa';
        ctx.font = '15px monospace';
        ctx.fillText(`Очки: ${gameData.score}`, W / 2, 336);
        ctx.fillText(`Дней выжито: ${gameData.day}`, W / 2, 358);

        // New hero sprite (fit)
        this._drawHero(W / 2 - 20, 400, gameData.weight);

        // Continue button
        ctx.fillStyle = '#2a6a2a';
        ctx.fillRect(W / 2 - 180, H - 90, 360, 50);
        ctx.fillStyle = '#4f4';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('▶  В ГЛАВНОЕ МЕНЮ', W / 2, H - 58);

        ctx.textAlign = 'left';
    }

    renderSettings(gameData, settings, hovered) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#050515';
        ctx.fillRect(0, 0, W, H);

        this.drawPanel(W / 2 - 300, 40, 600, 460, 'rgba(0,0,30,0.95)', '#4af');

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 26px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚙  НАСТРОЙКИ', W / 2, 90);

        const items = [
            { label: 'Музыка',          key: 'music',     val: settings.music,    y: 140, type: 'toggle' },
            { label: 'Звуки',           key: 'sfx',       val: settings.sfx,      y: 200, type: 'toggle' },
            { label: 'Громкость музыки', key: 'musicVol',  val: settings.musicVol, y: 260, type: 'slider' },
            { label: 'Громкость звуков', key: 'sfxVol',    val: settings.sfxVol,   y: 320, type: 'slider' },
        ];

        items.forEach(item => {
            ctx.fillStyle = '#aaa';
            ctx.font = '16px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(item.label, W / 2 - 260, item.y + 20);

            if (item.type === 'toggle') {
                const isOn = item.val;
                ctx.fillStyle = isOn ? '#2a6a2a' : '#4a2a2a';
                ctx.fillRect(W / 2 + 80, item.y, 120, 36);
                ctx.fillStyle = isOn ? '#4f4' : '#f44';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(isOn ? 'ВКЛ' : 'ВЫКЛ', W / 2 + 140, item.y + 24);
            } else if (item.type === 'slider') {
                this.drawProgressBar(W / 2 + 80, item.y + 10, 180, 16, item.val * 10, 10, '#4af');
                ctx.fillStyle = '#fff';
                ctx.font = '13px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${item.val * 10}%`, W / 2 + 270, item.y + 24);
                // Arrows
                ctx.fillStyle = hovered === `${item.key}_minus` ? '#5af' : '#2a4a8a';
                ctx.fillRect(W / 2 + 60, item.y + 8, 20, 20);
                ctx.fillStyle = '#fff';
                ctx.fillText('-', W / 2 + 70, item.y + 23);
                ctx.fillStyle = hovered === `${item.key}_plus` ? '#5af' : '#2a4a8a';
                ctx.fillRect(W / 2 + 262, item.y + 8, 20, 20);
                ctx.fillStyle = '#fff';
                ctx.fillText('+', W / 2 + 272, item.y + 23);
            }
        });

        this.drawButton(W / 2 - 130, 420, 260, 50, '◀  НАЗАД', hovered === 'back', '#4a2a2a');

        ctx.textAlign = 'left';
    }

    renderLeaderboard(entries, hovered) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#050515';
        ctx.fillRect(0, 0, W, H);

        this.drawPanel(W / 2 - 360, 20, 720, H - 80, 'rgba(0,0,30,0.95)', '#ff0');

        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 26px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏆  ТАБЛИЦА РЕКОРДОВ', W / 2, 70);

        const cols = ['#', 'Игрок', 'Вес', 'Сброшено', 'Очки', 'Концовка'];
        const colX = [W / 2 - 330, W / 2 - 260, W / 2 - 40, W / 2 + 60, W / 2 + 170, W / 2 + 250];

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        cols.forEach((c, i) => ctx.fillText(c, colX[i], 110));

        ctx.fillStyle = '#333';
        ctx.fillRect(W / 2 - 340, 118, 680, 2);

        if (!entries || entries.length === 0) {
            ctx.fillStyle = '#555';
            ctx.font = '18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Рекордов пока нет. Будь первым!', W / 2, H / 2);
        } else {
            entries.forEach((e, i) => {
                const rowY = 140 + i * 38;
                const medalColors = ['#ff0', '#aaa', '#c85', '#aaa'];
                ctx.fillStyle = i < 3 ? `rgba(255,200,0,0.05)` : 'rgba(255,255,255,0.02)';
                ctx.fillRect(W / 2 - 340, rowY - 14, 680, 34);

                ctx.fillStyle = i < 3 ? medalColors[i] : '#555';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(i < 3 ? ['🥇','🥈','🥉'][i] : `${i + 1}.`, colX[0], rowY + 6);

                ctx.fillStyle = '#fff';
                ctx.fillText((e.player_name || 'Игрок').substring(0, 12), colX[1], rowY + 6);

                ctx.fillStyle = '#f44';
                ctx.fillText(`${e.final_weight?.toFixed(1)} кг`, colX[2], rowY + 6);

                ctx.fillStyle = '#4f4';
                ctx.fillText(`-${e.weight_lost?.toFixed(1)} кг`, colX[3], rowY + 6);

                ctx.fillStyle = '#ff0';
                ctx.fillText(e.score, colX[4], rowY + 6);

                const endLabels = { win:'Победа', good:'Отлично!', secret:'Легенда', death:'Смерть' };
                const endColors = { win:'#4f4', good:'#0ff', secret:'#ff0', death:'#f44' };
                ctx.fillStyle = endColors[e.ending] || '#aaa';
                ctx.fillText(endLabels[e.ending] || e.ending, colX[5], rowY + 6);
            });
        }

        this.drawButton(W / 2 - 100, H - 50, 200, 36, '◀  НАЗАД', hovered === 'back', '#4a2a2a');
        ctx.textAlign = 'left';
    }

    renderAchievements(achievements, allAchs, hovered) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#050515';
        ctx.fillRect(0, 0, W, H);
        this.drawPanel(W / 2 - 360, 20, 720, H - 80, 'rgba(0,0,30,0.95)', '#ff8c00');

        ctx.fillStyle = '#ff8c00';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏅  ДОСТИЖЕНИЯ', W / 2, 65);

        const unlockedNames = new Set((achievements || []).map(a => a.name));

        allAchs.forEach((ach, i) => {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const ax = W / 2 - 340 + col * 360;
            const ay = 90 + row * 90;
            const unlocked = unlockedNames.has(ach.name);

            ctx.fillStyle = unlocked ? '#1a2a1a' : '#1a1a2a';
            ctx.fillRect(ax, ay, 330, 78);
            ctx.strokeStyle = unlocked ? '#4f4' : '#333';
            ctx.lineWidth = 2;
            ctx.strokeRect(ax, ay, 330, 78);

            ctx.font = '28px serif';
            ctx.textAlign = 'left';
            ctx.globalAlpha = unlocked ? 1 : 0.3;
            ctx.fillText(ach.icon, ax + 12, ay + 46);
            ctx.globalAlpha = 1;

            ctx.fillStyle = unlocked ? '#fff' : '#555';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(ach.name, ax + 50, ay + 26);
            ctx.fillStyle = unlocked ? '#aaa' : '#333';
            ctx.font = '12px monospace';
            ctx.fillText(ach.description, ax + 50, ay + 48);
            if (unlocked) {
                ctx.fillStyle = '#4f4';
                ctx.font = '11px monospace';
                ctx.fillText('✓ Получено!', ax + 50, ay + 66);
            }
        });

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${unlockedNames.size} / ${allAchs.length} достижений`, W / 2, H - 65);

        this.drawButton(W / 2 - 100, H - 50, 200, 36, '◀  НАЗАД', hovered === 'back', '#4a2a2a');
        ctx.textAlign = 'left';
    }

    renderNight(day, events) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.animTimer;

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#000010');
        grad.addColorStop(1, '#000020');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (let i = 0; i < 100; i++) {
            const sx = (i * 97) % W;
            const sy = (i * 163) % (H * 0.7);
            ctx.fillStyle = `rgba(255,255,255,${0.3 + (Math.sin(t * 2 + i) + 1) * 0.3})`;
            ctx.fillRect(sx, sy, 2, 2);
        }

        this.drawPanel(W / 2 - 280, H / 2 - 160, 560, 320, 'rgba(0,0,20,0.95)', '#4af');

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`💤 НОЧЬ — КОНЕЦ ДНЯ ${day}`, W / 2, H / 2 - 120);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        (events || []).forEach((ev, i) => {
            const col = ev.startsWith('+') || ev.includes('похудел') ? '#4f4' :
                        ev.startsWith('-') || ev.includes('набрал') || ev.includes('усталость') ? '#f44' : '#fff';
            ctx.fillStyle = col;
            ctx.fillText(ev, W / 2, H / 2 - 80 + i * 26);
        });

        ctx.fillStyle = '#4f4';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ПРОБЕЛ / КЛИК — ПРОДОЛЖИТЬ]', W / 2, H / 2 + 120);
        ctx.textAlign = 'left';
        this.drawExitBtn('← Меню', false);
    }

    // ── Waiting screen (cooperative multiplayer) ────────────────────────────────
    renderWaitingScreen(activity, waitStatus, mpPlayers, myId) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.animTimer;

        // Dark overlay bg
        ctx.fillStyle = '#050518';
        ctx.fillRect(0, 0, W, H);

        // Pulsing spinner dots
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + t * 2;
            const r = 30;
            const cx = W / 2 + Math.cos(angle) * r;
            const cy = 100 + Math.sin(angle) * r;
            const alpha = 0.3 + 0.7 * ((Math.sin(t * 4 + i * 0.8) + 1) / 2);
            ctx.fillStyle = `rgba(100,200,255,${alpha})`;
            ctx.fillRect(Math.round(cx) - 4, Math.round(cy) - 4, 8, 8);
        }

        const actLabels = {
            parkour: '🏃 ПАРКУР', gym: '💪 ТРЕНАЖЁР',
            breakfast: '🍳 ЗАВТРАК', dinner: '🍽 УЖИН',
        };

        this.drawPanel(W / 2 - 300, 150, 600, 280, 'rgba(0,0,30,0.95)', '#4af');

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⏳ ЖДЁМ ВСЕХ ИГРОКОВ', W / 2, 192);

        ctx.fillStyle = '#ff0';
        ctx.font = '16px monospace';
        ctx.fillText(`${actLabels[activity] || activity}`, W / 2, 220);

        // Player list with status
        const players = waitStatus ? Object.keys(waitStatus.names || {}) : [];
        const doneMap = (waitStatus && waitStatus.done) || {};
        const names = (waitStatus && waitStatus.names) || {};
        const colors = (waitStatus && waitStatus.colors) || {};

        // Also show self
        const allIds = new Set([...players]);
        if (myId) allIds.add(myId);

        let rowY = 246;
        [...allIds].forEach(id => {
            const isDone = doneMap[id] || (id === myId && waitStatus && doneMap[myId]);
            const isMe = id === myId;
            const name = isMe ? 'Ты' : (names[id] || 'Игрок');
            const color = isMe ? '#fff' : (colors[id] || '#aaa');

            ctx.fillStyle = isDone ? '#1a3a1a' : '#1a1a3a';
            ctx.fillRect(W / 2 - 240, rowY - 14, 480, 26);

            ctx.fillStyle = isDone ? '#4f4' : '#fa0';
            ctx.font = 'bold 18px monospace';
            ctx.fillText(isDone ? '✓' : '⏳', W / 2 - 220, rowY + 6);

            ctx.fillStyle = color;
            ctx.font = `${isMe ? 'bold ' : ''}15px monospace`;
            ctx.fillText(name + (isMe ? ' (ты)' : ''), W / 2 - 190, rowY + 6);

            if (isDone) {
                ctx.fillStyle = '#4f4';
                ctx.font = '13px monospace';
                ctx.fillText('Выполнено!', W / 2 + 80, rowY + 6);
            }
            rowY += 30;
        });

        const doneCount = waitStatus ? (waitStatus.done_count || 0) : 1;
        const total = waitStatus ? (waitStatus.total || 1) : 1;

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`Готово: ${doneCount} / ${total}`, W / 2, 436);
        ctx.fillText('Задание засчитается когда все завершат!', W / 2, 456);

        ctx.textAlign = 'left';
        this.drawExitBtn('✕ Выйти', false);
    }

    renderLoadSaves(saves, hovered) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#050515';
        ctx.fillRect(0, 0, W, H);
        this.drawPanel(W / 2 - 320, 40, 640, H - 100, 'rgba(0,0,30,0.95)', '#4af');

        ctx.fillStyle = '#4af';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('📂  ЗАГРУЗИТЬ СОХРАНЕНИЕ', W / 2, 90);

        if (!saves || saves.length === 0) {
            ctx.fillStyle = '#555';
            ctx.font = '18px monospace';
            ctx.fillText('Нет сохранений', W / 2, H / 2);
        } else {
            saves.forEach((s, i) => {
                const sy = 130 + i * 78;
                const isHov = hovered === `save_${s.id}`;
                ctx.fillStyle = isHov ? '#2a2a5a' : '#16162a';
                ctx.fillRect(W / 2 - 280, sy, 560, 68);
                ctx.strokeStyle = isHov ? '#4af' : '#333';
                ctx.lineWidth = 2;
                ctx.strokeRect(W / 2 - 280, sy, 560, 68);

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`${s.player_name}`, W / 2 - 264, sy + 24);
                ctx.fillStyle = '#aaa';
                ctx.font = '13px monospace';
                ctx.fillText(`День ${s.day}/5  |  Вес: ${s.weight.toFixed(1)} кг  |  Очки: ${s.score}`, W / 2 - 264, sy + 48);
            });
        }

        this.drawButton(W / 2 - 100, H - 56, 200, 40, '◀  НАЗАД', hovered === 'back', '#4a2a2a');
        ctx.textAlign = 'left';
    }

    renderNameInput(name, cursor) {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        ctx.fillStyle = '#050515';
        ctx.fillRect(0, 0, W, H);
        this.drawPanel(W / 2 - 280, H / 2 - 120, 560, 240, 'rgba(0,0,30,0.95)', '#ff0');

        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('КАК ТЕБЯ ЗОВУТ, ТОЛСТЯК?', W / 2, H / 2 - 80);

        // Input box
        ctx.fillStyle = '#0a0a2a';
        ctx.fillRect(W / 2 - 200, H / 2 - 50, 400, 50);
        ctx.strokeStyle = '#4af';
        ctx.lineWidth = 2;
        ctx.strokeRect(W / 2 - 200, H / 2 - 50, 400, 50);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px monospace';
        const displayName = name + (cursor ? '|' : ' ');
        ctx.fillText(displayName, W / 2, H / 2 - 18);

        this.drawButton(W / 2 - 120, H / 2 + 30, 240, 44, '▶  НАЧАТЬ!', false, '#2a6a2a');

        ctx.fillStyle = '#555';
        ctx.font = '13px monospace';
        ctx.fillText('[Enter - начать игру]', W / 2, H / 2 + 110);
        ctx.textAlign = 'left';
        this.drawExitBtn('← Меню', false);
    }
}
