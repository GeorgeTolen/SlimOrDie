'use strict';

(function () {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) { console.error('Canvas not found'); return; }

    // Scale canvas to window while maintaining aspect ratio
    function resizeCanvas() {
        const ww = window.innerWidth;
        const wh = window.innerHeight;
        const aspectRatio = 960 / 540;
        let w = ww;
        let h = ww / aspectRatio;
        if (h > wh) {
            h = wh;
            w = wh * aspectRatio;
        }
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const engine = new GameEngine(canvas);
    engine.start();

    // Expose for debugging
    window._game = engine;
})();
