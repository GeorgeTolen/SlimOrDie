'use strict';

const FOODS = {
    healthy: [
        { id:'apple',    name:'Яблоко',       emoji:'🍎', cal:80,   weight:-0.5, energy:+15, mood:+10, color:'#f44' },
        { id:'banana',   name:'Банан',         emoji:'🍌', cal:90,   weight:-0.3, energy:+20, mood:+8,  color:'#ff0' },
        { id:'chicken',  name:'Курица',        emoji:'🍗', cal:165,  weight:-0.2, energy:+25, mood:+5,  color:'#c85' },
        { id:'fish',     name:'Рыба',          emoji:'🐟', cal:140,  weight:-0.3, energy:+22, mood:+8,  color:'#48f' },
        { id:'veggies',  name:'Овощи',         emoji:'🥦', cal:50,   weight:-0.4, energy:+12, mood:+12, color:'#4a0' },
        { id:'oatmeal',  name:'Овсянка',       emoji:'🥣', cal:150,  weight:-0.1, energy:+30, mood:+5,  color:'#d8a' },
        { id:'salad',    name:'Салат',         emoji:'🥗', cal:40,   weight:-0.5, energy:+10, mood:+15, color:'#4c4' },
        { id:'eggs',     name:'Яйца',          emoji:'🍳', cal:155,  weight:-0.1, energy:+28, mood:+6,  color:'#ff8' },
    ],
    unhealthy: [
        { id:'burger',   name:'Бургер',        emoji:'🍔', cal:550,  weight:+3.0, energy:-10, mood:+20, color:'#c85' },
        { id:'pizza',    name:'Пицца',         emoji:'🍕', cal:480,  weight:+2.5, energy:-8,  mood:+18, color:'#e84' },
        { id:'donut',    name:'Пончик',        emoji:'🍩', cal:350,  weight:+2.0, energy:-5,  mood:+25, color:'#f8a' },
        { id:'cola',     name:'Кола',          emoji:'🥤', cal:140,  weight:+1.5, energy:+5,  mood:+10, color:'#e33' },
        { id:'fries',    name:'Картошка-фри',  emoji:'🍟', cal:420,  weight:+2.0, energy:-8,  mood:+15, color:'#fa0' },
        { id:'icecream', name:'Мороженое',     emoji:'🍦', cal:270,  weight:+1.8, energy:-3,  mood:+30, color:'#fdf' },
        { id:'cake',     name:'Торт',          emoji:'🎂', cal:400,  weight:+2.5, energy:-5,  mood:+28, color:'#f8f' },
        { id:'hotdog',   name:'Хот-дог',       emoji:'🌭', cal:300,  weight:+1.8, energy:-5,  mood:+15, color:'#c84' },
    ],
};

class FoodMenu {
    constructor(ctx, W, H, mealType, gameData, audio) {
        this.ctx = ctx;
        this.W = W; this.H = H;
        this.mealType = mealType; // 'breakfast' or 'dinner'
        this.gameData = gameData;
        this.audio = audio;
        this.selected = [];
        this.maxSelected = 2;
        this.done = false;
        this.scrollY = 0;
        this.hovered = null;
        this.animTimer = 0;

        this._onClick = this._handleClick.bind(this);
        this._onMove = this._handleMove.bind(this);
        document.addEventListener('click', this._onClick);
        document.addEventListener('mousemove', this._onMove);
    }

    destroy() {
        document.removeEventListener('click', this._onClick);
        document.removeEventListener('mousemove', this._onMove);
    }

    _getMouseOnCanvas(e) {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    _handleMove(e) {
        const { x, y } = this._getMouseOnCanvas(e);
        this.hovered = this._getFoodAt(x, y);
    }

    _handleClick(e) {
        if (this.done) return;
        const { x, y } = this._getMouseOnCanvas(e);

        // Confirm button
        if (this.selected.length > 0) {
            if (x >= this.W / 2 - 120 && x <= this.W / 2 + 120 &&
                y >= this.H - 60 && y <= this.H - 20) {
                this._confirm();
                return;
            }
        }

        const food = this._getFoodAt(x, y);
        if (!food) return;
        this.audio && this.audio.playClick();

        const idx = this.selected.findIndex(s => s.id === food.id);
        if (idx >= 0) {
            this.selected.splice(idx, 1);
        } else if (this.selected.length < this.maxSelected) {
            this.selected.push(food);
            this.audio && this.audio.playEat(food.weight < 0);
        }
    }

    _getFoodAt(mx, my) {
        const all = [...FOODS.healthy, ...FOODS.unhealthy];
        const cols = 4;
        const itemW = 180; const itemH = 100;
        const startX = (this.W - cols * itemW) / 2;
        const startY = 120;

        for (let i = 0; i < all.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const fx = startX + col * itemW;
            const fy = startY + row * (itemH + 10);
            if (mx >= fx && mx <= fx + itemW - 8 && my >= fy && my <= fy + itemH - 4) {
                return all[i];
            }
        }
        return null;
    }

    _confirm() {
        this.done = true;
        const totalWeight = this.selected.reduce((s, f) => s + f.weight, 0);
        const totalEnergy = this.selected.reduce((s, f) => s + f.energy, 0);
        const totalMood = this.selected.reduce((s, f) => s + f.mood, 0);
        const totalCal = this.selected.reduce((s, f) => s + f.cal, 0);

        // Overeating penalty
        let weightMod = totalWeight;
        if (totalCal > 600) weightMod += 2.0;
        if (totalCal > 800) weightMod += 3.0;

        this.result = {
            weightChange: parseFloat(weightMod.toFixed(1)),
            energyChange: Math.min(30, totalEnergy),
            moodChange: Math.min(20, totalMood),
            foods: [...this.selected],
            totalCal,
        };
    }

    update(dt) {
        this.animTimer += dt;
    }

    render() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);

        // Kitchen background
        ctx.fillStyle = '#f5f0e8';
        ctx.fillRect(0, H - 120, W, 120);
        ctx.fillStyle = '#e0d8c8';
        ctx.fillRect(0, H - 180, W, 60);
        ctx.fillStyle = '#c0b8a8';
        for (let x = 0; x < W; x += 200) {
            ctx.fillRect(x, H - 180, 4, 60);
        }

        // Title
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        const title = this.mealType === 'breakfast' ? '🌅 ЗАВТРАК' : '🌙 УЖИН';
        ctx.fillText(title, W / 2, 40);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`Выбери до ${this.maxSelected} блюд  |  День ${this.gameData.day}`, W / 2, 65);
        ctx.fillText(`Вес: ${this.gameData.weight.toFixed(1)} кг  |  Энергия: ${Math.round(this.gameData.energy)}%`, W / 2, 88);
        ctx.textAlign = 'left';

        // Food grid
        const all = [...FOODS.healthy, ...FOODS.unhealthy];
        const cols = 4;
        const itemW = 180; const itemH = 100;
        const startX = (W - cols * itemW) / 2;
        const startY = 110;

        all.forEach((food, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const fx = startX + col * itemW;
            const fy = startY + row * (itemH + 10);

            const isSelected = this.selected.some(s => s.id === food.id);
            const isHovered = this.hovered && this.hovered.id === food.id;
            const isHealthy = FOODS.healthy.some(h => h.id === food.id);

            // Card background
            ctx.fillStyle = isSelected ? (isHealthy ? '#1a4a1a' : '#4a1a1a') :
                             isHovered ? '#2a2a4a' : '#16162a';
            ctx.fillRect(fx, fy, itemW - 8, itemH - 4);

            // Border
            ctx.strokeStyle = isSelected ? '#4f4' : isHealthy ? '#4a8' : '#a44';
            ctx.lineWidth = isSelected ? 3 : 1;
            ctx.strokeRect(fx, fy, itemW - 8, itemH - 4);

            // Emoji
            ctx.font = '28px serif';
            ctx.textAlign = 'center';
            ctx.fillText(food.emoji, fx + 24, fy + 38);

            // Name
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(food.name, fx + 46, fy + 20);

            // Stats
            ctx.font = '10px monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`Кал: ${food.cal}`, fx + 46, fy + 36);
            ctx.fillStyle = food.weight > 0 ? '#f44' : '#4f4';
            ctx.fillText(`Вес: ${food.weight > 0 ? '+' : ''}${food.weight} кг`, fx + 46, fy + 50);
            ctx.fillStyle = food.energy > 0 ? '#4f4' : '#f44';
            ctx.fillText(`Энергия: ${food.energy > 0 ? '+' : ''}${food.energy}`, fx + 46, fy + 64);
            ctx.fillStyle = '#aaa';
            ctx.fillText(`Настр: +${food.mood}`, fx + 46, fy + 78);

            // Selected checkmark
            if (isSelected) {
                ctx.fillStyle = '#4f4';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('✓', fx + itemW - 10, fy + 20);
            }
        });

        // Selected summary panel
        if (this.selected.length > 0) {
            const panelY = H - 110;
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, panelY, W, 110);

            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            let summary = this.selected.map(f => `${f.emoji}${f.name}`).join(' + ');
            ctx.fillText(summary, W / 2, panelY + 20);

            const totalWeight = this.selected.reduce((s, f) => s + f.weight, 0);
            const totalCal = this.selected.reduce((s, f) => s + f.cal, 0);
            const totalEnergy = this.selected.reduce((s, f) => s + f.energy, 0);
            let extra = '';
            if (totalCal > 600) extra = ' ⚠ ПЕРЕЕДАНИЕ! +2кг';
            if (totalCal > 800) extra = ' ⚠ ОБЖОРСТВО! +5кг';

            ctx.fillStyle = '#aaa';
            ctx.font = '13px monospace';
            ctx.fillText(`Калории: ${totalCal}  |  Вес: ${totalWeight > 0 ? '+' : ''}${totalWeight.toFixed(1)} кг${extra}`, W / 2, panelY + 42);
            ctx.fillText(`Энергия: ${totalEnergy > 0 ? '+' : ''}${totalEnergy}%`, W / 2, panelY + 60);

            // Confirm button
            ctx.fillStyle = '#2a8a2a';
            ctx.fillRect(W / 2 - 120, panelY + 72, 240, 32);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('✓  КУШАТЬ!', W / 2, panelY + 94);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Выбери блюда для приёма пищи', W / 2, H - 35);
        }

        ctx.textAlign = 'left';
    }
}
