(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const el = {
        intro: $('introText'),
        counter: $('counter'),
        kanji: $('kanjiDisplay'),
        meaning: $('meaningDisplay'),
        heard: $('heardDisplay'),
        answer: $('answerBox'),
        answerReading: $('answerReading'),
        answerRomaji: $('answerRomaji'),
        hint: $('hintDisplay'),
        status: $('statusText'),
        score: $('scoreDisplay'),
        mic: $('micBtn'),
        skip: $('skipBtn'),
        hear: $('hearBtn'),
    };

    // Telefon/planshetda Space yo'q, shuning uchun tugmani bosib turish ishlatiladi
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    const MIC_IDLE = isTouch
        ? '🎤 Bosib turing va gapiring'
        : '🎤 Gapirish uchun Space-ni ushlab turing';
    const MIC_LIVE = "🎙️ Eshitilyapti... (qo'yib yuborsangiz tugaydi)";
    const CORRECT_DELAY = 1200;   // to'g'ri javobdan keyin kutish (ms)
    const WRONG_DELAY = 2200;     // xato javobda, talaffuz aytilgandan keyin kutish (ms)
    const CHECK_TIMEOUT = 6000;   // server tekshiruvi uchun (ms)

    if (isTouch) {
        el.intro.textContent = "Tugmani bosib turing va kanjini yaponcha o'qing.";
    }

    // ---------- Tez (brauzerdagi) tekshiruv ----------
    // Server tomonidagi tekshiruv (checker.py) bilan bir xil qoidalar.
    const toHiragana = (s) =>
        s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

    const normalize = (s) =>
        toHiragana(String(s).normalize('NFKC').toLowerCase())
            .replace(/[\s\u3000、。，．,.!?！？「」『』（）()〜~・-]/g, '');

    // 真面目な -> 真面目, 質問する -> 質問 ham qabul qilinadi
    function variants(text) {
        const base = normalize(text);
        const out = new Set(base ? [base] : []);
        ['する', 'な'].forEach((suffix) => {
            if (base.endsWith(suffix) && base.length - suffix.length >= 2) {
                out.add(base.slice(0, -suffix.length));
            }
        });
        return out;
    }

    function isCorrectLocal(word, heardList) {
        const targets = [...variants(word.kanji), ...variants(word.reading)];
        (word.alt || []).forEach((a) => variants(a).forEach((v) => targets.push(v)));
        return heardList.some((h) => {
            const n = normalize(h);
            return n && targets.some((t) => n === t || (n.includes(t) && n.length <= t.length + 4));
        });
    }

    // Brauzer topolmagan holatda: talaffuz (hiragana) bo'yicha serverda tekshirish
    async function checkOnServer(word, heardList) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT);
        try {
            const res = await fetch('/api/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kanji: word.kanji, reading: word.reading, heard: heardList.slice(0, 5) }),
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(String(res.status));
            return await res.json();
        } catch (_) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------- Holat ----------
    let words = [];
    let order = [];
    let pos = 0;
    let round = 0;              // har bir so'z uchun yangi raqam (eskirgan javoblarni tashlab yuborish uchun)
    let correct = 0;
    let wrong = 0;
    let locked = true;          // natija ko'rsatilayotganda yoki so'zlar yuklanmaganda
    let listening = false;
    let wantListening = false;  // tugma/Space hozir bosilganmi
    let gotResult = false;
    let hadError = false;
    let nextTimer = null;
    let recognition = null;
    let ttsUnlocked = false;

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

    function updateScore() {
        el.score.textContent = `To'g'ri: ${correct} · Xato: ${wrong}`;
    }

    function fitKanji(text) {
        const len = [...text].length;
        el.kanji.className = 'kanji-display mb-2' + (len >= 6 ? ' len-6' : len >= 4 ? ' len-4' : '');
    }

    // ---------- So'zlarni ko'rsatish ----------
    function buildOrder() {
        order = shuffle(words.map((_, i) => i));
        pos = 0;
    }

    function showWord() {
        const w = current();
        round += 1;
        el.counter.textContent = `${pos + 1} / ${order.length}`;
        el.kanji.textContent = w.kanji;
        fitKanji(w.kanji);
        el.meaning.textContent = w.meaning || '';
        el.heard.textContent = '';
        el.heard.className = 'heard-text';
        el.answer.classList.add('d-none');
        el.hint.textContent = '';
        setStatus('Tayyor', 'bg-secondary');
        locked = false;
    }

    function nextWord() {
        clearTimeout(nextTimer);
        pos += 1;
        if (pos >= order.length) buildOrder();
        showWord();
    }

    function scheduleNext(ms) {
        clearTimeout(nextTimer);
        nextTimer = setTimeout(nextWord, ms);
    }

    // ---------- Talaffuzni aytib berish (TTS) ----------
    // iOS/Android ba'zan faqat bosish paytida boshlangan ovozga ruxsat beradi,
    // shuning uchun birinchi bosishda "bo'sh" gap bilan ruxsatni ochib qo'yamiz.
    function unlockTTS() {
        if (ttsUnlocked || !('speechSynthesis' in window)) return;
        ttsUnlocked = true;
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            window.speechSynthesis.speak(u);
        } catch (_) { /* ixtiyoriy */ }
    }

    function speak(text, onDone) {
        if (!('speechSynthesis' in window)) {
            if (onDone) onDone();
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = 0.85;
        const voice = window.speechSynthesis.getVoices()
            .find((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ja'));
        if (voice) u.voice = voice;

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            if (onDone) onDone();
        };
        u.onend = finish;
        u.onerror = finish;
        setTimeout(finish, 6000); // zaxira: ba'zi brauzerlarda onend chaqirilmaydi
        window.speechSynthesis.speak(u);
    }

    // ---------- Natijani qayta ishlash ----------
    async function handleResult(heardList) {
        locked = true;
        const myRound = round;
        const w = current();
        el.heard.className = 'heard-text';
        el.heard.textContent = `Siz aytdingiz: ${heardList[0] || ''}`;

        let ok = isCorrectLocal(w, heardList);
        let heardReading = '';
        let serverFailed = false;

        if (!ok) {
            setStatus('Tekshirilmoqda...', 'bg-info text-dark');
            const res = await checkOnServer(w, heardList);
            if (myRound !== round) return;     // bu orada keyingi so'zga o'tib ketilgan
            if (res) {
                ok = !!res.correct;
                heardReading = res.heard_reading || '';
            } else {
                serverFailed = true;
            }
        }

        if (heardReading && heardReading !== normalize(heardList[0] || '')) {
            el.heard.textContent = `Siz aytdingiz: ${heardList[0]} (${heardReading})`;
        }

        if (ok) {
            correct += 1;
            updateScore();
            el.heard.className = 'heard-text good';
            setStatus("To'g'ri! ✅", 'bg-success');
            scheduleNext(CORRECT_DELAY);
        } else {
            wrong += 1;
            updateScore();
            el.heard.className = 'heard-text bad';
            setStatus('Xato ❌', 'bg-danger');
            if (serverFailed) el.hint.textContent = "Server tekshiruvi ishlamadi, oddiy tekshiruv qo'llanildi.";
            el.answerReading.textContent = w.reading;
            el.answerRomaji.textContent = w.romaji || '';
            el.answer.classList.remove('d-none');
            speak(w.reading, () => {
                if (myRound === round) scheduleNext(WRONG_DELAY);
            });
        }
    }

    // ---------- Mikrofon ----------
    function startListening() {
        if (locked || wantListening || !recognition) return;
        wantListening = true;
        gotResult = false;
        hadError = false;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        unlockTTS();
        try {
            recognition.start();
        } catch (_) { /* allaqachon ishlayapti */ }
    }

    function stopListening() {
        wantListening = false;
        if (listening && recognition) recognition.stop();
    }

    function setupRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            el.mic.textContent = '🎤 Ovoz aniqlash mavjud emas';
            el.hint.textContent =
                "Brauzeringiz ovozni aniqlashni qo'llab-quvvatlamaydi. Google Chrome yoki Edge'dan foydalaning.";
            setStatus("Ovoz yo'q", 'bg-warning text-dark');
            return;
        }

        recognition = new SR();
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.maxAlternatives = 5;

        recognition.onstart = () => {
            listening = true;
            if (!wantListening) {          // tugma start() va onstart orasida qo'yib yuborilgan
                recognition.stop();
                return;
            }
            el.mic.classList.add('listening');
            el.mic.textContent = MIC_LIVE;
            setStatus('Tinglanmoqda...', 'bg-danger');
            el.hint.textContent = '';
        };

        recognition.onresult = (event) => {
            gotResult = true;
            const res = event.results[0];
            const list = [];
            for (let i = 0; i < res.length; i++) list.push(res[i].transcript);
            handleResult(list);
        };

        recognition.onerror = (event) => {
            hadError = true;
            const messages = {
                'no-speech': isTouch
                    ? "Ovoz eshitilmadi. Tugmani bosib turib gapiring."
                    : "Ovoz eshitilmadi. Space-ni bosib turib gapiring.",
                'not-allowed': "Mikrofonga ruxsat berilmagan. Brauzer sozlamalaridan ruxsat bering (sahifa HTTPS yoki localhost orqali ochilishi kerak).",
                'service-not-allowed': "Ovoz aniqlash xizmatiga ruxsat yo'q (sahifa HTTPS yoki localhost orqali ochilishi kerak).",
                'audio-capture': "Mikrofon topilmadi.",
                'network': "Internet aloqasi yo'q. Chrome ovozni Google serverida aniqlaydi.",
            };
            if (event.error === 'aborted') return;
            setStatus('Xatolik', 'bg-warning text-dark');
            el.hint.textContent = messages[event.error] || `Xatolik: ${event.error}`;
        };

        recognition.onend = () => {
            listening = false;
            wantListening = false;
            el.mic.classList.remove('listening');
            el.mic.textContent = MIC_IDLE;
            if (!gotResult && !hadError && !locked) {
                setStatus('Tayyor', 'bg-secondary');
                el.hint.textContent = isTouch
                    ? "Ovoz eshitilmadi. Tugmani bosib turib gapiring."
                    : "Ovoz eshitilmadi. Space-ni bosib turib gapiring.";
            }
        };

        el.mic.disabled = false;
        el.mic.textContent = MIC_IDLE;
    }

    // ---------- Boshqaruv: Space va tugma (ushlab turish) ----------
    const isSpace = (e) => e.code === 'Space' || e.key === ' ';

    document.addEventListener('keydown', (e) => {
        if (!isSpace(e)) return;
        e.preventDefault();            // sahifa pastga siljimasin, tugma bosilmasin
        if (!e.repeat) startListening();
    });
    document.addEventListener('keyup', (e) => {
        if (!isSpace(e)) return;
        e.preventDefault();
        stopListening();
    });
    window.addEventListener('blur', stopListening);

    el.mic.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.mic.setPointerCapture(e.pointerId); } catch (_) { /* ixtiyoriy */ }
        startListening();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) =>
        el.mic.addEventListener(type, stopListening));
    el.mic.addEventListener('contextmenu', (e) => e.preventDefault());

    el.skip.addEventListener('click', () => {
        if (recognition && listening) recognition.abort();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        nextWord();
    });

    el.hear.addEventListener('click', () => {
        unlockTTS();
        if (words.length) speak(current().reading);
    });

    // ---------- Ishga tushirish ----------
    async function init() {
        setupRecognition();
        try {
            const res = await fetch('/api/words');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || `Server xatosi (${res.status})`);
            words = data;
        } catch (err) {
            el.kanji.textContent = '⚠️';
            el.meaning.textContent = "So'zlar yuklanmadi";
            el.hint.textContent = String(err.message || err);
            setStatus('Xatolik', 'bg-warning text-dark');
            return;
        }
        buildOrder();
        updateScore();
        showWord();
    }

    init();
})();
