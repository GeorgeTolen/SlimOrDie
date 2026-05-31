'use strict';

class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.musicEnabled = true;
        this.sfxVol = 0.4;
        this.musicVol = 0.2;
        this._musicNode = null;
        this._musicGain = null;
        this._init();
    }

    _init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio not supported');
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    _gain(vol) {
        const g = this.ctx.createGain();
        g.gain.value = vol;
        g.connect(this.ctx.destination);
        return g;
    }

    _beep(freq, type, dur, vol = this.sfxVol, delay = 0) {
        if (!this.ctx || !this.enabled) return;
        const osc = this.ctx.createOscillator();
        const g = this._gain(vol);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + delay + dur);
        g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + dur);
        osc.connect(g);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + dur);
    }

    playJump() { this._beep(300, 'square', 0.12, 0.3); this._beep(500, 'square', 0.1, 0.2, 0.05); }
    playLand() { this._beep(80, 'sawtooth', 0.1, 0.25); }
    playDoubleJump() { this._beep(500, 'square', 0.08, 0.2); this._beep(700, 'square', 0.08, 0.2, 0.06); }
    playCollect() { [0, 0.05, 0.1].forEach((d, i) => this._beep(440 + i * 220, 'sine', 0.12, 0.3, d)); }
    playHurt() { this._beep(150, 'sawtooth', 0.3, 0.4); }
    playBurger() { this._beep(200, 'sawtooth', 0.15, 0.3); this._beep(150, 'sawtooth', 0.2, 0.35, 0.1); }

    playClick() { this._beep(800, 'square', 0.05, 0.2); }

    playGymHit() {
        this._beep(120, 'sawtooth', 0.08, 0.4);
        this._beep(80, 'square', 0.1, 0.3, 0.05);
    }

    playGymSuccess() {
        [0, 0.08, 0.16, 0.24].forEach((d, i) => this._beep(330 + i * 110, 'square', 0.15, 0.3, d));
    }

    playEat(healthy) {
        if (healthy) {
            this._beep(600, 'sine', 0.1, 0.3);
            this._beep(800, 'sine', 0.08, 0.2, 0.1);
        } else {
            this._beep(200, 'sawtooth', 0.15, 0.3);
            this._beep(150, 'sawtooth', 0.2, 0.4, 0.1);
        }
    }

    playLevelComplete() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this._beep(f, 'square', 0.2, 0.35, i * 0.15));
    }

    playDeath() {
        if (!this.ctx || !this.enabled) return;
        [200, 150, 100, 70, 50].forEach((f, i) =>
            this._beep(f, 'sawtooth', 0.4, 0.5, i * 0.12));
        setTimeout(() => {
            if (!this.ctx) return;
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const g = this._gain(0.3);
            src.connect(g);
            src.start();
        }, 700);
    }

    playVictory() {
        const melody = [523, 659, 784, 659, 784, 1047, 784, 1047, 1319];
        melody.forEach((f, i) => this._beep(f, 'square', 0.25, 0.4, i * 0.18));
    }

    playDayStart() {
        [392, 494, 587].forEach((f, i) => this._beep(f, 'sine', 0.2, 0.3, i * 0.12));
    }

    startMusic(type = 'normal') {
        if (!this.ctx || !this.musicEnabled) return;
        this.stopMusic();
        this._musicGain = this.ctx.createGain();
        this._musicGain.gain.value = this.musicVol;
        this._musicGain.connect(this.ctx.destination);
        this._playMusicLoop(type);
    }

    _playMusicLoop(type) {
        if (!this.ctx || !this._musicGain) return;
        const patterns = {
            normal: [
                [261, 0], [294, 0.25], [330, 0.5], [294, 0.75],
                [261, 1.0], [294, 1.25], [330, 1.5], [392, 1.75],
            ],
            tense: [
                [130, 0], [138, 0.15], [146, 0.3], [130, 0.45],
                [116, 0.6], [123, 0.75], [130, 0.9], [116, 1.1],
            ],
            victory: [
                [523, 0], [659, 0.2], [784, 0.4], [1047, 0.6],
                [784, 0.8], [659, 1.0], [523, 1.2],
            ],
        };
        const pat = patterns[type] || patterns.normal;
        const duration = pat[pat.length - 1][1] + 0.5;
        pat.forEach(([freq, t]) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type === 'tense' ? 'sawtooth' : 'square';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(this.musicVol * 0.5, this.ctx.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + t + 0.2);
            osc.connect(g);
            g.connect(this._musicGain);
            osc.start(this.ctx.currentTime + t);
            osc.stop(this.ctx.currentTime + t + 0.25);
        });
        this._musicTimer = setTimeout(() => this._playMusicLoop(type), duration * 1000);
    }

    stopMusic() {
        if (this._musicTimer) clearTimeout(this._musicTimer);
        if (this._musicGain) {
            this._musicGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            this._musicGain = null;
        }
    }

    setMusicVolume(v) {
        this.musicVol = Math.max(0, Math.min(1, v));
        if (this._musicGain) this._musicGain.gain.value = this.musicVol;
    }

    setSfxVolume(v) {
        this.sfxVol = Math.max(0, Math.min(1, v));
    }
}
