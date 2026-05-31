'use strict';

const ALL_ACHIEVEMENTS = [
    { name: 'Первый Шаг',  description: 'Завершить первый день',             icon: '👟' },
    { name: 'Потный',      description: 'Пройти все 5 уровней паркура',       icon: '💦' },
    { name: 'Железный',    description: 'Пройти все 4 вида тренировок',       icon: '🏋️' },
    { name: 'Веган',       description: 'Есть только здоровую еду весь день', icon: '🥗' },
    { name: 'Похудевший',  description: 'Достичь веса 80 кг',                 icon: '⚖️' },
    { name: 'Атлет',       description: 'Достичь веса 70 кг',                 icon: '🏃' },
    { name: 'Легенда',     description: 'Достичь веса 60 кг',                 icon: '🌟' },
    { name: 'Мазохист',    description: 'Умереть 3 раза в паркуре за день',   icon: '💀' },
    { name: 'Фастфудщик',  description: 'Съесть 3 вредных блюда подряд',      icon: '🍔' },
    { name: 'Марафонец',   description: 'Пробежать паркур быстрее пара',      icon: '⚡' },
];

// ─── GameData ──────────────────────────────────────────────────────────────────

class GameData {
    constructor() {
        this.playerName  = 'Игрок';
        this.day         = 1;
        this.weight      = 110.0;
        this.energy      = 100.0;
        this.mood        = 100.0;
        this.strength    = 1;
        this.speed       = 1;
        this.experience  = 0;
        this.score       = 0;
        this.saveId      = null;
        this.completedToday    = { breakfast: false, parkour: false, gym: false, dinner: false };
        this.completedLevels   = [];
        this.gymTypesCompleted = new Set();
        this.junkFoodCount     = 0;
        this.lastNightEvents   = [];
        this.unlocked          = new Set();
        this.dayDeaths         = 0;
        this.eatOnlyHealthy    = true;
    }

    toSavePayload() {
        return {
            player_name: this.playerName,
            day:         this.day,
            weight:      parseFloat(this.weight.toFixed(1)),
            energy:      parseFloat(this.energy.toFixed(1)),
            mood:        parseFloat(this.mood.toFixed(1)),
            strength:    this.strength,
            speed:       this.speed,
            experience:  this.experience,
            score:       this.score,
            state_json: JSON.stringify({
                completedToday:    this.completedToday,
                completedLevels:   this.completedLevels,
                gymTypesCompleted: [...this.gymTypesCompleted],
                junkFoodCount:     this.junkFoodCount,
                unlocked:          [...this.unlocked],
                dayDeaths:         this.dayDeaths,
            }),
        };
    }

    fromSave(save) {
        this.playerName  = save.player_name;
        this.day         = save.day;
        this.weight      = save.weight;
        this.energy      = save.energy;
        this.mood        = save.mood;
        this.strength    = save.strength;
        this.speed       = save.speed;
        this.experience  = save.experience;
        this.score       = save.score;
        this.saveId      = save.id;
        try {
            const s = JSON.parse(save.state_json || '{}');
            this.completedToday    = s.completedToday    || { breakfast: false, parkour: false, gym: false, dinner: false };
            this.completedLevels   = s.completedLevels   || [];
            this.gymTypesCompleted = new Set(s.gymTypesCompleted || []);
            this.junkFoodCount     = s.junkFoodCount     || 0;
            this.unlocked          = new Set(s.unlocked  || []);
            this.dayDeaths         = s.dayDeaths         || 0;
        } catch (_) {}
    }
}

// ─── GameEngine ────────────────────────────────────────────────────────────────

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.W      = canvas.width;
        this.H      = canvas.height;

        this.state    = 'menu';
        this.gameData = new GameData();
        this.api      = new APIClient();
        this.audio    = new AudioManager();
        this.particles = new ParticleSystem(this.ctx);
        this.ui       = new UIManager(this.ctx, this.W, this.H);

        // Multiplayer
        this.mp     = new MultiplayerClient();
        this.mpMode = false;
        this.lobby  = null;

        // Cooperative waiting state
        this._waitActivity  = null;  // which activity we're waiting for
        this._waitStatus    = null;  // WaitingStatusPayload from server
        this._pendingResult = null;  // result to apply once all are done

        this.hovered = null;
        this.mx = 0; this.my = 0;

        this.activeGame = null;
        this.foodMenu   = null;
        this.nameInput  = '';
        this.nameCursor = true;
        this.nameCursorTimer = 0;

        this.saves       = [];
        this.leaderboard = [];
        this.achievements = [];

        this.deathTimer   = 0;
        this.deathGlitch  = 0;
        this.victoryTimer = 0;
        this.nightTimer   = 0;
        this.nightEvents  = [];
        this.morningTimer = 0;
        this.notification = null;
        this.notifTimer   = 0;
        this._endingType  = 'win';
        this._pendingMode = 'solo';

        this.settings = { music: true, sfx: true, musicVol: 5, sfxVol: 4 };

        this.lastTime = 0;
        this._keys = {};
        this._justPressed = new Set();

        this._bindEvents();
        this._setupMPHandlers();
    }

    // ── Events ───────────────────────────────────────────────────────────────────

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mx = (e.clientX - rect.left) * (this.W / rect.width);
            this.my = (e.clientY - rect.top)  * (this.H / rect.height);
            this._updateHover();
        });

        this.canvas.addEventListener('click', e => {
            const rect = this.canvas.getBoundingClientRect();
            const cx = (e.clientX - rect.left) * (this.W / rect.width);
            const cy = (e.clientY - rect.top)  * (this.H / rect.height);
            this.audio.resume();
            this._handleClick(cx, cy);
        });

        window.addEventListener('keydown', e => {
            this._keys[e.code] = true;
            this._justPressed.add(e.code);
            this.audio.resume();

            // Name input
            if (this.state === 'nameInput') {
                if (e.code === 'Backspace') this.nameInput = this.nameInput.slice(0, -1);
                else if (e.code === 'Enter') this._startNewGame();
                else if (e.key.length === 1 && this.nameInput.length < 16) this.nameInput += e.key;
            }

            // Space advances screens
            if (['morning','evening','night'].includes(this.state) && e.code === 'Space') {
                this._advanceFromScreen();
            }

            // ESC exits to menu from most screens
            if (e.code === 'Escape') this._handleEsc();
        });

        window.addEventListener('keyup', e => { this._keys[e.code] = false; });
    }

    _handleEsc() {
        const exitableStates = ['morning','day_select','evening','night','nameInput','waiting','lobby','parkour','gym','food'];
        if (exitableStates.includes(this.state)) {
            this._exitToMenu();
        }
    }

    _exitToMenu() {
        if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
        if (this.foodMenu)   { this.foodMenu.destroy();   this.foodMenu   = null; }
        if (this.lobby)      { this.lobby.destroy();      this.lobby      = null; }
        if (this.mpMode)     { this.mp.disconnect();      this.mpMode     = false; }
        this._waitActivity  = null;
        this._waitStatus    = null;
        this._pendingResult = null;
        this.audio.stopMusic();
        this.setState('menu');
        this.audio.startMusic('normal');
    }

    _setupMPHandlers() {
        this.mp.on('welcome', p => {
            this.mp.playerId = p.player_id;
            this.mp.join(this.gameData.playerName);
        });

        // All players finished an activity → apply result and proceed
        this.mp.on('activity_all_done', p => {
            if (this.state !== 'waiting') return;
            const bonus = p.group_bonus || 0;
            if (bonus > 0) {
                this.gameData.weight = Math.max(40, this.gameData.weight - bonus);
                this._showNotification(`🎉 Группа выполнила ${p.activity}! Бонус −${bonus} кг`, '#ff0');
                this.particles.emitLevel(this.W / 2, this.H / 2);
            }
            // Apply the pending result now
            if (this._pendingResult) {
                this._applyActivityResult(this._pendingResult.type, this._pendingResult.result);
                this._pendingResult = null;
            }
            this._waitActivity = null;
            this._waitStatus   = null;
            this.setState('day_select');
        });

        // Status update while waiting
        this.mp.on('waiting_status', p => {
            if (this._waitActivity === p.activity) {
                this._waitStatus = p;
            }
        });

        this.mp.on('activity_start', p => {
            if (p.player_id !== this.mp.playerId) {
                this._showNotification(`${p.player_name} начал ${p.activity}! Присоединяйся!`, p.color || '#4af');
            }
        });

        this.mp.on('group_bonus', p => {
            if (this.gameData) {
                this.gameData.weight = Math.max(40, this.gameData.weight - p.weight_drop);
                this._showNotification(`🎉 ${p.reason}`, '#ff0');
            }
        });

        // Lobby ГОТОВ: all players ready → start game day 1
        // Night ГОТОВ:  all players ready → advance to next day (day_start carries the day number)
        this.mp.on('ready_status', p => {
            if (!p.all_ready) return;
            if (this.state === 'lobby') {
                if (this.lobby) { this.lobby.destroy(); this.lobby = null; }
                this.gameData.day = 1;
                this._beginDay();
            }
            // night transition is handled by day_start below
        });

        this.mp.on('day_start', p => {
            if (this.mpMode && this.state === 'night') {
                this.gameData.day = p.day;
                this._beginDay();
            }
        });

        this.mp.on('disconnected', () => {
            this._showNotification('Соединение потеряно', '#f44');
            // If waiting, unblock — can't wait forever
            if (this.state === 'waiting' && this._pendingResult) {
                this._applyActivityResult(this._pendingResult.type, this._pendingResult.result);
                this._pendingResult = null;
                this._waitActivity  = null;
                this._waitStatus    = null;
                this.setState('day_select');
            }
        });
    }

    // ── Hover ────────────────────────────────────────────────────────────────────

    _updateHover() {
        const mx = this.mx; const my = this.my;
        const W  = this.W;  const H  = this.H;
        this.hovered = null;

        // Exit button (top-right, all screens)
        if (this.ui.isExitBtnHit(mx, my)) { this.hovered = 'exit'; return; }
        // HUD exit button during parkour/gym
        if (['parkour','gym'].includes(this.state) && mx >= W-126 && mx <= W-10 && my >= 8 && my <= 38) {
            this.hovered = 'exit'; return;
        }

        if (this.state === 'menu') {
            if (mx >= W/2-160 && mx <= W/2+160) {
                if (my >= 340 && my <= 378) { this.hovered = 'new';         return; }
                if (my >= 390 && my <= 428) { this.hovered = 'multiplayer'; return; }
                if (my >= 440 && my <= 478) { this.hovered = 'load';        return; }
                if (my >= 490 && my <= 528) { this.hovered = 'leaderboard'; return; }
            }
            if (mx >= W/2+170 && mx <= W/2+280 && my >= 490 && my <= 528) { this.hovered = 'settings'; return; }
        }

        if (this.state === 'day_select') {
            const sx = (W - 580) / 2;
            ['breakfast','parkour','gym','dinner','sleep'].forEach((id, i) => {
                const cy = 120 + i * 80;
                if (mx >= sx && mx <= sx + 580 && my >= cy && my <= cy + 72) this.hovered = id;
            });
        }

        if (this.state === 'death')   this.hovered = (mx >= W/2-220 && mx <= W/2+220 && my >= H-160 && my <= H-60) ? 'restart' : null;
        if (this.state === 'victory') this.hovered = (mx >= W/2-180 && mx <= W/2+180 && my >= H-90 && my <= H-40) ? 'menu' : null;
        if (['leaderboard','achievements'].includes(this.state)) {
            this.hovered = (mx >= W/2-100 && mx <= W/2+100 && my >= H-56 && my <= H-20) ? 'back' : null;
        }
        if (this.state === 'settings') {
            this.hovered = (mx >= W/2-130 && mx <= W/2+130 && my >= 420 && my <= 470) ? 'back' : null;
        }
        if (this.state === 'load') {
            (this.saves || []).forEach((s, i) => {
                const sy = 130 + i * 78;
                if (mx >= W/2-280 && mx <= W/2+280 && my >= sy && my <= sy+68) this.hovered = `save_${s.id}`;
            });
            if (mx >= W/2-100 && mx <= W/2+100 && my >= H-56 && my <= H-16) this.hovered = 'back';
        }
    }

    // ── Clicks ───────────────────────────────────────────────────────────────────

    _handleClick(cx, cy) {
        const W = this.W; const H = this.H;

        // Exit button — always available
        if (this.ui.isExitBtnHit(cx, cy)) { this._exitToMenu(); return; }
        // HUD exit during parkour/gym
        if (['parkour','gym'].includes(this.state) && cx >= W-126 && cx <= W-10 && cy >= 8 && cy <= 38) {
            this._exitToMenu(); return;
        }

        switch (this.state) {
        case 'menu':
            if (cx >= W/2-160 && cx <= W/2+160) {
                if (cy >= 340 && cy <= 378) { this._goToNameInput('solo');  return; }
                if (cy >= 390 && cy <= 428) { this._goToNameInput('multi'); return; }
                if (cy >= 440 && cy <= 478) { this._loadSaves();            return; }
                if (cy >= 490 && cy <= 528) { this._goLeaderboard();        return; }
            }
            if (cx >= W/2+170 && cx <= W/2+280 && cy >= 490 && cy <= 528) { this.setState('settings'); return; }
            break;

        case 'nameInput':
            if (cx >= W/2-120 && cx <= W/2+120 && cy >= H/2+30 && cy <= H/2+74) this._startNewGame();
            break;

        case 'day_select': {
            const sx = (W - 580) / 2;
            ['breakfast','parkour','gym','dinner','sleep'].forEach((id, i) => {
                const cardY = 120 + i * 80;
                if (cx >= sx && cx <= sx + 580 && cy >= cardY && cy <= cardY + 72) this._startActivity(id);
            });
            break;
        }

        case 'morning': case 'evening': case 'night':
            this._advanceFromScreen();
            break;

        case 'waiting':
            // Only exit button (handled above)
            break;

        case 'death':
            if (cx >= W/2-220 && cx <= W/2+220 && cy >= H-160 && cy <= H-60) this._restartGame();
            break;

        case 'victory':
            if (cx >= W/2-180 && cx <= W/2+180 && cy >= H-90 && cy <= H-40) {
                this.setState('menu'); this._loadMenuData();
            }
            break;

        case 'leaderboard': case 'achievements':
            if (cx >= W/2-100 && cx <= W/2+100 && cy >= H-56 && cy <= H-20) this.setState('menu');
            break;

        case 'settings':
            this._handleSettingsClick(cx, cy);
            break;

        case 'load':
            (this.saves || []).forEach(s => {
                const idx = this.saves.indexOf(s);
                const sy  = 130 + idx * 78;
                if (cx >= W/2-280 && cx <= W/2+280 && cy >= sy && cy <= sy+68) this._loadSave(s);
            });
            if (cx >= W/2-100 && cx <= W/2+100 && cy >= H-56 && cy <= H-16) this.setState('menu');
            break;
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
                        if (this.settings.music) this.audio.startMusic('normal'); else this.audio.stopMusic();
                    }
                    this.audio.playClick();
                }
            } else {
                if (cx >= W/2+60 && cx <= W/2+80 && cy >= item.y+8 && cy <= item.y+28) {
                    this.settings[item.key] = Math.max(0, this.settings[item.key] - 1); this._applySettings();
                }
                if (cx >= W/2+262 && cx <= W/2+282 && cy >= item.y+8 && cy <= item.y+28) {
                    this.settings[item.key] = Math.min(10, this.settings[item.key] + 1); this._applySettings();
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
        const res  = await this.api.listSaves();
        this.saves = res.success ? (res.data || []) : [];
        this.setState('load');
    }

    async _goLeaderboard() {
        const [lb, ach] = await Promise.all([this.api.getLeaderboard(20), this.api.getAchievements()]);
        this.leaderboard  = lb.success  ? (lb.data  || []) : [];
        this.achievements = ach.success ? (ach.data || []) : [];
        this.setState('leaderboard');
    }

    async _loadMenuData() {
        try {
            const [lb, saves] = await Promise.all([this.api.getLeaderboard(20), this.api.listSaves()]);
            this.leaderboard = lb.success    ? (lb.data    || []) : [];
            this.saves       = saves.success ? (saves.data || []) : [];
        } catch (_) {}
    }

    _startNewGame() {
        const name = this.nameInput.trim() || 'Толстяк';
        this.gameData = new GameData();
        this.gameData.playerName = name;
        this.mpMode = this._pendingMode === 'multi';

        if (this.mpMode) {
            this._showNotification('Подключение к серверу...', '#4af');
            this.mp.connect(() => {
                setTimeout(() => {
                    if (this.lobby) { this.lobby.destroy(); this.lobby = null; }
                    this.lobby = new LobbyManager(this.ctx, this.W, this.H, this.mp, this.gameData, this.audio, this.particles);
                    this.setState('lobby');
                    this.audio.startMusic('normal');
                }, 300);
            });
        } else {
            this._beginDay();
        }
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
        this.gameData.dayDeaths      = 0;
        this.gameData.eatOnlyHealthy = true;
        this._waitActivity  = null;
        this._waitStatus    = null;
        this._pendingResult = null;
        this.morningTimer   = 0;
        this.setState('morning');
        this.audio.playDayStart();
        this.audio.startMusic(this.gameData.day >= 4 ? 'tense' : 'normal');

        if (this.mpMode && this.mp.connected) {
            this.mp.sendStatsUpdate(this.gameData.weight, this.gameData.energy, this.gameData.mood, this.gameData.score, this.gameData.day);
        }
    }

    _advanceFromScreen() {
        if (this.state === 'morning')  { this.setState('day_select'); return; }
        if (this.state === 'evening')  { this._doNight();             return; }
        if (this.state === 'night') {
            if (this.mpMode && this.mp.connected) {
                this.mp.sendNightReady();
                this._showNotification('Ждём других игроков...', '#4af');
            } else {
                this._advanceDay();
            }
        }
    }

    _startActivity(id) {
        const gd   = this.gameData;
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
            if (this.mpMode && this.mp.connected) this.mp.sendActivityStart(id);
            return;
        }

        if (id === 'parkour') {
            if (gd.energy < 5) { this._showNotification('Совсем нет энергии! Поешь сначала.', '#f44'); return; }
            const levelData = LEVELS[(gd.day - 1) % LEVELS.length];
            if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
            this.activeGame = new ParkourGame(this.ctx, this.W, this.H, levelData, gd, this.audio, this.particles, this.mpMode ? this.mp : null);
            this.activeGame.init();
            this.setState('parkour');
            if (this.mpMode && this.mp.connected) this.mp.sendActivityStart('parkour');
            return;
        }

        if (id === 'gym') {
            if (gd.energy < 3) { this._showNotification('Совсем нет энергии!', '#f44'); return; }
            const ex = GYM_EXERCISES[gd.gymTypesCompleted.size % GYM_EXERCISES.length];
            if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
            this.activeGame = new GymGame(this.ctx, this.W, this.H, ex, gd, this.audio, this.particles);
            this.setState('gym');
            if (this.mpMode && this.mp.connected) this.mp.sendActivityStart('gym');
            return;
        }
    }

    // Called when the activity mini-game finishes
    _finishActivity(type, result) {
        const gd = this.gameData;

        // Send result to server (always, even in solo)
        if (this.mpMode && this.mp.connected) {
            const weightLost = type === 'food' ? 0 : (result.weightLost || 0);
            const newWeight  = type === 'food'
                ? Math.max(40, gd.weight + (result.result ? result.result.weightChange : 0))
                : Math.max(40, gd.weight - weightLost);
            this.mp.sendActivityResult(type === 'food' ? result.mealType : type, result.success !== false, weightLost, newWeight);

            // Store pending result and wait for all_done
            this._pendingResult = { type, result };
            this._waitActivity  = type === 'food' ? result.mealType : type;
            this._waitStatus    = null;
            this.setState('waiting');
            return;
        }

        // Solo: apply immediately
        this._applyActivityResult(type, result);
    }

    // Actually modifies GameData — called either immediately (solo) or after all done (mp)
    _applyActivityResult(type, result) {
        const gd = this.gameData;

        if (type === 'parkour') {
            gd.completedToday.parkour = true;
            gd.energy = Math.max(0, gd.energy - 30);
            if (result.success) {
                gd.weight = Math.max(40, gd.weight - (result.weightLost || 0));
                gd.score += Math.floor((result.weightLost || 0) * 100) + (result.timeBonus || 0) * 10;
                gd.experience += 50;
                if (!gd.completedLevels.includes(gd.day)) gd.completedLevels.push(gd.day);
                this._showNotification(`Паркур! −${(result.weightLost || 0).toFixed(1)} кг 🏃`, '#4f4');
            } else {
                gd.weight = Math.max(40, gd.weight - 0.5);
                gd.dayDeaths = (gd.dayDeaths || 0) + (result.deaths || 0);
                this._showNotification('Не добежал... −0.5 кг', '#fa0');
            }

        } else if (type === 'gym') {
            gd.completedToday.gym = true;
            gd.energy = Math.max(0, gd.energy - (result.energyCost || 0));
            gd.weight = Math.max(40, gd.weight - (result.weightLost || 0));
            if (result.success) {
                gd.experience += 30;
                gd.score += Math.floor((result.weightLost || 0) * 80);
                if (result.exercise?.strengthGain) gd.strength = Math.min(10, gd.strength + 1);
                if (result.exercise?.speedGain)    gd.speed    = Math.min(10, gd.speed    + 1);
                gd.gymTypesCompleted.add(result.exercise?.id);
                this._showNotification(`Тренировка! −${(result.weightLost || 0).toFixed(1)} кг 💪`, '#4f4');
            } else {
                this._showNotification('Провал! −' + (result.weightLost || 0).toFixed(1) + ' кг', '#f44');
            }

        } else if (type === 'food') {
            const r = result.result;
            if (!r) return;
            if (result.mealType === 'breakfast') gd.completedToday.breakfast = true;
            else                                  gd.completedToday.dinner    = true;
            gd.weight = Math.max(40, gd.weight + r.weightChange);
            gd.energy = Math.min(100, Math.max(0, gd.energy + r.energyChange));
            gd.mood   = Math.min(100, Math.max(0, gd.mood   + r.moodChange));
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
        const gd     = this.gameData;
        const events = [];

        // Always restore a base 40 energy per night so player can always do something
        gd.energy = Math.min(100, gd.energy + 40);
        if (gd.energy >= 90)      { events.push('😴 Отлично поспал! Полная энергия'); }
        else if (gd.energy < 40)  { gd.weight = Math.min(200, gd.weight + 2); events.push('😩 Плохой сон! +2 кг, мало энергии'); }
        else                      { events.push(`😐 Нормальный сон. Энергия: ${Math.round(gd.energy)}%`); }

        gd.mood = Math.min(100, gd.mood + 15);
        events.push(`😊 Настроение: ${Math.round(gd.mood)}%`);

        if (!gd.completedToday.parkour && !gd.completedToday.gym) {
            gd.weight = Math.min(200, gd.weight + 2);
            events.push('😱 Не тренировался! +2 кг');
        }

        const randoms = [
            { chance: 0.2,  text: '🎲 Нашёл гантель! −0.5 кг', w: -0.5 },
            { chance: 0.15, text: '🎲 Съел торт ночью! +1 кг',  w:  1   },
            { chance: 0.1,  text: '🎲 Ночной марафон! −1 кг',   w: -1   },
        ];
        for (const r of randoms) {
            if (Math.random() < r.chance) {
                gd.weight = Math.max(40, Math.min(200, gd.weight + r.w));
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
        else                              this._triggerVictory(this._endingType);
    }

    _triggerDeath() {
        this.deathTimer  = 0;
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
            player_name:   gd.playerName,
            final_weight:  parseFloat(gd.weight.toFixed(1)),
            weight_lost:   parseFloat((110 - gd.weight).toFixed(1)),
            days_survived: gd.day,
            score:         gd.score,
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
            { name: 'Первый Шаг', cond: () => gd.day >= 1 },
            { name: 'Потный',     cond: () => gd.completedLevels.length >= 5 },
            { name: 'Железный',   cond: () => gd.gymTypesCompleted.size >= 4 },
            { name: 'Веган',      cond: () => gd.eatOnlyHealthy && (gd.completedToday.breakfast || gd.completedToday.dinner) },
            { name: 'Похудевший', cond: () => gd.weight <= 80 },
            { name: 'Атлет',      cond: () => gd.weight <= 70 },
            { name: 'Легенда',    cond: () => gd.weight <= 60 },
            { name: 'Мазохист',   cond: () => (gd.dayDeaths || 0) >= 3 },
            { name: 'Фастфудщик', cond: () => (gd.junkFoodCount || 0) >= 3 },
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
            await this.api.unlockAchievement({ save_id: this.gameData.saveId, name: ach.name, description: ach.description, icon: ach.icon });
        }
    }

    _showNotification(text, color = '#fff') {
        this.notification = { text, color };
        this.notifTimer   = 2.5;
    }

    _restartGame() {
        if (this.activeGame) { this.activeGame.destroy(); this.activeGame = null; }
        if (this.foodMenu)   { this.foodMenu.destroy();   this.foodMenu   = null; }
        if (this.lobby)      { this.lobby.destroy();      this.lobby      = null; }
        if (this.mpMode)     { this.mp.disconnect();      this.mpMode     = false; }
        this.gameData = new GameData();
        this.setState('menu');
        this._loadMenuData();
        this.audio.startMusic('normal');
    }

    setState(newState) {
        this.state   = newState;
        this.hovered = null;
        if (newState === 'menu') this._loadMenuData();
    }

    // ── Main loop ─────────────────────────────────────────────────────────────────

    start() {
        this._loadMenuData();
        this.audio.startMusic('normal');
        this.lastTime = performance.now();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _loop(ts) {
        const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
        this.lastTime = ts;
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
        const gd  = this.gameData;
        ctx.clearRect(0, 0, this.W, this.H);

        switch (this.state) {
        case 'menu':         this._renderMenu(); break;
        case 'nameInput':    this.ui.renderNameInput(this.nameInput, this.nameCursor); break;
        case 'load':         this.ui.renderLoadSaves(this.saves, this.hovered); break;
        case 'morning':      this.ui.renderMorning(gd, gd.lastNightEvents, this.hovered); break;
        case 'day_select':   this.ui.renderDaySelect(gd, this.hovered, gd.day, gd.completedToday); break;
        case 'lobby':        this.lobby && this.lobby.render(); this.ui.drawExitBtn('← Меню', this.hovered === 'exit'); break;
        case 'parkour':      this.activeGame && this.activeGame.render(); this.ui.renderHUD(gd); break;
        case 'gym':          this.activeGame && this.activeGame.render(); this.ui.renderHUD(gd); break;
        case 'food':         this.foodMenu && this.foodMenu.render(); this.ui.drawExitBtn('← Выйти', this.hovered === 'exit'); break;
        case 'evening':      this.ui.renderEvening(gd, 'good'); break;
        case 'night':        this.ui.renderNight(gd.day, this.nightEvents); break;
        case 'waiting':      this.ui.renderWaitingScreen(this._waitActivity, this._waitStatus, null, this.mp.playerId); break;
        case 'death':        this.ui.renderDeathScreen(gd, this.deathGlitch); break;
        case 'victory':      this.ui.renderVictoryScreen(gd, this._endingType, this.victoryTimer); break;
        case 'settings':     this.ui.renderSettings(gd, this.settings, this.hovered); break;
        case 'leaderboard':  this.ui.renderLeaderboard(this.leaderboard, this.hovered); break;
        case 'achievements': this.ui.renderAchievements(this.achievements, ALL_ACHIEVEMENTS, this.hovered); break;
        }

        // Flash overlay
        if (this.ui.flashAlpha > 0) {
            ctx.fillStyle  = this.ui.flashColor;
            ctx.globalAlpha = this.ui.flashAlpha;
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.globalAlpha = 1;
        }

        // Particles (not inside parkour — parkour handles its own)
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
            ctx.lineWidth   = 2;
            ctx.strokeRect(this.W / 2 - nW / 2, this.H - 100, nW, 44);
            ctx.fillStyle = this.notification.color;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.notification.text, this.W / 2, this.H - 71);
            ctx.textAlign = 'left';
            ctx.restore();
        }
    }

    // ── Menu render ───────────────────────────────────────────────────────────────

    _renderMenu() {
        const ctx = this.ctx;
        const W = this.W; const H = this.H;
        const t = this.ui.animTimer;

        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = `rgba(${i*8%255},${i*13%255},${i*7%255},0.15)`;
            ctx.fillRect(Math.floor((i*137 + t*20) % W), Math.floor((i*211 + t*15) % H), 3, 3);
        }

        const p = 0.95 + 0.05 * Math.sin(t * 2);
        ctx.save();
        ctx.translate(W / 2, 120); ctx.scale(p, p);
        ctx.fillStyle = '#f00'; ctx.font = 'bold 52px monospace'; ctx.textAlign = 'center';
        ctx.fillText('ПОХУДЕЙ', 0, 0);
        ctx.fillStyle = '#ff0';
        ctx.fillText('ИЛИ УМРИ', 0, 54);
        ctx.restore();

        ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Симулятор выживания | Pixel Art | Мультиплеер', W / 2, 200);

        this.ui._drawHero(W / 2 - 20, 215, 110);

        const btns = [
            { label: '▶  ОДИНОЧНАЯ ИГРА',  id: 'new',         y: 340, color: '#2a5a8a' },
            { label: '👥  СОВМЕСТНАЯ ИГРА', id: 'multiplayer', y: 390, color: '#2a5a2a' },
            { label: '📂  ЗАГРУЗИТЬ',       id: 'load',        y: 440, color: '#4a2a5a', disabled: !this.saves || !this.saves.length },
            { label: '🏆  РЕКОРДЫ',         id: 'leaderboard', y: 490, color: '#5a4a2a' },
        ];

        btns.forEach(btn => {
            const isHov = this.hovered === btn.id;
            ctx.fillStyle = btn.disabled ? '#111' : isHov ? this._lighten(btn.color) : btn.color;
            ctx.fillRect(W/2-160, btn.y, 320, 38);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(W/2-160, btn.y, 320, 4);
            ctx.fillStyle = btn.disabled ? '#333' : isHov ? '#5af' : '#fff';
            ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
            ctx.fillText(btn.label, W/2, btn.y + 26);
        });

        ctx.fillStyle = this.hovered === 'settings' ? '#3a3a6a' : '#1a1a3a';
        ctx.fillRect(W/2+170, 490, 110, 38);
        ctx.fillStyle = '#aaa'; ctx.font = 'bold 14px monospace';
        ctx.fillText('⚙ Настройки', W/2+225, 516);

        ctx.fillStyle = '#333'; ctx.font = '11px monospace';
        ctx.fillText('v2.0.0  |  ESC — выход из любого экрана', W/2, H - 16);
        ctx.textAlign = 'left';
    }

    _lighten(color) {
        return color.replace(/#(..)(..)(..)/, (_, r, g, b) => {
            const b2 = v => Math.min(255, parseInt(v, 16) + 30).toString(16).padStart(2, '0');
            return `#${b2(r)}${b2(g)}${b2(b)}`;
        });
    }
}
