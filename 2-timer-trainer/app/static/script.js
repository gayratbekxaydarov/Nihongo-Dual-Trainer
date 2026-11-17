(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const el = {
        setup: $('setup'),
        player: $('player'),
        seconds: $('secondsInput'),
        chips: [...document.querySelectorAll('.chip')],
        shuffle: $('shuffleCheck'),
        start: $('startBtn'),
        setupHint: $('setupHint'),
        counter: $('counter'),
        kanji: $('kanjiDisplay'),
        bar: $('timerBar'),
        prev: $('prevBtn'),
        play: $('playBtn'),
        next: $('nextBtn'),
        back: $('backBtn'),
        status: $('statusText'),
    };

    const TICK_MS = 100;
    const STORE_KEY = 'timerTrainerSeconds';
    const MIN_SEC = 1;
    const MAX_SEC = 600;

    let words = [];
    let order = [];
    let pos = 0;
    let running = false;
    let elapsed = 0;            // joriy kanji ko'rsatilganidan beri (ms)
    let duration = 5000;
    let last = performance.now();
    let tickId = null;
    let wakeLock = null;

    function setStatus(text, cls) {
        el.status.textContent = text;
        el.status.className = `badge ${cls} status-badge`;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    const current = () => words[order[pos]];

    // ---------- Soniyani tanlash ----------
    function readSeconds() {
        const n = Math.round(Number(el.seconds.value));
        if (!Number.isFinite(n) || n < MIN_SEC || n > MAX_SEC) return null;
        return n;
    }

    function syncChips() {
        const n = readSeconds();
        el.chips.forEach((c) => c.classList.toggle('active', Number(c.dataset.sec) === n));
    }

    el.chips.forEach((chip) =>
        chip.addEventListener('click', () => {
            el.seconds.value = chip.dataset.sec;
            syncChips();
        }));
    el.seconds.addEventListener('input', syncChips);
    el.seconds.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startSession();
    });

    // ---------- So'zlar ----------
    function buildOrder() {
        order = shuffle(words.map((_, i) => i));
        if (!el.shuffle.checked) order.sort((a, b) => a - b);
        pos = 0;
    }

    function fitKanji(text) {
        const len = [...text].length;
        el.kanji.className = 'kanji-big' + (len >= 6 ? ' len-6' : len >= 4 ? ' len-4' : '');
    }

    function showWord() {
        const w = current();
        elapsed = 0;
        el.counter.textContent = `${pos + 1} / ${order.length}`;
        el.kanji.textContent = w.kanji;     // faqat kanji ko'rsatiladi
        fitKanji(w.kanji);
        el.bar.style.width = '0%';
    }

    function next() {
        pos += 1;
        if (pos >= order.length) buildOrder();
        showWord();
    }

    function prev() {
        pos = (pos - 1 + order.length) % order.length;
        showWord();
    }

    // ---------- Ekran o'chib qolmasligi (telefon) ----------
    async function acquireWakeLock() {
        try {
            if ('wakeLock' in navigator && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            }
        } catch (_) { /* ixtiyoriy */ }
    }

    function releaseWakeLock() {
        try { if (wakeLock) wakeLock.release(); } catch (_) { /* ixtiyoriy */ }
        wakeLock = null;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && running) acquireWakeLock();
    });

    // ---------- Taymer ----------
    function setRunning(value) {
        running = value;
        last = performance.now();
        el.play.textContent = running ? '⏸' : '▶';
        setStatus(running ? 'Ishlayapti' : 'Pauza', running ? 'bg-info text-dark' : 'bg-secondary');
        if (running) acquireWakeLock(); else releaseWakeLock();
    }

    function tick() {
        const now = performance.now();
        const dt = Math.min(now - last, 1000);   // kompyuter uxlab qolsa, sakrab ketmasin
        last = now;
        if (!running || !words.length) return;

        elapsed += dt;
        if (elapsed >= duration) {
            next();
            return;
        }
        el.bar.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;
    }

    function startSession() {
        if (!words.length) return;
        const n = readSeconds();
        if (n === null) {
            el.setupHint.textContent = `Soniyani ${MIN_SEC} dan ${MAX_SEC} gacha kiriting.`;
            el.seconds.focus();
            return;
        }
        el.setupHint.textContent = '';
        duration = n * 1000;
        try { localStorage.setItem(STORE_KEY, String(n)); } catch (_) { /* ixtiyoriy */ }

        buildOrder();
        el.setup.classList.add('d-none');
        el.player.classList.remove('d-none');
        showWord();
        setRunning(true);
        if (!tickId) tickId = setInterval(tick, TICK_MS);
    }

    function backToSetup() {
        setRunning(false);
        clearInterval(tickId);
        tickId = null;
        el.player.classList.add('d-none');
        el.setup.classList.remove('d-none');
    }

    // ---------- Boshqaruv ----------
    el.start.addEventListener('click', startSession);
    el.play.addEventListener('click', () => setRunning(!running));
    el.next.addEventListener('click', next);
    el.prev.addEventListener('click', prev);
    el.back.addEventListener('click', backToSetup);

    const isSpace = (e) => e.code === 'Space' || e.key === ' ';
    const playerVisible = () => !el.player.classList.contains('d-none');
    const isFormField = (e) => ['SELECT', 'INPUT', 'TEXTAREA'].includes(e.target.tagName);

    document.addEventListener('keydown', (e) => {
        if (!playerVisible() || isFormField(e)) return;
        if (isSpace(e)) {
            e.preventDefault();
            if (!e.repeat) setRunning(!running);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            next();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prev();
        }
    });
    // Fokusdagi tugma Space bilan ikki marta ishlamasin
    document.addEventListener('keyup', (e) => {
        if (playerVisible() && isSpace(e) && !isFormField(e)) e.preventDefault();
    });

    // ---------- Ishga tushirish ----------
    async function init() {
        try {
            const saved = Number(localStorage.getItem(STORE_KEY));
            if (saved >= MIN_SEC && saved <= MAX_SEC) el.seconds.value = String(saved);
        } catch (_) { /* ixtiyoriy */ }
        syncChips();

        try {
            const res = await fetch('/api/words');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || `Server xatosi (${res.status})`);
            words = data;
        } catch (err) {
            el.setupHint.textContent = String(err.message || err);
            return;
        }
        el.start.disabled = false;
    }

    init();
})();
