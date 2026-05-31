'use strict';

const ALL_ACHIEVEMENTS = [
    { name: 'Первый Шаг',     description: 'Завершить первый день',            icon: '👟' },
    { name: 'Потный',         description: 'Пройти все 5 уровней паркура',      icon: '💦' },
    { name: 'Железный',       description: 'Пройти все 4 вида тренировок',      icon: '🏋️' },
    { name: 'Веган',          description: 'Есть только здоровую еду весь день', icon: '🥗' },
    { name: 'Похудевший',     description: 'Достичь веса 80 кг',                icon: '⚖️' },
    { name: 'Атлет',          description: 'Достичь веса 70 кг',                icon: '🏃' },
    { name: 'Легенда',        description: 'Достичь веса 60 кг',                icon: '🌟' },
    { name: 'Мазохист',       description: 'Умереть 3 раза в паркуре за день',  icon: '💀' },
    { name: 'Фастфудщик',     description: 'Съесть 3 вредных блюда подряд',     icon: '🍔' },
    { name: 'Марафонец',      description: 'Пробежать паркур быстрее пара',     icon: '⚡' },
];

// ─── GameData ──────────────────────────────────────────────────────────────────

class GameData {
    constructor() {
        this.playerName = 'Игрок';
        this.day = 1;
        this.weight = 110.0;
        this.energy = 100.0;
        this.mood = 100.0;
        this.strength = 1;
        this.speed = 1;
        this.experience = 0;
        this.score = 0;
        this.saveId = null;
        this.completedToday = { breakfast: false, parkour: false, gym: false, dinner: false };
        this.completedLevels = [];
        this.gymTypesCompleted = new Set();
        this.junkFoodCount = 0;
        this.lastNightEvents = [];
        this.unlocked = new Set();
        this.dayDeaths = 0;
        this.eatOnlyHealthy = true;
    }

    toSavePayload() {
        return {
            player_name: this.playerName,
            day: this.day,
            weight: parseFloat(this.weight.toFixed(1)),
            energy: parseFloat(this.energy.toFixed(1)),
            mood: parseFloat(this.mood.toFixed(1)),
            strength: this.strength,
            speed: this.speed,
            experience: this.experience,
            score: this.score,
            state_json: JSON.stringify({
                completedToday: this.completedToday,
                completedLevels: this.completedLevels,
                gymTypesCompleted: [...this.gymTypesCompleted],
                junkFoodCount: this.junkFoodCount,
                unlocked: [...this.unlocked],
                dayDeaths: this.dayDeaths,
            }),
        };
    }

    fromSave(save) {
        this.playerName = save.player_name;
        this.day = save.day;
        this.weight = save.weight;
        this.energy = save.energy;
        this.mood = save.mood;
        this.strength = save.strength;
        this.speed = save.speed;
        this.experience = save.experience;
        this.score = save.score;
        this.saveId = save.id;
        try {
            const s = JSON.parse(save.state_json || '{}');
            this.completedToday = s.completedToday || { breakfast: false, parkour: false, gym: false, dinner: false };
            this.completedLevels = s.completedLevels || [];
            this.gymTypesCompleted = new Set(s.gymTypesCompleted || []);
            this.junkFoodCount = s.junkFoodCount || 0;
            this.unlocked = new Set(s.unlocked || []);
            this.dayDeaths = s.dayDeaths || 0;
        } catch (_) {}
    }
}

// ─── GameEngine ────────────────────────────────────────────────────────────────

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = canvas.width;
        this.H = canvas.height;

        this.state = 'menu';
        this.gameData = new GameData();
        this.api = new APIClient();
        this.audio = new AudioManager();
        this.particles = new ParticleSystem(this.ctx);
        this.ui = new UIManager(this.ctx, this.W, this.H);

        // Multiplayer
        this.mp = new MultiplayerClient();
        this.mpMode = false;
        this.lobby = null;          // LobbyManager instance

        this.hovered = null;
        this.mx = 0; this.my = 0;

        this.activeGame = null;
        this.foodMenu = null;
        this.nameInput = '';
        this.nameCursor = true;
        this.nameCursorTimer = 0;

        this.saves = [];
        this.leaderboard = [];
        this.achievements = [];

        this.deathTimer = 0;
        this.deathGlitch = 0;
        this.victoryTimer = 0;
        this.nightTimer = 0;
        this.nightEvents = [];
        this.morningTimer = 0;
        this.notification = null;
        this.notifTimer = 0;
        this._endingType = 'win';

        this.settings = { music: true, sfx: true, musicVol: 5, sfxVol: 4 };

        this.lastTime = 0;
        this._keys = {};
        this._justPressed = new Set();

        this._bindEvents();
        this._setupMPHandlers();
    }

    // ── Events ──────────────────────────────────────────────────────────────────

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mx = (e.clientX - rect.left) * (this.W / rect.width);
            this.my = (e.clientY - rect.top) * (this.H / rect.height);
            this._updateHover();
        });

        this.canvas.addEventListener('click', e => {
            const rect = this.canvas.getBoundingClientRect();
            const cx = (e.clientX - rect.left) * (this.W / rect.width);
            const cy = (e.clientY - rect.top) * (this.H / rect.height);
            this.audio.resume();
            this._handleClick(cx, cy);
        });

        window.addEventListener('keydown', e => {
            this._keys[e.code] = true;
            this._justPressed.add(e.code);
            this.audio.resume();

            if (this.state === 'nameInput') {
                if (e.code === 'Backspace') this.nameInput = this.nameInput.slice(0, -1);
                else if (e.code === 'Enter') this._startNewGame();
                else if (e.key.length === 1 && this.nameInput.length < 16) this.nameInput += e.key;
            }
            if ((this.state === 'morning' || this.state === 'evening' || this.state === 'night') && e.code === 'Space') {
                this._advanceFromScreen();
            }
        });

        window.addEventListener('keyup', e => { this._keys[e.code] = false; });
    }

    _setupMPHandlers() {
        this.mp.on('welcome', p => {
            this.mp.playerId = p.player_id;
            this.mp.playerColor = '#fff';
            this.mp.join(this.gameData.playerName);
        });

        this.mp.on('group_bonus', p => {
            // Group bonus applies to the local player too
            if (this.gameData) {
                this.gameData.weight = Math.max(40, this.gameData.weight - p.weight_drop);
                this._showNotification(`🎉 Групповой бонус! −${p.weight_drop} кг`, '#ff0');
            }
        });

        this.mp.on('day_start', p => {
            if (this.mpMode && this.state === 'night') {
                this.gameData.day = p.day;
                this._beginDay();
            }
        });

        this.mp.on('disconnected', () => {
            this._showNotification('Соединение потеряно', '#f44');
        });
    }

    // ── Hover ───────────────────────────────────────────────────────────────────

    _updateHover() {
        const mx = this.mx; const my = this.my;
        const W = this.W; const H = this.H;

        if (this.state === 'menu') {
            if (mx >= W/2-160 && mx <= W/2+160) {
                if (my >= 340 && my <= 378) { this.hovered = 'new'; return; }
                if (my >= 390 && my <= 428) { this.hovered = 'multiplayer'; return; }
                if (my >= 440 && my <= 478) { this.hovered = 'load'; return; }
                if (my >= 490 && my <= 528) { this.hovered = 'leaderboard'; return; }
            }
            if (mx >= W/2+170 && mx <= W/2+280 && my >= 490 && my <= 528) { this.hovered = 'settings'; return; }
            this.hovered = null;
        } else if (this.state === 'day_select') {
            const startX = (W - 580) / 2;
            ['breakfast','parkour','gym','dinner','sleep'].forEach((id, i) => {
                const cardY = 120 + i * 80;
                if (mx >= startX && mx <= startX + 580 && my >= cardY && my <= cardY + 72) {
                    this.hovered = id;
                }
            });
        } else if (this.state === 'death') {
            this.hovered = (mx >= W/2-220 && mx <= W/2+220 && my >= H-160 && my <= H-60) ? 'restart' : null;
        } else if (this.state === 'victory') {
            this.hovered = (mx >= W/2-180 && mx <= W/2+180 && my >= H-90 && my <= H-40) ? 'menu' : null;
        } else if (['leaderboard','achievements'].includes(this.state)) {
            this.hovered = (mx >= W/2-100 && mx <= W/2+100 && my >= H-56 && my <= H-20) ? 'back' : null;
        } else if (this.state === 'settings') {
            this.hovered = (mx >= W/2-130 && mx <= W/2+130 && my >= 420 && my <= 470) ? 'back' : null;
        } else if (this.state === 'load') {
            this.hovered = null;
            if (this.saves) {
                this.saves.forEach((s, i) => {
                    const sy = 130 + i * 78;
                    if (mx >= W/2-280 && mx <= W/2+280 && my >= sy && my <= sy+68) {
                        this.hovered = `save_${s.id}`;
                    }
                });
            }
            if (mx >= W/2-100 && mx <= W/2+100 && my >= H-56 && my <= H-16) this.hovered = 'back';
        }
    }

    // ── Clicks ──────────────────────────────────────────────────────────────────

    _handleClick(cx, cy) {
        const W = this.W; const H = this.H;

        if (this.state === 'menu') {
            if (cx >= W/2-160 && cx <= W/2+160) {
                if (cy >= 340 && cy <= 378) { this._goToNameInput('solo'); return; }
                if (cy >= 390 && cy <= 428) { this._goToNameInput('multi'); return; }
                if (cy >= 440 && cy <= 478) { this._loadSaves(); return; }
                if (cy >= 490 && cy <= 528) { this._goLeaderboard(); return; }
            }
            if (cx >= W/2+170 && cx <= W/2+280 && cy >= 490 && cy <= 528) {
                this.setState('settings'); return;
            }
        }

        if (this.state === 'nameInput') {
            if (cx >= W/2-120 && cx <= W/2+120 && cy >= H/2+30 && cy <= H/2+74) {
                this._startNewGame();
            }
        }

        if (this.state === 'day_select') {
            const startX = (W - 580) / 2;
            ['breakfast','parkour','gym','dinner','sleep'].forEach((id, i) => {
                const cardY = 120 + i * 80;
                if (cx >= startX && cx <= startX + 580 && cy >= cardY && cy <= cardY + 72) {
                    this._startActivity(id);
                }
            });
        }

        if (this.state === 'morning' || this.state === 'evening' || this.state === 'night') {
            this._advanceFromScreen();
        }

        if (this.state === 'death') {
            if (cx >= W/2-220 && cx <= W/2+220 && cy >= H-160 && cy <= H-60) this._restartGame();
        }

        if (this.state === 'victory') {
            if (cx >= W/2-180 && cx <= W/2+180 && cy >= H-90 && cy <= H-40) {
                this.setState('menu');
                this._loadMenuData();
            }
        }

        if (['leaderboard','achievements'].includes(this.state)) {
            if (cx >= W/2-100 && cx <= W/2+100 && cy >= H-56 && cy <= H-20) this.setState('menu');
        }

        if (this.state === 'settings') {
            this._handleSettingsClick(cx, cy);
        }

        if (this.state === 'load') {
            this.saves && this.saves.forEach(s => {
                const idx = this.saves.indexOf(s);
                const sy = 130 + idx * 78;
                if (cx >= W/2-280 && cx <= W/2+280 && cy >= sy && cy <= sy+68) this._loadSave(s);
            });
            if (cx >= W/2-100 && cx <= W/2+100 && cy >= H-56 && cy <= H-16) this.setState('menu');
        }
    }

    _handleSettingsClick(cx, cy) {
        const W = this.W;
        const items = [
            { key:'music',    y:140, type:'toggle' },
            { key:'sfx',      y:200, type:'toggle' },
            { key:'musicVol', y:260, type:'slider' },
            { key:'sfxVol',   y:320, type:'slider' },
        ];
        items.forEach(item => {
            if (item.type === 'toggle') {
                if (cx >= W/2+80 && cx <= W/2+200 && cy >= item.y && cy <= item.y+36) {
                    this.settings[item.key] = !this.settings[item.key];
                    if (item.key === 'music') {
                        if (this.settings.music) this.audio.startMusic('normal');
                        else this.audio.stopMusic();
                    }
                    this.audio.playClick();
                }
            } else {
                if (cx >= W/2+60 && cx <= W/2+80 && cy >= item.y+8 && cy <= item.y+28) {
                    this.settings[item.key] = Math.max(0, this.settings[item.key] - 1);
                    this._applySettings();
                }
                if (cx >= W/2+262 && cx <= W/2+282 && cy >= item.y+8 && cy <= item.y+28) {
                    this.settings[item.key] = Math.min(10, this.settings[item.key] + 1);
                    this._applySettings();
                }
            }
        });
        if (cx >= W/2-130 && cx <= W/2+130 && cy >= 420 && cy <= 470) this.setState('menu');
    }

    _applySettings() {
        this.audio.setMusicVolume(this.settings.musicVol / 10);
        this.audio.setSfxVolume(this.settings.sfxVol / 10);
    }

    // ── Navigation ───────────────────────────────────────────────────────────────

    _goToNameInput(mode) {
        this._pendingMode = mode;
        this.nameInput = '';
        this.setState('nameInput');
    }

    async _loadSaves() {
        const res = await this.api.listSaves();
        this.saves = res.success ? (res.data || []) : [];
        this.setState('load');
    }

    async _goLeaderboard() {
        const [lbRes, achRes] = await Promise.all([
            this.api.getLeaderboard(20),
            this.api.getAchievements(),
        ]);
        this.leaderboard = lbRes.success ? (lbRes.data || []) : [];
        this.achievements = achRes.success ? (achRes.data || []) : [];
        this.setState('leaderboard');
    }

    async _loadMenuData() {
        try {
            const [lbRes, savesRes] = await Promise.all([
                this.api.getLeaderboard(20),
                this.api.listSaves(),
            ]);
            this.leaderboard = lbRes.success ? (lbRes.data || []) : [];
            this.saves = savesRes.success ? (savesRes.data || []) : [];
        } catch (_) {}
    }

    _startNewGame() {
        const name = this.nameInput.trim() || 'Толстяк';
        this.gameData = new GameData();
        this.gameData.playerName = name;
        this.mpMode = this._pendingMode === 'multi';

        if (this.mpMode) {
            this._connectMultiplayer(name);
        } else {
            this._beginDay();
        }
    }

    _connectMultiplayer(name) {
        this._showNotification('Подключение к серверу...', '#4af');
        this.mp.connect(() => {
            // welcome message triggers join in _setupMPHandlers
            // then transition to lobby
            setTimeout(() => {
                if (this.lobby) { this.lobby.destroy(); this.lobby = null; }
                this.lobby = new LobbyManager(
                    this.ctx, this.W, this.H,
                    this.mp, this.gameData, this.audio, this.particles
                );
                this.setState('lobby');
                this.audio.startMusic('normal');
            }, 300);
        });
    }

    async _loadSave(save) {
        this.gameData = new GameData();
        this.gameData.fromSave(save);
        this.mpMode = false;
        this.setState('day_select');
        this.audio.startMusic('normal');
    }

    // ── Day cycle ────────────────────────────────────────────────────────────────

    _beginDay() {
        this.gameData.completedToday = { breakfast: false, parkour: false, gym: false, dinner: false };
        this.gameData.dayDeaths = 0;
        this.gameData.eatOnlyHealthy = true;
        this.morningTimer = 0;
        this.setState('morning');
        this.audio.playDayStart();
        this.audio.startMusic(this.gameData.day >= 4 ? 'tense' : 'normal');

        if (this.mpMode && this.mp.connected) {
            this.mp.sendStatsUpdate(
                this.gameData.weight, this.gameData.energy,
                this.gameData.mood, this.gameData.score, this.gameData.day
            );
        }
    }

    _advanceFromScreen() {
        if (this.state === 'morning') this.setState('day_select');
        else if (this.state === 'evening') this._doNight();
        else if (this.state === 'night') {
            if (this.mpMode && this.mp.connected) {
                this.mp.sendReady();
                this._showNotification('Ждём других игроков...', '#4af');
            } else {
                this._advanceDay();
            }
        }
    }

    _startActivity(id) {
        const gd = this.gameData;
        const done = gd.completedToday;

        if (id === 'sleep') {
            if (!done.breakfast || !done.dinner) {
                this._showNotification('Сначала позавтракай и поужинай!', '#f44');
                return;
            }
            this.setState('evening');
            return;
        }

        if (done[id]) { this._showNotification('Уже сделано сегодня!', '#fa0'); return; }

        if (id === 'breakfast' || id === 'dinner') {
            this.foodMenu = new FoodMenu(this.ctx, this.W, this.H, id, gd, this.audio);
            this.setState('food');
            return;
        }

        if (id === 'parkour') {
            if (gd.energy < 15) { this._showNotification('Мало энергии! Сначала поешь.', '#f44'); return; }
            const levelData = LEVELS[(gd.day - 1) % LEVELS.length];
            if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
            this.activeGame = new ParkourGame(
                this.ctx, this.W, this.H,
                levelData, gd, this.audio, this.particles,
                this.mpMode ? this.mp : null
            );
            this.activeGame.init();
            this.setState('parkour');
            if (this.mpMode && this.mp.connected) this.mp.sendVote('parkour');
            return;
        }

        if (id === 'gym') {
            if (gd.energy < 10) { this._showNotification('Мало энергии!', '#f44'); return; }
            const ex = GYM_EXERCISES[gd.gymTypesCompleted.size % GYM_EXERCISES.length];
            if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
            this.activeGame = new GymGame(this.ctx, this.W, this.H, ex, gd, this.audio, this.particles);
            this.setState('gym');
            if (this.mpMode && this.mp.connected) this.mp.sendVote('gym');
            return;
        }
    }

    _finishActivity(type, result) {
        const gd = this.gameData;

        if (type === 'parkour') {
            gd.completedToday.parkour = true;
            gd.energy = Math.max(0, gd.energy - 30);
            if (result.success) {
                gd.weight = Math.max(40, gd.weight - result.weightLost);
                gd.score += Math.floor(result.weightLost * 100) + (result.timeBonus || 0) * 10;
                gd.experience += 50;
                if (!gd.completedLevels.includes(gd.day)) gd.completedLevels.push(gd.day);
                this._showNotification(`Паркур! −${result.weightLost} кг 🏃`, '#4f4');
            } else {
                gd.weight = Math.max(40, gd.weight - 0.5);
                gd.dayDeaths = (gd.dayDeaths || 0) + result.deaths;
                this._showNotification('Не добежал... −0.5 кг', '#fa0');
            }
            if (this.mpMode && this.mp.connected) {
                this.mp.sendActivityResult('parkour', result.success, result.weightLost || 0.5, gd.weight);
            }

        } else if (type === 'gym') {
            gd.completedToday.gym = true;
            gd.energy = Math.max(0, gd.energy - result.energyCost);
            if (result.success) {
                gd.weight = Math.max(40, gd.weight - result.weightLost);
                gd.experience += 30;
                gd.score += Math.floor(result.weightLost * 80);
                if (result.exercise.strengthGain) gd.strength = Math.min(10, gd.strength + 1);
                if (result.exercise.speedGain) gd.speed = Math.min(10, gd.speed + 1);
                gd.gymTypesCompleted.add(result.exercise.id);
                this._showNotification(`Тренировка! −${result.weightLost} кг 💪`, '#4f4');
            } else {
                gd.weight = Math.max(40, gd.weight - result.weightLost);
                this._showNotification('Провал! −' + result.weightLost + ' кг', '#f44');
            }
            if (this.mpMode && this.mp.connected) {
                this.mp.sendActivityResult('gym', result.success, result.weightLost || 0, gd.weight);
            }

        } else if (type === 'food') {
            const r = result.result;
            if (!r) return;
            if (result.mealType === 'breakfast') gd.completedToday.breakfast = true;
            else gd.completedToday.dinner = true;
            gd.weight = Math.max(40, gd.weight + r.weightChange);
            gd.energy = Math.min(100, Math.max(0, gd.energy + r.energyChange));
            gd.mood = Math.min(100, Math.max(0, gd.mood + r.moodChange));
            const hasJunk = r.foods.some(f => FOODS.unhealthy.some(jf => jf.id === f.id));
            if (hasJunk) { gd.junkFoodCount = (gd.junkFoodCount || 0) + 1; gd.eatOnlyHealthy = false; }
            const sign = r.weightChange >= 0 ? '+' : '';
            this._showNotification(`${hasJunk ? '🍔' : '🥗'} ${sign}${r.weightChange.toFixed(1)} кг`, r.weightChange >= 0 ? '#f44' : '#4f4');
            this.audio.playEat(!hasJunk);
        }

        if (gd.experience >= gd.strength * 100) {
            gd.experience = 0;
            this._showNotification('УРОВЕНЬ UP! 💪', '#ff0');
            this.particles.emitLevel(this.W / 2, this.H / 2);
        }

        this._checkAchievements();
        this._autoSave();

        if (this.mpMode && this.mp.connected) {
            this.mp.sendStatsUpdate(gd.weight, gd.energy, gd.mood, gd.score, gd.day);
        }

        this.setState('day_select');
    }

    _doNight() {
        const gd = this.gameData;
        const events = [];

        if (gd.energy > 70) { gd.energy = Math.min(100, gd.energy + 20); events.push('😴 Отлично поспал! +энергия'); }
        else if (gd.energy < 30) { gd.weight = Math.min(200, gd.weight + 2); events.push('😩 Мало спал! +2 кг'); }
        else { gd.energy = Math.min(100, gd.energy + 10); events.push('😐 Нормальный сон'); }

        gd.mood = Math.min(100, gd.mood + 15);
        events.push(`😊 Настроение: ${Math.round(gd.mood)}%`);

        if (!gd.completedToday.parkour && !gd.completedToday.gym) {
            gd.weight = Math.min(200, gd.weight + 2);
            events.push('😱 Не тренировался! +2 кг');
        }

        const randoms = [
            { chance: 0.2, text: '🎲 Нашёл гантель! −0.5 кг', weight: -0.5 },
            { chance: 0.15, text: '🎲 Съел торт ночью! +1 кг', weight: 1 },
            { chance: 0.1, text: '🎲 Ночной марафон! −1 кг', weight: -1 },
        ];
        for (const r of randoms) {
            if (Math.random() < r.chance) {
                gd.weight = Math.max(40, Math.min(200, gd.weight + r.weight));
                events.push(r.text);
                break;
            }
        }

        this.nightEvents = events;
        gd.lastNightEvents = events;
        this.nightTimer = 0;
        this.setState('night');
        this._autoSave();
    }

    _advanceDay() {
        this.gameData.day++;
        if (this.gameData.day > 5) { this._checkEndgame(); return; }
        this._beginDay();
    }

    _checkEndgame() {
        const w = this.gameData.weight;
        this._endingType = w < 60 ? 'secret' : w < 70 ? 'good' : w < 80 ? 'win' : 'death';
        if (this._endingType === 'death') this._triggerDeath();
        else this._triggerVictory(this._endingType);
    }

    _triggerDeath() {
        this.deathTimer = 0;
        this.deathGlitch = 1.0;
        this.setState('death');
        this.audio.stopMusic();
        this.audio.playDeath();
        this.ui.triggerShake(20);
        this.ui.triggerFlash('#f00', 1.0);
        this._submitScore('death');
    }

    _triggerVictory(ending) {
        this.victoryTimer = 0;
        this.setState('victory');
        this.audio.stopMusic();
        this.audio.playVictory();
        this.particles.emitLevel(this.W / 2, this.H / 2);
        this._submitScore(ending);
        this._checkAchievements();
    }

    async _submitScore(ending) {
        const gd = this.gameData;
        await this.api.addScore({
            player_name: gd.playerName,
            final_weight: parseFloat(gd.weight.toFixed(1)),
            weight_lost: parseFloat((110 - gd.weight).toFixed(1)),
            days_survived: gd.day,
            score: gd.score,
            ending,
        });
    }

    async _autoSave() {
        const gd = this.gameData;
        try {
            if (gd.saveId) {
                await this.api.updateGame(gd.saveId, gd.toSavePayload());
            } else {
                const res = await this.api.saveGame(gd.toSavePayload());
                if (res.success && res.data) gd.saveId = res.data.id;
            }
        } catch (_) {}
    }

    _checkAchievements() {
        const gd = this.gameData;
        const checks = [
            { name: 'Первый Шаг',  cond: () => gd.day >= 1 },
            { name: 'Потный',      cond: () => gd.completedLevels.length >= 5 },
            { name: 'Железный',    cond: () => gd.gymTypesCompleted.size >= 4 },
            { name: 'Веган',       cond: () => gd.eatOnlyHealthy && (gd.completedToday.breakfast || gd.completedToday.dinner) },
            { name: 'Похудевший',  cond: () => gd.weight <= 80 },
            { name: 'Атлет',       cond: () => gd.weight <= 70 },
            { name: 'Легенда',     cond: () => gd.weight <= 60 },
            { name: 'Мазохист',    cond: () => (gd.dayDeaths || 0) >= 3 },
            { name: 'Фастфудщик',  cond: () => (gd.junkFoodCount || 0) >= 3 },
        ];
        checks.forEach(c => {
            if (!gd.unlocked.has(c.name) && c.cond()) {
                gd.unlocked.add(c.name);
                this._unlockAchievement(c.name);
            }
        });
    }

    async _unlockAchievement(name) {
        const ach = ALL_ACHIEVEMENTS.find(a => a.name === name);
        if (!ach) return;
        this._showNotification(`🏅 Достижение: ${ach.name}!`, '#ff8c00');
        this.particles.emitStar(this.W / 2, 60);
        if (this.gameData.saveId) {
            await this.api.unlockAchievement({
                save_id: this.gameData.saveId,
                name: ach.name,
                description: ach.description,
                icon: ach.icon,
            });
        }
    }

    _showNotification(text, color = '#fff') {
        this.notification = { text, color };
        this.notifTimer = 2.5;
    }

    _restartGame() {
        if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
        if (this.foodMenu) { this.foodMenu.destroy(); this.foodMenu = null; }
        if (this.lobby) { this.lobby.destroy(); this.lobby = null; }
        if (this.mpMode) { this.mp.disconnect(); this.mpMode = false; }
        this.gameData = new GameData();
        this.setState('menu');
        this._loadMenuData();
        this.audio.startMusic('normal');
    }

    setState(newState) {
        this.state = newState;
        this.hovered = null;
        if (newState === 'menu') this._loadMenuData();
    }

    // ── Main loop ────────────────────────────────────────────────────────────────

    start() {
        this._loadMenuData();
        this.audio.startMusic('normal');
        this.lastTime = performance.now();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;
        this.update(dt);
        this.render();
        this._justPressed.clear();
        requestAnimationFrame(this._loop);
    }

    update(dt) {
        this.ui.update(dt);
        this.particles.update(dt);

        if (this.notifTimer > 0) { this.notifTimer -= dt; if (this.notifTimer <= 0) this.notification = null; }

        this.nameCursorTimer += dt;
        if (this.nameCursorTimer > 0.5) { this.nameCursorTimer = 0; this.nameCursor = !this.nameCursor; }

        switch (this.state) {
            case 'lobby':
                this.lobby && this.lobby.update(dt);
                break;
            case 'morning':
                this.morningTimer += dt;
                break;
            case 'parkour':
                if (this.activeGame) {
                    this.activeGame.update(dt);
                    if (this.activeGame.done) {
                        const ag = this.activeGame;
                        ag.destroy(); this.activeGame = null;
                        this._finishActivity('parkour', { success: ag.success, weightLost: ag.weightLost || 0, timeBonus: ag.timeBonus || 0, deaths: ag.deaths || 0 });
                    }
                }
                break;
            case 'gym':
                if (this.activeGame) {
                    this.activeGame.update(dt);
                    if (this.activeGame.done) {
                        const ag = this.activeGame;
                        ag.destroy(); this.activeGame = null;
                        this._finishActivity('gym', { success: ag.success, weightLost: ag.weightLost || 0, energyCost: ag.exercise.energyCost, exercise: ag.exercise });
                    }
                }
                break;
            case 'food':
                if (this.foodMenu) {
                    this.foodMenu.update(dt);
                    if (this.foodMenu.done) {
                        const fm = this.foodMenu;
                        fm.destroy(); this.foodMenu = null;
                        this._finishActivity('food', { result: fm.result, mealType: fm.mealType });
                    }
                }
                break;
            case 'death':
                this.deathTimer += dt;
                this.deathGlitch = Math.max(0, this.deathGlitch - dt * 0.3);
                if (Math.random() < 0.15) this.ui.triggerShake(8);
                break;
            case 'victory':
                this.victoryTimer += dt;
                break;
        }
    }

    render() {
        const ctx = this.ctx;
        const gd = this.gameData;
        ctx.clearRect(0, 0, this.W, this.H);

        switch (this.state) {
            case 'menu':         this._renderMenu(); break;
            case 'nameInput':    this.ui.renderNameInput(this.nameInput, this.nameCursor); break;
            case 'load':         this.ui.renderLoadSaves(this.saves, this.hovered); break;
            case 'morning':      this.ui.renderMorning(gd, gd.lastNightEvents); break;
            case 'day_select':   this.ui.renderDaySelect(gd, this.hovered, gd.day, gd.completedToday); break;
            case 'lobby':        this.lobby && this.lobby.render(); break;
            case 'parkour':      this.activeGame && this.activeGame.render(); this.ui.renderHUD(gd); break;
            case 'gym':          this.activeGame && this.activeGame.render(); this.ui.renderHUD(gd); break;
            case 'food':         this.foodMenu && this.foodMenu.render(); break;
            case 'evening':      this.ui.renderEvening(gd, 'good'); break;
            case 'night':        this.ui.renderNight(gd.day, this.nightEvents); break;
            case 'death':        this.ui.renderDeathScreen(gd, this.deathGlitch); break;
            case 'victory':      this.ui.renderVictoryScreen(gd, this._endingType, this.victoryTimer); break;
            case 'settings':     this.ui.renderSettings(gd, this.settings, this.hovered); break;
            case 'leaderboard':  this.ui.renderLeaderboard(this.leaderboard, this.hovered); break;
            case 'achievements': this.ui.renderAchievements(this.achievements, ALL_ACHIEVEMENTS, this.hovered); break;
        }

        // Flash overlay
        if (this.ui.flashAlpha > 0) {
            ctx.fillStyle = this.ui.flashColor;
            ctx.globalAlpha = this.ui.flashAlpha;
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.globalAlpha = 1;
        }

        // Particles (non-parkour)
        if (this.state !== 'parkour') this.particles.render(0, 0);

        // Notification toast
        if (this.notification) {
            const alpha = Math.min(1, this.notifTimer);
            ctx.save();
            ctx.globalAlpha = alpha;
            const nW = 460;
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(this.W / 2 - nW / 2, this.H - 100, nW, 44);
            ctx.strokeStyle = this.notification.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(this.W / 2 - nW / 2, this.H - 100, nW, 44);
            ctx.fillStyle = this.notification.color;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.notification.text, this.W / 2, this.H - 71);
            ctx.textAlign = 'left';
            ctx.restore();
        }
    }

    _renderMenu() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.ui.animTimer;

        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < 30; i++) {
            const px = ((i * 137 + t * 20) % W);
            const py = ((i * 211 + t * 15) % H);
            ctx.fillStyle = `rgba(${i*8%255},${i*13%255},${i*7%255},0.15)`;
            ctx.fillRect(Math.floor(px), Math.floor(py), 3, 3);
        }

        const p = 0.95 + 0.05 * Math.sin(t * 2);
        ctx.save();
        ctx.translate(W / 2, 120);
        ctx.scale(p, p);
        ctx.fillStyle = '#f00';
        ctx.font = 'bold 52px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ПОХУДЕЙ', 0, 0);
        ctx.fillStyle = '#ff0';
        ctx.fillText('ИЛИ УМРИ', 0, 54);
        ctx.restore();

        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Симулятор выживания | Pixel Art | Мультиплеер', W / 2, 200);

        this.ui._drawHero(W / 2 - 20, 215, 110);

        const btns = [
            { label: '▶  ОДИНОЧНАЯ ИГРА',  id: 'new',         y: 340, color: '#2a5a8a' },
            { label: '👥  СОВМЕСТНАЯ ИГРА', id: 'multiplayer', y: 390, color: '#2a5a2a' },
            { label: '📂  ЗАГРУЗИТЬ',       id: 'load',        y: 440, color: '#4a2a5a', disabled: !this.saves || this.saves.length === 0 },
            { label: '🏆  РЕКОРДЫ',         id: 'leaderboard', y: 490, color: '#5a4a2a' },
        ];

        btns.forEach(btn => {
            const isHov = this.hovered === btn.id;
            ctx.fillStyle = btn.disabled ? '#111' : isHov ? this._lightenHex(btn.color) : btn.color;
            ctx.fillRect(W/2-160, btn.y, 320, 38);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(W/2-160, btn.y, 320, 4);
            ctx.fillStyle = btn.disabled ? '#333' : isHov ? '#5af' : '#fff';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(btn.label, W/2, btn.y + 26);
        });

        // Settings icon
        const isHovSet = this.hovered === 'settings';
        ctx.fillStyle = isHovSet ? '#3a3a6a' : '#1a1a3a';
        ctx.fillRect(W/2+170, 490, 110, 38);
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('⚙ Настройки', W/2+225, 516);

        ctx.fillStyle = '#333';
        ctx.font = '11px monospace';
        ctx.fillText('v2.0.0  |  WebSocket Multiplayer', W/2, H - 16);
        ctx.textAlign = 'left';
    }

    _lightenHex(color) {
        // Quick brightness bump for hover
        return color.replace(/#(..)(..)(..)/, (_, r, g, b) => {
            const bump = v => Math.min(255, parseInt(v, 16) + 30).toString(16).padStart(2, '0');
            return `#${bump(r)}${bump(g)}${bump(b)}`;
        });
    }
}
