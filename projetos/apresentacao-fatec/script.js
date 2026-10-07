/* ==========================================================================
   Era da IA — navegação dos slides
   Teclas: → ↓ Espaço PageDown (avançar) · ← ↑ PageUp (voltar)
           Home / End (primeiro / último) · F (tela cheia)
   ========================================================================== */

const STAGE_W = 1920;
const STAGE_H = 1080;

const deck = document.getElementById('deck');
const stage = document.getElementById('stage');
const slides = Array.from(document.querySelectorAll('.slide'));
const progressBar = document.getElementById('deckProgressBar');
const countCurrent = document.getElementById('deckCurrent');
const countTotal = document.getElementById('deckTotal');
const prevBtn = document.getElementById('deckPrev');
const nextBtn = document.getElementById('deckNext');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// uma rede neural por canvas .neural-bg; só anima a do slide visível
const neurals = Array.from(document.querySelectorAll('.neural-bg'), canvas => ({
    slide: canvas.closest('.slide'),
    net: createNeural(canvas),
}));

let current = 0;

/* ==========================================================================
   Escala do palco (1920x1080 cabendo em qualquer tela)
   ========================================================================== */

function fitStage() {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.setProperty('--stage-scale', scale);
    neurals.forEach(({ net }) => net.resize(scale));
}

/* ==========================================================================
   Navegação
   ========================================================================== */

function fragmentsOf(slide) {
    return Array.from(slide.querySelectorAll('.fragment'));
}

function goTo(index, { revealAll = false } = {}) {
    if (index < 0 || index >= slides.length) return;

    current = index;
    slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
    });
    fragmentsOf(slides[index]).forEach(f => f.classList.toggle('is-visible', revealAll));

    updateChrome();
}

function next() {
    const pending = fragmentsOf(slides[current]).find(f => !f.classList.contains('is-visible'));
    if (pending) {
        pending.classList.add('is-visible');
        updateChrome();
        return;
    }
    goTo(current + 1);
}

function prev() {
    const shown = fragmentsOf(slides[current]).filter(f => f.classList.contains('is-visible'));
    if (shown.length) {
        shown[shown.length - 1].classList.remove('is-visible');
        updateChrome();
        return;
    }
    goTo(current - 1, { revealAll: true });
}

function updateChrome() {
    const total = slides.length;
    const isBare = slides[current].hasAttribute('data-bare');
    const frags = fragmentsOf(slides[current]);
    const shown = frags.filter(f => f.classList.contains('is-visible')).length;
    const hasPending = shown < frags.length;

    // o CSS pode reagir à etapa atual do slide (ex.: [data-step="0"]) e o JS, ao evento
    slides[current].dataset.step = shown;
    slides[current].dispatchEvent(new CustomEvent('stepchange', { detail: { step: shown } }));
    deck.classList.toggle('is-bare', isBare);
    progressBar.style.width = `${total > 1 ? (current / (total - 1)) * 100 : 100}%`;
    countCurrent.textContent = String(current + 1).padStart(2, '0');
    countTotal.textContent = String(total).padStart(2, '0');
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === total - 1 && !hasPending;

    // mantém o slide atual na URL (#2, #3...) para sobreviver a um F5
    try {
        history.replaceState(null, '', `#${current + 1}`);
    } catch (e) {
        // alguns navegadores bloqueiam replaceState em file://
    }

    neurals.forEach(({ slide, net }) => {
        if (slide === slides[current]) net.start();
        else net.stop();
    });
}

function slideFromHash() {
    const n = parseInt(location.hash.slice(1), 10);
    if (Number.isNaN(n)) return 0;
    return Math.min(Math.max(n - 1, 0), slides.length - 1);
}

function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
}

/* ==========================================================================
   Eventos
   ========================================================================== */

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Espaço/Enter em um botão focado já disparam o clique dele
    if (e.target.closest('button, [role="button"]') && (e.key === ' ' || e.key === 'Enter')) return;

    switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
            e.preventDefault();
            next();
            break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
            e.preventDefault();
            prev();
            break;
        case 'Home':
            e.preventDefault();
            goTo(0);
            break;
        case 'End':
            e.preventDefault();
            goTo(slides.length - 1, { revealAll: true });
            break;
        case 'f':
        case 'F':
            toggleFullscreen();
            break;
    }
});

prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);
document.querySelectorAll('[data-action="next"]').forEach(btn => btn.addEventListener('click', next));

let touchStart = null;

deck.addEventListener('touchstart', (e) => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });

deck.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next();
        else prev();
    }
});

window.addEventListener('resize', fitStage);

window.addEventListener('hashchange', () => {
    const index = slideFromHash();
    if (index !== current) goTo(index);
});

/* ==========================================================================
   Fundo: rede neural animada nas cores da marca
   (ocupa o slide inteiro; a máscara no CSS decide onde ela aparece)
   ========================================================================== */

function createNeural(canvas) {
    const ctx = canvas.getContext('2d');
    const COUNT = 100;
    const LINK = 190;
    // data-palette="ice": azul gelado (inverno da IA); data-still: rede parada
    const [PURPLE, PINK] = canvas.dataset.palette === 'ice'
        ? [[100, 149, 237], [214, 226, 255]]
        : [[138, 43, 226], [224, 56, 143]];
    const still = canvas.hasAttribute('data-still');

    const nodes = Array.from({ length: COUNT }, () => ({
        x: Math.random() * STAGE_W,
        y: Math.random() * STAGE_H,
        vx: (Math.random() - .5) * .4,
        vy: (Math.random() - .5) * .4,
        r: 1.6 + Math.random() * 2.2,
    }));

    let frame = null;

    // mesma direção do --gradient-brand (135deg): roxo no alto à esquerda, rosa embaixo à direita
    function colorAt(x, y, alpha) {
        const t = Math.min(Math.max((x + y - 1000) / 2000, 0), 1);
        const [r, g, b] = PURPLE.map((v, k) => Math.round(v + (PINK[k] - v) * t));
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function draw() {
        ctx.clearRect(0, 0, STAGE_W, STAGE_H);
        ctx.lineWidth = 1.2;

        for (let i = 0; i < COUNT; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < COUNT; j++) {
                const b = nodes[j];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d > LINK) continue;
                ctx.strokeStyle = colorAt((a.x + b.x) / 2, (a.y + b.y) / 2, (1 - d / LINK) * .6);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }

        for (const n of nodes) {
            ctx.fillStyle = colorAt(n.x, n.y, 1);
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function tick() {
        for (const n of nodes) {
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < 0 || n.x > STAGE_W) n.vx *= -1;
            if (n.y < 0 || n.y > STAGE_H) n.vy *= -1;
        }
        draw();
        frame = requestAnimationFrame(tick);
    }

    return {
        start() {
            if (frame) return;
            if (prefersReducedMotion || still) {
                draw();
                return;
            }
            frame = requestAnimationFrame(tick);
        },
        stop() {
            cancelAnimationFrame(frame);
            frame = null;
        },
        resize(scale) {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(STAGE_W * scale * dpr);
            canvas.height = Math.round(STAGE_H * scale * dpr);
            ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
            draw();
        },
    };
}

/* ==========================================================================
   Régua do tempo: <div class="time-ruler" data-from="1940" data-to="2030" data-ticks="10">
   Posiciona cada [data-year] proporcionalmente e cria as marcações das décadas.
   ========================================================================== */

function buildTimeRuler(ruler) {
    const from = Number(ruler.dataset.from);
    const to = Number(ruler.dataset.to);
    const step = Number(ruler.dataset.ticks);
    const pos = year => (year - from) / (to - from);

    ruler.querySelectorAll('[data-year]').forEach(el => {
        const start = Number(el.dataset.year);
        el.style.setProperty('--x', pos(start));
        if (el.dataset.yearEnd) el.style.setProperty('--w', pos(Number(el.dataset.yearEnd)) - pos(start));
    });

    if (!step) return;
    const years = [];
    for (let y = from; y < to; y += step) years.push(y);
    years.forEach((y, i) => {
        const tick = document.createElement('span');
        tick.className = 'ruler-tick';
        tick.textContent = y;
        tick.style.setProperty('--x', pos(y));
        tick.style.setProperty('--k', years.length - 1 - i); // acendem da direita para a esquerda
        ruler.append(tick);
    });
}

/* ==========================================================================
   Diagrama de rede neural: <svg class="nn-diagram" data-layers="3,4,4,2">
   Cada número é a quantidade de neurônios de uma camada.
   ========================================================================== */

function buildNeuralDiagram(svg) {
    const NS = 'http://www.w3.org/2000/svg';
    const layers = svg.dataset.layers.split(',').map(Number);
    const W = 640;
    const H = 470;
    const R = 19;     // raio do neurônio
    const PAD = 60;   // margem lateral até o centro do primeiro/último neurônio
    const GAP = 92;   // distância vertical entre neurônios
    const MID = 205;  // centro vertical da rede (os nomes das camadas ficam embaixo)
    const last = layers.length - 1;

    const roleOf = i => (i === 0 ? 'input' : i === last ? 'output' : 'hidden');
    const xOf = i => PAD + (i * (W - 2 * PAD)) / last;
    const yOf = (n, j) => MID + (j - (n - 1) / 2) * GAP;

    const add = (parent, tag, attrs) => {
        const node = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
        parent.append(node);
        return node;
    };

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // gradiente da marca (roxo à esquerda, rosa à direita), compartilhado entre diagramas
    if (!document.getElementById('nnGrad')) {
        const grad = add(add(svg, 'defs', {}), 'linearGradient', {
            id: 'nnGrad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: W, y2: 0,
        });
        add(grad, 'stop', { offset: 0, 'stop-color': '#8A2BE2' });
        add(grad, 'stop', { offset: 1, 'stop-color': '#e0388f' });
    }

    // conexões primeiro, para os neurônios ficarem por cima
    for (let i = 0; i < last; i++) {
        for (let a = 0; a < layers[i]; a++) {
            for (let b = 0; b < layers[i + 1]; b++) {
                add(svg, 'line', {
                    class: `nn-edge to-${roleOf(i + 1)}`,
                    x1: xOf(i), y1: yOf(layers[i], a),
                    x2: xOf(i + 1), y2: yOf(layers[i + 1], b),
                });
            }
        }
    }

    layers.forEach((n, i) => {
        for (let j = 0; j < n; j++) {
            add(svg, 'circle', { class: `nn-node is-${roleOf(i)}`, cx: xOf(i), cy: yOf(n, j), r: R });
        }
    });

    const label = (x, text, role) => {
        add(svg, 'text', { class: `nn-label is-${role}`, x, y: H - 16, 'text-anchor': 'middle' }).textContent = text;
    };
    label(xOf(0), 'Entrada', 'input');
    if (last > 1) label((xOf(1) + xOf(last - 1)) / 2, 'Camadas ocultas', 'hidden');
    label(xOf(last), 'Saída', 'output');
}

/* ==========================================================================
   Neurônio de McCulloch-Pitts interativo (.mp-stage)
   Entradas binárias: excitatórias somam +1; um inibitório ativo veta o disparo.
   Dispara (saída 1) quando a soma chega ao limiar θ (data-threshold).
   Cada etapa do slide carrega um cenário (data-presets); clicar numa entrada
   liga/desliga na hora.
   ========================================================================== */

function setupMcCullochPitts(stage) {
    const slide = stage.closest('.slide');
    const svg = stage.querySelector('.mp-svg');
    const theta = Number(stage.dataset.threshold);
    const presets = stage.dataset.presets.split(',').map(p => Array.from(p, Number));
    const inputs = Array.from(stage.querySelectorAll('.mp-input'));
    const wires = Array.from(stage.querySelectorAll('.mp-wire'));
    const kinds = inputs.map(el => el.dataset.kind);
    const tips = wires.map(w => w.dataset.tip.split(',').map(Number));
    const soma = stage.querySelector('.mp-soma');
    const sumText = stage.querySelector('.mp-sum');
    const burst = stage.querySelector('.mp-burst');
    const ring = stage.querySelector('.mp-ring-fill');
    const readout = stage.querySelector('.mp-readout');
    const dot = stage.querySelector('.mp-dot');

    // gráfico do degrau: Σ de 0 a 3 no eixo x; saída 0 ou 1 no eixo y
    const chartX = s => 30 + s * 66;
    const chartY = out => (out ? 30 : 100);
    stage.querySelector('.mp-threshold text').textContent = `limiar θ = ${theta}`;
    stage.querySelector('.mp-step').setAttribute('d', `M 30 100 H ${chartX(theta)} V 30 H 250`);
    stage.querySelector('.mp-theta-line').setAttribute('x1', chartX(theta));
    stage.querySelector('.mp-theta-line').setAttribute('x2', chartX(theta));
    stage.querySelector('.mp-theta-label').setAttribute('x', chartX(theta));

    let values = presets[0].slice();
    let step = 0;
    let last = { values: values.slice(), sum: 0, out: 0, blocked: false };

    const label = i => inputs[i].dataset.name.replace(/(\d+)$/, '<sub>$1</sub>');

    function render() {
        const sum = values.reduce((acc, v, i) => acc + (kinds[i] === 'exc' ? v : 0), 0);
        const vetoes = values.map((v, i) => (v && kinds[i] === 'inh' ? i : -1)).filter(i => i >= 0);
        const blocked = vetoes.length > 0;
        const out = !blocked && sum >= theta ? 1 : 0;

        inputs.forEach((el, i) => {
            el.classList.toggle('is-on', !!values[i]);
            el.querySelector('.mp-value').textContent = values[i];
        });
        wires.forEach((el, i) => el.classList.toggle('is-on', !!values[i]));
        stage.classList.toggle('is-firing', !!out);
        stage.classList.toggle('is-blocked', blocked);
        stage.classList.toggle('show-threshold', step >= 2);
        stage.classList.toggle('show-chart', step >= 4);

        sumText.textContent = sum;
        ring.style.strokeDasharray = `${Math.min(sum / theta, 1) * 100} 100`;
        dot.style.transform = `translate(${chartX(sum)}px, ${chartY(out)}px)`;

        const excValues = values.filter((v, i) => kinds[i] === 'exc');
        let html = `Σ = ${excValues.join(' + ')} = <b>${sum}</b>`;
        if (step >= 2) html += ` <span class="${sum >= theta ? 'is-ok' : ''}">${sum >= theta ? '≥' : '<'} θ (${theta})</span>`;
        if (blocked) html += ` <span class="is-veto">· ${vetoes.map(label).join(', ')} inibe</span>`;
        html += ` → saída <b class="mp-out">${out}</b>`;
        readout.innerHTML = html;

        // efeitos só nas mudanças: "+1"/"veto!", número pulando, explosão, tremida
        values.forEach((v, i) => { if (v && !last.values[i]) floatTag(i); });
        if (sum !== last.sum) retrigger(sumText, 'pop');
        if (out && !last.out) retrigger(burst, 'burst');
        if (blocked && !last.blocked) retrigger(soma, 'shake');
        last = { values: values.slice(), sum, out, blocked };
    }

    function floatTag(i) {
        const [x, y] = tips[i];
        const tag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tag.setAttribute('class', `mp-float is-${kinds[i]}`);
        tag.setAttribute('x', x);
        tag.setAttribute('y', y);
        tag.textContent = kinds[i] === 'exc' ? '+1' : 'veto!';
        tag.addEventListener('animationend', () => tag.remove());
        svg.append(tag);
    }

    inputs.forEach((el, i) => {
        const toggle = () => {
            values[i] = values[i] ? 0 : 1;
            render();
        };
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle();
        });
    });

    slide.addEventListener('stepchange', e => {
        step = e.detail.step;
        values = (presets[step] || presets[presets.length - 1]).slice();
        render();
    });

    render();
}

/* ==========================================================================
   Perceptron: "retina" de 20×20 fotocélulas lendo cartões em loop
   ========================================================================== */

function setupRetina(retina) {
    const slide = retina.closest('.slide');
    const lamps = Array.from(slide.querySelectorAll('.lamp')); // [esquerda, direita]
    const SIZE = 20;
    const MARK = 6;
    const cells = [];
    let side = 1;
    let lampTimer = null;

    for (let i = 0; i < SIZE * SIZE; i++) {
        const cell = document.createElement('i');
        cell.style.setProperty('--c', i % SIZE);
        retina.append(cell);
        cells.push(cell);
    }

    function showCard() {
        if (!slide.classList.contains('is-active')) return;
        side = 1 - side;
        const top = 3 + Math.floor(Math.random() * (SIZE - MARK - 5));
        const left = side ? 12 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
        cells.forEach((cell, i) => {
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            cell.classList.toggle('is-on', r >= top && r < top + MARK && c >= left && c < left + MARK);
        });
        // a lâmpada da resposta acende depois da "varredura"
        lamps.forEach(l => l.classList.remove('is-lit'));
        clearTimeout(lampTimer);
        lampTimer = setTimeout(() => lamps[side].classList.add('is-lit'), 700);
    }

    setInterval(showCard, 2400);
    slide.addEventListener('stepchange', () => { if (!lamps.some(l => l.classList.contains('is-lit'))) showCard(); });
}

/* ==========================================================================
   Perceptron: estrutura interativa (x → w → Σ → degrau → saída)
   Saída = 1 quando a soma ponderada passa de 0 (função degrau / Heaviside).
   ========================================================================== */

// número no formato brasileiro, com uma casa e sinal de menos tipográfico
const fmtNumber = n => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',').replace(/^-/, '−');

function setupStructure(stage) {
    const slide = stage.closest('.slide');
    const weights = stage.dataset.weights.split(',').map(Number);
    const presets = stage.dataset.presets.split(',').map(p => Array.from(p, Number));
    const inputs = Array.from(stage.querySelectorAll('.pcs-input'));
    const wires = Array.from(stage.querySelectorAll('.pcs-wire'));
    const sumText = stage.querySelector('.pcs-sum');
    const outText = stage.querySelector('.pcs-out');
    const dot = stage.querySelector('.pcs-step-dot');
    const readout = stage.querySelector('.pcs-readout');
    let values = presets[0].slice();
    let step = 0;
    let lastSum = null;

    stage.querySelectorAll('.pcs-weight').forEach((g, i) => {
        g.classList.add(weights[i] >= 0 ? 'is-pos' : 'is-neg');
        g.querySelector('.pcs-wval').textContent = ` = ${fmtNumber(weights[i])}`;
    });

    function render() {
        const sum = values.reduce((acc, v, i) => acc + v * weights[i], 0);
        const out = sum > 0 ? 1 : 0;

        inputs.forEach((el, i) => {
            el.classList.toggle('is-on', !!values[i]);
            el.querySelector('.pcs-value').textContent = values[i];
        });
        wires.forEach((el, i) => {
            el.classList.toggle('is-on', !!values[i]);
            el.classList.toggle('is-pos', step >= 2 && weights[i] >= 0);
            el.classList.toggle('is-neg', step >= 2 && weights[i] < 0);
            // a espessura do fio mostra o tamanho do peso
            el.querySelector('.pcs-wire-line').style.strokeWidth = step >= 2 ? 2 + Math.abs(weights[i]) * 10 : '';
        });
        stage.classList.toggle('show-weights', step >= 2);
        stage.classList.toggle('show-sum', step >= 3);
        stage.classList.toggle('show-step', step >= 4);
        stage.classList.toggle('has-input', values.some(Boolean));
        stage.classList.toggle('is-firing', step >= 4 && out === 1);

        sumText.textContent = step >= 3 ? fmtNumber(sum) : '?';
        outText.textContent = step >= 4 ? out : '?';
        const z = Math.max(-1.5, Math.min(1.5, sum));
        dot.style.transform = `translate(${625 + z * 33}px, ${out ? 164 : 232}px)`;

        const xs = `x = (${values.join(', ')})`;
        let html = xs;
        if (step === 2) html = `${xs} · w = (${weights.map(fmtNumber).join('; ')})`;
        if (step >= 3) {
            const terms = values.map((v, i) => `${v}×${weights[i] < 0 ? `(${fmtNumber(weights[i])})` : fmtNumber(weights[i])}`);
            html = `Σ = ${terms.join(' + ')} = <b>${fmtNumber(sum)}</b>`;
        }
        if (step >= 4) html += ` <span class="${out ? 'is-ok' : 'is-veto'}">${out ? '> 0' : '≤ 0'}</span> → saída <b>${out}</b>`;
        readout.innerHTML = html;

        if (step >= 3 && lastSum !== null && sum !== lastSum) retrigger(sumText, 'pop');
        lastSum = sum;
    }

    inputs.forEach((el, i) => {
        const toggle = () => {
            values[i] = values[i] ? 0 : 1;
            render();
        };
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle();
        });
    });

    slide.addEventListener('stepchange', e => {
        step = e.detail.step;
        values = (presets[step] || presets[presets.length - 1]).slice();
        render();
    });

    render();
}

/* ==========================================================================
   Perceptron: simulação de aprendizado (cartões com marca à esquerda/direita)
   Regra de Rosenblatt: peso novo = peso + erro × entrada (erro = gabarito − resposta).
   Pesos iniciais e ordem dos cartões são fixos: a apresentação é sempre igual.
   ========================================================================== */

function setupLearning(stage) {
    const slide = stage.closest('.slide');
    const COLS = 6;
    const ROWS = 4;
    const LABEL = ['← ESQUERDA', 'DIREITA →'];
    // pesos "aleatórios" de partida (fixos para a demonstração ser previsível)
    const INITIAL = [
        0, 1, 0, -1, 0, -1,
        1, 0, -1, 0, -1, 0,
        0, 1, 0, -1, 0, 0,
        1, 0, 0, 0, -1, 1,
    ];
    // marca 2×2: coluna/linha do canto; y = gabarito (0 esquerda, 1 direita)
    const CARDS = [
        { col: 4, row: 0, y: 1 }, { col: 0, row: 0, y: 0 },
        { col: 4, row: 2, y: 1 }, { col: 0, row: 2, y: 0 },
        { col: 1, row: 1, y: 0 }, { col: 3, row: 1, y: 1 },
        { col: 0, row: 1, y: 0 }, { col: 4, row: 1, y: 1 },
    ];

    const slot = stage.querySelector('.learn-slot');
    const sumEl = stage.querySelector('.learn-sum');
    const guessEl = stage.querySelector('.learn-guess');
    const verdictEl = stage.querySelector('.learn-verdict');
    const truthEl = stage.querySelector('.learn-truth');
    const statusEl = stage.querySelector('.learn-status');
    const dotsEl = stage.querySelector('.learn-dots');
    const makeCells = parent => Array.from({ length: COLS * ROWS }, () => parent.appendChild(document.createElement('i')));
    const cardCells = makeCells(stage.querySelector('.punch-card'));
    const weightCells = makeCells(stage.querySelector('.weight-grid'));

    let w = INITIAL.slice();
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const pixelsOf = card => Array.from({ length: COLS * ROWS }, (_, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        return c >= card.col && c < card.col + 2 && r >= card.row && r < card.row + 2 ? 1 : 0;
    });
    const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

    function renderWeights(flash = []) {
        weightCells.forEach((cell, i) => {
            cell.textContent = signed(w[i]);
            cell.style.setProperty('--a', Math.min(Math.abs(w[i]) / 2, 1));
            cell.classList.toggle('is-pos', w[i] > 0);
            cell.classList.toggle('is-neg', w[i] < 0);
            if (flash.includes(i)) retrigger(cell, 'flash');
        });
    }

    function reset() {
        stop();
        w = INITIAL.slice();
        dotsEl.innerHTML = '';
        stage.classList.remove('show-card', 'is-right', 'is-wrong', 'is-done', 'show-formula');
        sumEl.textContent = 'Σ = ?';
        guessEl.textContent = '—';
        verdictEl.textContent = '';
        truthEl.textContent = 'Gabarito: —';
        renderWeights();
    }

    function present(card, animate) {
        const px = pixelsOf(card);
        cardCells.forEach((cell, i) => cell.classList.toggle('is-on', !!px[i]));
        stage.classList.add('show-card');
        stage.classList.remove('is-right', 'is-wrong');
        sumEl.textContent = 'Σ = ?';
        guessEl.textContent = '—';
        verdictEl.textContent = '';
        truthEl.textContent = 'Gabarito: —';
        if (animate) retrigger(slot, 'enter');
        statusEl.textContent = 'O operador mostra um cartão.';
    }

    function predict(card) {
        const px = pixelsOf(card);
        const sum = px.reduce((acc, v, i) => acc + v * w[i], 0);
        const guess = sum > 0 ? 1 : 0;
        const ok = guess === card.y;
        sumEl.textContent = `Σ = ${signed(sum)}`;
        guessEl.textContent = LABEL[guess];
        verdictEl.textContent = ok ? '✓' : '✗';
        truthEl.textContent = `Gabarito: ${LABEL[card.y]}`;
        stage.classList.toggle('is-right', ok);
        stage.classList.toggle('is-wrong', !ok);
        dotsEl.insertAdjacentHTML('beforeend', `<i class="${ok ? 'is-ok' : 'is-bad'}"></i>`);
        statusEl.textContent = ok ? 'Acertou! Os pesos ficam como estão.' : 'Errou… hora da correção.';
        return { px, guess, ok };
    }

    function correct(card, result, animate) {
        const err = card.y - result.guess;
        const flash = [];
        result.px.forEach((v, i) => {
            if (!v) return;
            w[i] += err;
            flash.push(i);
        });
        renderWeights(animate ? flash : []);
        statusEl.textContent = `Correção: erro = ${signed(err)}, então cada pixel marcado ganha ${signed(err)} no peso.`;
    }

    function autoTrain() {
        let k = 1;
        let epochErrors = 1; // o primeiro cartão (etapas 1–3) foi um erro
        const next = () => {
            if (!slide.classList.contains('is-active')) return stop();
            const card = CARDS[k % CARDS.length];
            const pace = k >= CARDS.length ? 480 : 900; // a 2ª rodada passa mais rápido
            present(card, true);
            later(pace * .35, () => {
                const result = predict(card);
                if (!result.ok) {
                    epochErrors++;
                    later(pace * .3, () => correct(card, result, true));
                }
                later(pace, () => {
                    k++;
                    if (k % CARDS.length === 0) {
                        if (epochErrors === 0) return finish();
                        epochErrors = 0;
                    }
                    next();
                });
            });
        };
        later(500, next);
    }

    function finish() {
        stage.classList.add('is-done');
        statusEl.textContent = `Aprendeu! Acertou os ${CARDS.length} cartões sem nenhuma correção.`;
        const colors = ['#8A2BE2', '#e0388f', '#3ddc84', '#a768f0', '#ffd98a'];
        for (let i = 0; i < 30; i++) {
            const piece = document.createElement('i');
            piece.className = 'confetti';
            const angle = Math.random() * Math.PI * 2;
            const dist = 120 + Math.random() * 260;
            piece.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
            piece.style.setProperty('--y', `${Math.sin(angle) * dist - 80}px`);
            piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
            piece.style.setProperty('--c', colors[i % colors.length]);
            piece.addEventListener('animationend', () => piece.remove());
            stage.append(piece);
        }
    }

    // cada etapa reconstrói o estado do zero (só a ação da etapa atual é animada)
    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        reset();
        statusEl.textContent = 'Os pesos começam aleatórios.';
        if (step >= 1) present(CARDS[0], step === 1);
        let result;
        if (step >= 2) result = predict(CARDS[0]);
        if (step >= 3) {
            stage.classList.add('show-formula');
            if (!result.ok) correct(CARDS[0], result, step === 3);
        }
        if (step >= 4) autoTrain();
    });

    reset();
    statusEl.textContent = 'Os pesos começam aleatórios.';
}

/* ==========================================================================
   Perceptron: limitação (E × XOR). Uma reta só: a do E funciona; no XOR a
   reta "procura" posições e sempre erra pelo menos um ponto.
   ========================================================================== */

function setupLimit(stage) {
    const slide = stage.closest('.slide');
    const sep = stage.querySelector('.sep');
    const statusEl = stage.querySelector('.limit-status');
    const points = Array.from(stage.querySelectorAll('.pt'), el => ({
        el,
        x: Number(el.dataset.x),
        y: Number(el.dataset.y),
        xor: Number(el.dataset.xor),
    }));
    // retas (ponto por onde passam + ângulo); lado rosa = responde 1
    const AND_LINE = { x: 320, y: 150, a: 225 };
    const ATTEMPTS = [
        AND_LINE,
        { x: 260, y: 210, a: 270 },
        { x: 260, y: 210, a: 0 },
        { x: 200, y: 270, a: 225 },
        { x: 275, y: 210, a: 315 },
        { x: 320, y: 150, a: 45 },
    ];
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const place = line => {
        sep.style.transform = `translate(${line.x}px, ${line.y}px) rotate(${line.a}deg)`;
    };
    const clearWrong = () => points.forEach(p => p.el.classList.remove('is-wrong'));

    // pontos do lado errado da reta para o XOR
    function wrongFor(line) {
        const rad = (line.a * Math.PI) / 180;
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        return points.filter(p => ((p.x - line.x) * nx + (p.y - line.y) * ny > 0 ? 1 : 0) !== p.xor);
    }

    function search() {
        let tries = 0;
        const next = () => {
            if (!slide.classList.contains('is-active')) return stop();
            const line = ATTEMPTS[tries % ATTEMPTS.length];
            clearWrong();
            place(line);
            tries++;
            later(850, () => {
                const wrong = wrongFor(line);
                wrong.forEach(p => p.el.classList.add('is-wrong'));
                statusEl.innerHTML = `Tentativa ${tries}: <span class="is-veto">${wrong.length} ${wrong.length === 1 ? 'erro' : 'erros'}</span>`;
                if (tries === ATTEMPTS.length) stage.classList.add('show-stamp');
                later(900, next);
            });
        };
        next();
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        clearWrong();
        stage.classList.remove('show-stamp');
        if (step === 0) statusEl.textContent = 'Quatro combinações de entrada, duas classes.';
        if (step === 1) {
            // a reta "desliza" até a posição que separa o E
            sep.classList.add('no-anim');
            place({ x: 260, y: 210, a: 180 });
            void sep.getBoundingClientRect();
            sep.classList.remove('no-anim');
            place(AND_LINE);
            statusEl.textContent = 'Uma reta separa o 1 dos 0: ele aprende.';
        }
        if (step === 2) search();
        if (step >= 3) statusEl.textContent = 'Duas retas resolvem, mas isso exige mais de uma camada.';
    });
}

/* ==========================================================================
   Perceptron multicamadas: rede 2-2-1 que resolve o XOR (conta de verdade)
   h1 = "OU" (reta x1 + x2 = 0,5) · h2 = "NÃO-E" (reta x1 + x2 = 1,5) ·
   y = "E" das duas → 1 só na faixa entre as retas. Etapas 1–3 usam o
   degrau; a etapa 4 usa a sigmóide com os mesmos pesos.
   ========================================================================== */

function setupMLP(stage) {
    const slide = stage.closest('.slide');
    const HIDDEN = [
        { w: [6, 6], b: -3 },
        { w: [-6, -6], b: 9 },
    ];
    const OUT = { w: [6, 6], b: -9 };
    const COMBOS = [[0, 0], [0, 1], [1, 0], [1, 1]];
    const NOTES = [
        'Uma camada só não resolvia. E com mais camadas?',
        'A camada de entrada só recebe os dados e repassa.',
        'Cada neurônio oculto traça a sua própria reta.',
        'A saída combina as duas retas: 1 só na faixa entre elas.',
        'Em vez de pular de 0 para 1, a saída sobe suavemente.',
    ];
    const ins = Array.from(stage.querySelectorAll('.mlp-in'));
    const hids = Array.from(stage.querySelectorAll('.mlp-hid'));
    const out = stage.querySelector('.mlp-out');
    const wiresIn = Array.from(stage.querySelectorAll('.mlp-wire-in'));
    const wiresOut = Array.from(stage.querySelectorAll('.mlp-wire-out'));
    const points = Array.from(stage.querySelectorAll('.mlp-pt'));
    const dot = stage.querySelector('.mlp-chart-dot');
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    let step = 0;
    let combo = 0;
    let timer = null;

    // gráfico: z de −6 a 6 em x 570–840; σ de 0 a 1 em y 320–90
    const chartX = z => 705 + z * 22.5;
    const chartY = s => 320 - s * 230;
    const sigmoid = z => 1 / (1 + Math.exp(-z));
    const curve = [];
    for (let z = -6; z <= 6.001; z += .25) curve.push(`${chartX(z).toFixed(1)} ${chartY(sigmoid(z)).toFixed(1)}`);
    stage.querySelector('.mlp-chart-sig').setAttribute('d', `M ${curve.join(' L ')}`);

    const fmt2 = n => n.toFixed(2).replace('.', ',').replace(/^-/, '−');
    const sub = n => `<sub>${n}</sub>`;

    function compute(x, smooth) {
        const act = z => (smooth ? sigmoid(z) : z > 0 ? 1 : 0);
        const h = HIDDEN.map(n => act(n.w[0] * x[0] + n.w[1] * x[1] + n.b));
        const z = OUT.w[0] * h[0] + OUT.w[1] * h[1] + OUT.b;
        return { h, z, y: act(z) };
    }

    function render() {
        const smooth = step >= 4;
        const x = COMBOS[combo];
        const { h, z, y } = compute(x, smooth);
        const show = v => (smooth ? fmt2(v) : String(v));

        stage.classList.toggle('show-in', step >= 1);
        stage.classList.toggle('show-hid', step >= 2);
        stage.classList.toggle('show-out', step >= 3);
        stage.classList.toggle('show-sig', step >= 4);

        ins.forEach((el, i) => {
            el.classList.toggle('is-on', step >= 1 && x[i] === 1);
            el.querySelector('.mlp-val').textContent = step >= 1 ? x[i] : '?';
        });
        hids.forEach((el, i) => {
            el.classList.toggle('is-on', step >= 2 && h[i] > .5);
            el.querySelector('.mlp-val').textContent = step >= 2 ? show(h[i]) : '?';
        });
        out.classList.toggle('is-on', step >= 3 && y > .5);
        out.querySelector('.mlp-val').textContent = step >= 3 ? show(y) : '?';

        wiresIn.forEach(el => el.classList.toggle('is-on', step >= 2 && x[el.dataset.from] === 1));
        wiresOut.forEach(el => el.classList.toggle('is-on', step >= 3 && h[el.dataset.from] > .5));
        points.forEach((el, i) => el.classList.toggle('is-current', step >= 1 && i === combo));
        dot.style.transform = `translate(${chartX(z)}px, ${chartY(sigmoid(z))}px)`;

        const xs = `x = (${x.join(', ')})`;
        let html = 'Lembra do XOR? Nenhuma reta separava os pontos.';
        if (step === 1) html = `${xs}`;
        if (step === 2) html = `${xs} → h${sub(1)} = <b>${h[0]}</b> · h${sub(2)} = <b>${h[1]}</b>`;
        if (step === 3) html = `XOR(${x.join(', ')}) → y = <b>${y}</b> <span class="is-ok">✓</span>`;
        if (step >= 4) html = `y = σ(${fmt2(z)}) = <b>${fmt2(y)}</b> <span class="is-ok">✓</span>`;
        readout.innerHTML = html;
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
    }

    // as 4 combinações passam pela rede, uma de cada vez
    function cycle() {
        clearTimeout(timer);
        if (!slide.classList.contains('is-active') || step === 0) return;
        timer = setTimeout(() => {
            combo = (combo + 1) % COMBOS.length;
            render();
            cycle();
        }, 1900);
    }

    slide.addEventListener('stepchange', e => {
        step = e.detail.step;
        if (step === 0) combo = 0;
        render();
        cycle();
    });

    render();
}

/* ==========================================================================
   Backpropagation: rede 2-2-1 com sigmóide aprendendo 1 exemplo
   (x = (1, 1), esperado 1). Gradiente descendente de verdade:
   culpa da saída δ = erro · y(1 − y); culpa de cada oculto δh = δ · w · h(1 − h);
   peso novo = peso + taxa · δ · entrada. Etapa 3: 20 rodadas de ida e volta.
   ========================================================================== */

function setupBackprop(stage) {
    const slide = stage.closest('.slide');
    const X = [1, 1];
    const TARGET = 1;
    const RATE = 4;
    const ROUNDS = 20;
    // ordem dos pesos = data-w dos fios: x1→h1, x2→h1, x1→h2, x2→h2, h1→y, h2→y
    const START = [0.8, 0.6, -0.5, 0.9, -1.2, -0.8];
    const NOTES = [
        'Os pesos começam quase aleatórios. Como saber qual corrigir?',
        'Ida: cada camada calcula e passa adiante, até o palpite final.',
        'Volta: quanto mais grosso o fio, maior a culpa daquele peso.',
        'Ida e volta se repetem milhares de vezes, com milhares de exemplos.',
    ];
    const ins = Array.from(stage.querySelectorAll('.bp-in .bp-val'));
    const hids = Array.from(stage.querySelectorAll('.bp-hid .bp-val'));
    const outVal = stage.querySelector('.bp-out .bp-val');
    const wires = Array.from(stage.querySelectorAll('.bp-wire'));
    const lines = wires.map(w => w.querySelector('.bp-wire-line'));
    const pills = Array.from(stage.querySelectorAll('.bp-pill'));
    const errorEl = stage.querySelector('.bp-error');
    const errorBox = stage.querySelector('.bp-error-box');
    const bar = stage.querySelector('.bp-bar i');
    const spark = stage.querySelector('.bp-spark-line');
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    const sigmoid = z => 1 / (1 + Math.exp(-z));
    const fmt2 = n => n.toFixed(2).replace('.', ',').replace(/^-/, '−');
    let w = START.slice();
    let history = [];
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const setClass = (name, on) => stage.classList.toggle(name, on);

    function forward() {
        const h = [sigmoid(w[0] * X[0] + w[1] * X[1]), sigmoid(w[2] * X[0] + w[3] * X[1])];
        const y = sigmoid(w[4] * h[0] + w[5] * h[1]);
        return { h, y, err: TARGET - y };
    }

    // gradientes (a "culpa" de cada peso), na mesma ordem dos pesos
    function blame({ h, y, err }) {
        const d = err * y * (1 - y);
        const dh = [d * w[4] * h[0] * (1 - h[0]), d * w[5] * h[1] * (1 - h[1])];
        return [dh[0] * X[0], dh[0] * X[1], dh[1] * X[0], dh[1] * X[1], d * h[0], d * h[1]];
    }

    function drawWeights() {
        pills.forEach((p, i) => {
            p.classList.toggle('is-pos', w[i] >= 0);
            p.classList.toggle('is-neg', w[i] < 0);
            p.querySelector('text').textContent = fmtNumber(w[i]);
        });
        wires.forEach((el, i) => {
            el.classList.toggle('is-pos', w[i] >= 0);
            el.classList.toggle('is-neg', w[i] < 0);
        });
    }

    function drawValues(r, upTo) {
        setClass('show-in', upTo >= 1);
        setClass('show-hid', upTo >= 2);
        setClass('show-out', upTo >= 3);
        ins.forEach((el, i) => (el.textContent = upTo >= 1 ? X[i] : '?'));
        hids.forEach((el, i) => (el.textContent = upTo >= 2 ? fmt2(r.h[i]) : '?'));
        outVal.textContent = upTo >= 3 ? fmt2(r.y) : '?';
        errorEl.textContent = upTo >= 4 ? fmt2(r.err) : '?';
        bar.style.width = upTo >= 4 ? `${Math.abs(r.err) * 100}%` : '0';
        errorBox.classList.toggle('is-low', upTo >= 4 && Math.abs(r.err) < .15);
    }

    function drawHistory() {
        const pts = history.map((e, i) => `${((i / (ROUNDS - 1)) * 240).toFixed(1)} ${(78 - e * 90).toFixed(1)}`);
        spark.setAttribute('d', pts.length ? `M ${pts.join(' L ')}` : '');
    }

    function thick(g) {
        lines.forEach((el, i) => (el.style.strokeWidth = g ? 2 + Math.min(14, Math.abs(g[i]) * RATE * 25) : ''));
    }

    // ida: os valores aparecem camada por camada
    function runForward(speed, done) {
        const r = forward();
        setClass('is-back', false);
        setClass('is-fwd', true);
        thick(null);
        drawValues(r, 1);
        later(400 * speed, () => drawValues(r, 2));
        later(800 * speed, () => drawValues(r, 3));
        later(1100 * speed, () => {
            drawValues(r, 4);
            readout.innerHTML = `saída <b>${fmt2(r.y)}</b> · esperado <b>${TARGET}</b> → erro = <b>${fmt2(r.err)}</b>`;
        });
        later(1400 * speed, () => {
            setClass('is-fwd', false);
            if (done) done(r);
        });
    }

    // volta: mostra a culpa (espessura) e ajusta os pesos
    function runBackward(r, speed, done) {
        const g = blame(r);
        setClass('is-back', true);
        thick(g);
        later(1000 * speed, () => {
            w = w.map((v, i) => v + RATE * g[i]);
            drawWeights();
            pills.forEach(p => retrigger(p.querySelector('.bp-pill-in'), 'bump'));
            const next = forward();
            readout.innerHTML = `Pesos ajustados → na próxima ida, a saída sobe de ${fmt2(r.y)} para <b>${fmt2(next.y)}</b>`;
        });
        later(1600 * speed, () => {
            setClass('is-back', false);
            thick(null);
            if (done) done();
        });
    }

    function train() {
        if (!slide.classList.contains('is-active')) return stop();
        if (history.length >= ROUNDS) {
            const r = forward();
            drawValues(r, 4);
            readout.innerHTML = `Depois de ${ROUNDS} rodadas: saída <b>${fmt2(r.y)}</b> · erro <b>${fmt2(r.err)}</b> <span class="is-ok">✓</span>`;
            return;
        }
        const speed = history.length < 3 ? 1 : .3;
        runForward(speed, r => {
            history.push(r.err);
            drawHistory();
            runBackward(r, speed, () => {
                readout.innerHTML = `Rodada ${history.length} de ${ROUNDS} · erro <b>${fmt2(history[history.length - 1])}</b>`;
                train();
            });
        });
    }

    function reset() {
        stop();
        w = START.slice();
        history = [];
        ['is-fwd', 'is-back', 'show-hist'].forEach(c => setClass(c, false));
        thick(null);
        drawWeights();
        drawHistory();
        drawValues(forward(), 0);
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        reset();
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        if (step === 0) readout.innerHTML = 'Exemplo: x = (1, 1) · a resposta certa é <b>1</b>';
        if (step === 1) runForward(1.4);
        if (step === 2) {
            // já chega com a ida feita; a volta começa logo
            const r = forward();
            drawValues(r, 4);
            readout.innerHTML = `erro = <b>${fmt2(r.err)}</b> → mandando o erro de volta…`;
            later(500, () => runBackward(r, 1.4));
        }
        if (step >= 3) {
            setClass('show-hist', true);
            train();
        }
    });

    reset();
}

/* ==========================================================================
   Segundo inverno: a CPU "come" a fila de contas 4 por vez (bem devagar)
   e, na etapa 2, a contagem do ImageNet sobe até 14 milhões.
   ========================================================================== */

function setupWinter2(stage) {
    const slide = stage.closest('.slide');
    const TOTAL = 1000000;
    const BIG = 14000000;
    const queue = stage.querySelector('.w2-queue');
    const cores = Array.from(stage.querySelectorAll('.w2-cpu-cores i'));
    const countEl = stage.querySelector('.w2-count b');
    const pctEl = stage.querySelector('.w2-pct');
    const bar = stage.querySelector('.w2-progress i');
    const big = stage.querySelector('.w2-big');
    const fmtInt = n => Math.round(n).toLocaleString('pt-BR');
    let cpuTimer = null;
    let countRaf = null;
    let done = 0;
    let tick = 0;

    for (let i = 0; i < 72; i++) queue.append(document.createElement('i'));
    const dots = Array.from(queue.children);
    stage.querySelector('.w2-gpu-cores').append(...Array.from({ length: 72 }, () => document.createElement('i')));

    function drawCount() {
        countEl.textContent = fmtInt(done);
        pctEl.textContent = `${(done / TOTAL * 100).toFixed(2).replace('.', ',')}%`;
        bar.style.width = `${done / TOTAL * 100}%`;
    }

    // a cada batida, os 4 núcleos fazem 4 contas e 4 bolinhas saem da fila
    function runCpu() {
        clearInterval(cpuTimer);
        cpuTimer = setInterval(() => {
            if (!slide.classList.contains('is-active')) return clearInterval(cpuTimer);
            const start = (tick * 4) % dots.length;
            if (start === 0) dots.forEach(d => d.classList.remove('is-done'));
            cores.forEach((c, i) => {
                c.classList.add('is-busy');
                dots[start + i].classList.add('is-done');
                setTimeout(() => c.classList.remove('is-busy'), 140);
            });
            tick++;
            done += 4;
            drawCount();
        }, 260);
    }

    function countUp() {
        cancelAnimationFrame(countRaf);
        const t0 = performance.now() + 600;
        const frame = now => {
            const t = Math.max(0, Math.min(1, (now - t0) / 1600));
            big.textContent = fmtInt(BIG * (1 - Math.pow(1 - t, 3)));
            if (t < 1) countRaf = requestAnimationFrame(frame);
        };
        countRaf = requestAnimationFrame(frame);
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stage.classList.toggle('show-hw', step >= 1);
        stage.classList.toggle('show-data', step >= 2);
        if (step >= 1) runCpu();
        else {
            clearInterval(cpuTimer);
            done = 0;
            tick = 0;
            dots.forEach(d => d.classList.remove('is-done'));
            drawCount();
        }
        if (step >= 2) countUp();
        else {
            cancelAnimationFrame(countRaf);
            big.textContent = '0';
        }
    });

    drawCount();
}

/* ==========================================================================
   CNN: convolução, ReLU e max pooling de verdade sobre um "7" (8×8).
   Filtro de borda vertical: cada valor = coluna da direita − coluna da esquerda.
   ========================================================================== */

function setupCNN(stage) {
    const slide = stage.closest('.slide');
    const IMAGE = ['00000000', '01111110', '00000110', '00001100', '00011000', '00011000', '00110000', '00000000']
        .map(row => Array.from(row, Number));
    const FILTER = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];
    const NOTES = [
        'Para o computador, uma imagem é só uma grade de números.',
        'O MLP olha tudo de uma vez; a CNN olha por pedaços.',
        'O filtro procura bordas verticais: rosa de um lado do traço, azul do outro.',
        'A ativação deixa passar só o que o filtro encontrou.',
        'A imagem encolhe, mas o desenho do traço continua lá.',
    ];
    const MAX = 3;
    const fmtInt = n => String(n).replace('-', '−');

    const conv = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => {
        let s = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += IMAGE[r + i][c + j] * FILTER[i][j];
        return s;
    }));
    const relu = conv.map(row => row.map(v => Math.max(0, v)));
    const pool = Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) =>
        Math.max(relu[2 * r][2 * c], relu[2 * r][2 * c + 1], relu[2 * r + 1][2 * c], relu[2 * r + 1][2 * c + 1])));
    const negatives = conv.flat().filter(v => v < 0).length;

    const make = (grid, n) => Array.from({ length: n }, () => grid.appendChild(document.createElement('b')));
    const imgCells = make(stage.querySelector('.cnn-img'), 64);
    const convCells = make(stage.querySelector('.cnn-conv'), 36);
    const reluCells = make(stage.querySelector('.cnn-relu'), 36);
    const poolCells = make(stage.querySelector('.cnn-pool'), 9);
    const filterCells = make(stage.querySelector('.cnn-filter'), 9);
    const win = stage.querySelector('.cnn-win');
    const poolWin = stage.querySelector('.cnn-win-pool');
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };

    imgCells.forEach((el, i) => el.classList.toggle('is-ink', IMAGE[Math.floor(i / 8)][i % 8] === 1));
    FILTER.flat().forEach((v, i) => {
        filterCells[i].textContent = fmtInt(v);
        filterCells[i].className = v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : 'is-zero';
    });

    // MLP × CNN: 12 "pixels" em fila, todos ligados a um neurônio
    const mlpArt = stage.querySelector('.cnn-cmp-mlp');
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 12; i++) {
        const y = 6 + i * 9.4;
        const line = document.createElementNS(ns, 'line');
        Object.entries({ x1: 34, y1: y + 3, x2: 160, y2: 60 }).forEach(([k, v]) => line.setAttribute(k, v));
        const rect = document.createElementNS(ns, 'rect');
        Object.entries({ x: 24, y, width: 8, height: 6, rx: 1.5 }).forEach(([k, v]) => rect.setAttribute(k, v));
        mlpArt.append(line, rect);
    }
    const neuron = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 170, cy: 60, r: 13 }).forEach(([k, v]) => neuron.setAttribute(k, v));
    mlpArt.append(neuron);

    function paint(el, v) {
        el.textContent = fmtInt(v);
        el.className = v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : 'is-zero';
        el.style.setProperty('--v', Math.abs(v) / MAX);
    }

    const clear = cells => cells.forEach(el => {
        el.className = '';
        el.textContent = '';
    });

    const moveWin = (el, x, y) => {
        el.style.setProperty('--x', x);
        el.style.setProperty('--y', y);
    };

    // o filtro passa pelas 36 posições, preenchendo o mapa de convolução
    function runConv() {
        clear(convCells);
        win.classList.add('is-on');
        for (let k = 0; k < 36; k++) {
            later(300 + k * 140, () => {
                const r = Math.floor(k / 6);
                const c = k % 6;
                moveWin(win, c, r);
                convCells.forEach(el => el.classList.remove('is-current'));
                paint(convCells[k], conv[r][c]);
                convCells[k].classList.add('is-current');
                readout.innerHTML = `Filtro na linha ${r + 1}, coluna ${c + 1} → Σ (pixels × pesos) = <b>${fmtInt(conv[r][c])}</b>`;
            });
        }
        later(300 + 36 * 140, () => {
            win.classList.remove('is-on');
            convCells.forEach(el => el.classList.remove('is-current'));
            readout.innerHTML = `Mapa de características: <b>36</b> valores · rosa e azul = onde o filtro achou bordas`;
        });
    }

    function runRelu() {
        conv.flat().forEach((v, i) => {
            paint(reluCells[i], v);
            later(400, () => {
                paint(reluCells[i], Math.max(0, v));
                if (v < 0) retrigger(reluCells[i], 'is-killed');
            });
        });
        readout.innerHTML = `ReLU: negativo vira 0, positivo continua → <b>${negatives}</b> valores zerados`;
    }

    function runPool() {
        clear(poolCells);
        poolWin.classList.add('is-on');
        for (let k = 0; k < 9; k++) {
            later(300 + k * 450, () => {
                const r = Math.floor(k / 3);
                const c = k % 3;
                moveWin(poolWin, c * 2, r * 2);
                poolCells.forEach(el => el.classList.remove('is-current'));
                paint(poolCells[k], pool[r][c]);
                poolCells[k].classList.add('is-current');
                const block = [relu[2 * r][2 * c], relu[2 * r][2 * c + 1], relu[2 * r + 1][2 * c], relu[2 * r + 1][2 * c + 1]];
                readout.innerHTML = `máx(${block.join(', ')}) = <b>${pool[r][c]}</b>`;
            });
        }
        later(300 + 9 * 450, () => {
            poolWin.classList.remove('is-on');
            poolCells.forEach(el => el.classList.remove('is-current'));
            readout.innerHTML = `Max pooling 2×2: de <b>36</b> para <b>9</b> valores, guardando o maior de cada bloco`;
        });
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.classList.toggle('show-cmp', step === 1);
        stage.classList.toggle('show-conv', step >= 2);
        stage.classList.toggle('show-relu', step >= 3);
        stage.classList.toggle('show-pool', step >= 4);
        win.classList.remove('is-on');
        poolWin.classList.remove('is-on');
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];

        // as camadas já explicadas aparecem prontas; a da etapa atual anima
        if (step > 2) conv.flat().forEach((v, i) => paint(convCells[i], v));
        else clear(convCells);
        if (step > 3) relu.flat().forEach((v, i) => paint(reluCells[i], v));
        else clear(reluCells);
        clear(poolCells);

        if (step <= 1) readout.innerHTML = 'Imagem 8 × 8 = <b>64</b> pixels · branco = 1, preto = 0';
        if (step === 2) runConv();
        if (step === 3) runRelu();
        if (step >= 4) runPool();
    });
}

/* ==========================================================================
   RNN: lê uma palavra por vez e a memória de cada palavra antiga cai
   para FADE (72%) a cada nova palavra — simulação simplificada da
   memória curta. "Brasil" fica 11 palavras para trás: 0,72¹¹ ≈ 3%.
   ========================================================================== */

const RNN_SENTENCE = ['Eu', 'cresci', 'no', 'Brasil', 'e', 'depois', 'morei', 'muitos', 'anos', 'fora,', 'mas', 'até', 'hoje', 'eu', 'falo', '___'];
const RNN_KEY = 3;

function setupRNN(stage) {
    const slide = stage.closest('.slide');
    const FADE = .72;
    const NOTES = [
        'Texto, áudio e números no tempo: tudo isso é sequência.',
        'A seta que volta para a própria célula é a memória.',
        'Sempre que a ordem importa, entra uma rede recorrente.',
        'A cada palavra nova, a lembrança das antigas fica mais fraca.',
    ];
    const lane = stage.querySelector('.rnn-lane-rnn');
    const laneTokens = Array.from(lane.querySelectorAll('.rnn-tokens span'));
    const laneMem = Array.from(lane.querySelectorAll('.rnn-mem i'));
    const cell = lane.querySelector('.rnn-cell');
    const sentence = stage.querySelector('.rnn-sentence');
    const memLong = stage.querySelector('.rnn-mem-long');
    const recallBar = stage.querySelector('.rnn-recall-bar i');
    const recallPct = stage.querySelector('.rnn-recall-pct');
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };

    const words = RNN_SENTENCE.map((w, i) => {
        const el = document.createElement('span');
        el.textContent = w;
        if (i === RNN_KEY) el.classList.add('is-key');
        if (w === '___') el.classList.add('is-blank');
        sentence.append(el);
        return el;
    });
    const segs = RNN_SENTENCE.map((_, i) => {
        const el = document.createElement('i');
        if (i === RNN_KEY) el.classList.add('is-key');
        memLong.append(el);
        return el;
    });

    // vista 1: a RNN lê as 5 palavras, uma de cada vez, e recomeça
    function playLane() {
        laneTokens.forEach(t => t.classList.remove('is-reading', 'is-read'));
        laneMem.forEach(m => (m.style.opacity = 0));
        laneTokens.forEach((t, k) => {
            later(400 + k * 600, () => {
                laneTokens.forEach((o, j) => {
                    o.classList.toggle('is-reading', j === k);
                    o.classList.toggle('is-read', j < k);
                });
                laneMem.forEach((m, j) => (m.style.opacity = j <= k ? Math.pow(FADE, k - j) : 0));
                retrigger(cell, 'is-pulse');
                readout.innerHTML = `RNN leu <b>“${t.textContent}”</b> · memória: ${laneTokens.slice(0, k + 1).map(o => o.textContent).join(' ')}`;
            });
        });
        later(400 + laneTokens.length * 600 + 1200, () => {
            if (slide.classList.contains('is-active')) playLane();
        });
    }

    function drawMem(k) {
        segs.forEach((s, j) => s.style.setProperty('--a', j <= k && j < RNN_SENTENCE.length - 1 ? Math.max(.04, Math.pow(FADE, k - j)) : 0));
        const recall = k >= RNN_KEY ? Math.pow(FADE, k - RNN_KEY) : 0;
        recallBar.style.width = `${recall * 100}%`;
        recallPct.textContent = k >= RNN_KEY ? `${Math.round(recall * 100)}%` : '—';
        recallPct.style.color = k >= RNN_KEY && recall < .2 ? 'var(--signal-inh)' : '';
        return recall;
    }

    // vista 3: a frase longa e a lembrança do "Brasil" apagando
    function playMemory() {
        words.forEach(w => w.classList.remove('is-reading', 'is-fail'));
        words[words.length - 1].textContent = '___';
        drawMem(-1);
        const last = RNN_SENTENCE.length - 2;
        for (let k = 0; k <= last; k++) {
            later(300 + k * 450, () => {
                words.forEach((w, j) => w.classList.toggle('is-reading', j === k));
                const recall = drawMem(k);
                readout.innerHTML = k < RNN_KEY ? `Lendo <b>“${RNN_SENTENCE[k]}”</b>…` : `Lendo <b>“${RNN_SENTENCE[k]}”</b> · lembrança de “Brasil”: <b>${Math.round(recall * 100)}%</b>`;
            });
        }
        later(300 + (last + 1) * 450 + 300, () => {
            const blank = words[words.length - 1];
            words.forEach(w => w.classList.remove('is-reading'));
            blank.textContent = '???';
            blank.classList.add('is-fail');
            readout.innerHTML = `Na hora de completar, o “Brasil” já tinha sumido (<b>3%</b>): a RNN não sabe a língua <span class="is-veto">✗</span>`;
        });
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.classList.toggle('view-read', step <= 1);
        stage.classList.toggle('view-uses', step === 2);
        stage.classList.toggle('view-mem', step >= 3);
        stage.classList.toggle('is-playing', step === 1);
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        laneTokens.forEach(t => t.classList.remove('is-reading', 'is-read'));
        laneMem.forEach(m => (m.style.opacity = 0));

        if (step === 0) readout.innerHTML = 'Uma frase é uma <b>sequência</b>: a ordem das palavras muda o sentido.';
        if (step === 1) playLane();
        if (step === 2) readout.innerHTML = 'Texto, números ao longo do tempo e som: dados em <b>sequência</b>.';
        if (step >= 3) playMemory();
    });
}

/* ==========================================================================
   LSTM e GRU: a mesma frase do slide da RNN. Os portões guardam "Brasil"
   na memória de longo prazo e quase não o apagam (simulação simplificada:
   por palavra, a lembrança fica em 72% na RNN, 99% na LSTM e 98% na GRU).
   ========================================================================== */

function setupGates(stage) {
    const slide = stage.closest('.slide');
    const KEEP = { rnn: .72, lstm: .99, gru: .98 };
    const LAST = RNN_SENTENCE.length - 2; // índice de "falo"
    const sentence = stage.querySelector('.rnn-sentence');
    const item = stage.querySelector('.lg-item');
    const name = stage.querySelector('.lg-name');
    const count = stage.querySelector('.lg-count');
    const gates = {
        lstm: Array.from(stage.querySelectorAll('.lg-gates-lstm .lg-gate')),
        gru: Array.from(stage.querySelectorAll('.lg-gates-gru .lg-gate')),
    };
    const lines = {
        rnn: stage.querySelector('.lg-line-rnn'),
        lstm: stage.querySelector('.lg-line-lstm'),
        gru: stage.querySelector('.lg-line-gru'),
    };
    const readout = stage.querySelector('.mlp-readout');
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };

    const words = RNN_SENTENCE.map((w, i) => {
        const el = document.createElement('span');
        el.textContent = w;
        if (i === RNN_KEY) el.classList.add('is-key');
        if (w === '___') el.classList.add('is-blank');
        sentence.append(el);
        return el;
    });

    const recall = (model, k) => (k < RNN_KEY ? 0 : Math.pow(KEEP[model], k - RNN_KEY));
    const pct = (model, k) => `${Math.round(recall(model, k) * 100)}%`;

    function drawLine(model, upTo) {
        const pts = [];
        for (let k = 0; k <= upTo; k++) pts.push(`${(40 + k * (540 / LAST)).toFixed(1)} ${(124 - recall(model, k) * 110).toFixed(1)}`);
        lines[model].setAttribute('d', pts.length ? `M ${pts.join(' L ')}` : '');
    }

    // estado dos portões para cada palavra: [aberto?, texto]
    function gateStates(model, k) {
        if (model === 'lstm') {
            return [
                [false, 'mantém'],
                k === RNN_KEY ? [true, 'guarda!'] : [false, 'ignora'],
                k === LAST ? [true, 'usa!'] : [false, '—'],
            ];
        }
        return [
            k === RNN_KEY ? [true, 'troca!'] : [false, 'mantém'],
            [false, 'usa o passado'],
        ];
    }

    function setGates(model, k) {
        gates[model].forEach((g, i) => {
            const [on, text] = k < 0 ? [false, gateStates(model, -1)[i][1]] : gateStates(model, k)[i];
            g.classList.toggle('is-on', on);
            g.querySelector('span').textContent = text;
        });
    }

    function play(model) {
        const blank = words[words.length - 1];
        words.forEach(w => w.classList.remove('is-reading', 'is-ok', 'is-fail'));
        blank.textContent = '___';
        item.classList.remove('is-stored');
        setGates(model, -1);
        for (let k = 0; k <= LAST; k++) {
            later(400 + k * 450, () => {
                words.forEach((w, j) => w.classList.toggle('is-reading', j === k));
                setGates(model, k);
                if (k === RNN_KEY) item.classList.add('is-stored');
                drawLine(model, k);
                readout.innerHTML = k < RNN_KEY ? `Lendo <b>“${RNN_SENTENCE[k]}”</b>…` : `Lendo <b>“${RNN_SENTENCE[k]}”</b> · lembrança de “Brasil”: <b>${pct(model, k)}</b>`;
            });
        }
        later(400 + (LAST + 1) * 450 + 300, () => {
            words.forEach(w => w.classList.remove('is-reading'));
            blank.textContent = 'português';
            blank.classList.add('is-ok');
            const extra = model === 'gru' ? ' · com menos portões, treina mais rápido' : '';
            readout.innerHTML = `${model.toUpperCase()}: ainda lembra <b>${pct(model, LAST)}</b> do “Brasil” → completa com <b>português</b> <span class="is-ok">✓</span>${extra}`;
        });
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        const model = step >= 2 ? 'gru' : 'lstm';
        stage.classList.toggle('is-gru', model === 'gru');
        name.textContent = model.toUpperCase();
        count.textContent = model === 'gru' ? '2 portões' : '3 portões';
        drawLine('rnn', LAST);
        drawLine('lstm', step >= 2 ? LAST : -1);
        drawLine('gru', -1);
        setGates(model, -1);
        item.classList.remove('is-stored');
        words.forEach(w => w.classList.remove('is-reading', 'is-ok', 'is-fail'));
        words[words.length - 1].textContent = '___';

        if (step === 0) readout.innerHTML = `Na RNN, a lembrança de “Brasil” caía para <b>${pct('rnn', LAST)}</b>. Como guardar por mais tempo?`;
        if (step === 1) play('lstm');
        if (step >= 2) play('gru');
    });
}

/* ==========================================================================
   A revolução do Deep Learning
   ReLU: o sinal do erro passa por 8 camadas. A derivada da sigmóide vale no
   máximo 0,25, então ele encolhe ×0,25 por camada; a da ReLU vale 1.
   ========================================================================== */

function setupDeep(stage) {
    const slide = stage.closest('.slide');
    const LAYERS = 8;
    const NOTES = [
        'Faltavam três peças: algoritmo, hardware e dados.',
        'Na sigmóide, cada camada multiplica o sinal por no máximo 0,25; na ReLU, por 1.',
        'Alex Krizhevsky, Ilya Sutskever e Geoffrey Hinton: a GPU virou o motor da IA.',
        'Algoritmo, hardware e dados prontos: o caminho até o ChatGPT estava aberto.',
    ];
    const pills = Array.from(stage.querySelectorAll('.dl-pill'));
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    const ns = 'http://www.w3.org/2000/svg';
    const fmt = n => (n >= 1 ? '1' : n.toFixed(5).replace('.', ',').replace(/0+$/, ''));
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const svgEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    };

    // rede profunda: 8 colunas de neurônios
    const deep = stage.querySelector('.dl-deep');
    const cols = Array.from({ length: LAYERS }, (_, c) => {
        const n = c === LAYERS - 1 ? 2 : 4;
        return Array.from({ length: n }, (_, r) => ({ x: 50 + c * (540 / (LAYERS - 1)), y: 110 + (r - (n - 1) / 2) * 44 }));
    });
    cols.slice(1).forEach((col, c) => col.forEach(b => cols[c].forEach(a => deep.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y })))));
    cols.flat().forEach(p => deep.append(svgEl('circle', { cx: p.x, cy: p.y, r: 11 })));
    deep.append(Object.assign(svgEl('text', { x: 50, y: 212 }), { textContent: 'ENTRADA' }));
    deep.append(Object.assign(svgEl('text', { x: 590, y: 212 }), { textContent: 'SAÍDA' }));

    // ReLU × sigmóide: barras do sinal (a da direita é a saída)
    const rows = ['sig', 'relu'].map(kind => {
        const row = stage.querySelector(`.dl-row-${kind}`);
        const bars = Array.from({ length: LAYERS }, () => row.querySelector('.dl-bars').appendChild(document.createElement('i')));
        return { kind, bars, end: row.querySelector('.dl-end') };
    });
    const signal = (kind, i) => (kind === 'relu' ? 1 : Math.pow(.25, LAYERS - 1 - i));

    function playChain() {
        rows.forEach(({ kind, bars, end }) => {
            bars.forEach(b => (b.style.height = '0'));
            end.textContent = '';
            for (let i = LAYERS - 1; i >= 0; i--) {
                later(300 + (LAYERS - 1 - i) * 220, () => (bars[i].style.height = `${signal(kind, i) * 100}%`));
            }
            later(300 + LAYERS * 220, () => (end.textContent = fmt(signal(kind, 0))));
        });
    }

    stage.querySelector('.dl-gpu .w2-gpu-cores').append(...Array.from({ length: 72 }, () => document.createElement('i')));

    // Big Data: pontinhos de dados aparecendo cada vez mais rápido
    const flood = stage.querySelector('.dl-flood');
    const dots = Array.from({ length: 200 }, () => {
        const d = flood.appendChild(document.createElement('i'));
        d.style.setProperty('--a', (.25 + Math.random() * .75).toFixed(2));
        return d;
    });
    const order = dots.map((_, i) => i).sort(() => Math.random() - .5);

    function playFlood() {
        dots.forEach(d => d.classList.remove('is-on'));
        order.forEach((idx, k) => later(1200 + Math.pow(k / dots.length, .5) * 2600, () => dots[idx].classList.add('is-on')));
    }

    let lastStep = 0;
    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.dataset.view = step;
        pills.forEach(p => {
            const done = step >= Number(p.dataset.at);
            p.classList.toggle('is-done', done);
            if (done && step > lastStep && Number(p.dataset.at) === step) retrigger(p, 'pop');
        });
        lastStep = step;
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];

        if (step === 0) readout.innerHTML = 'Rede <b>profunda</b> = muitas camadas. Nos anos 1990, elas quase não aprendiam.';
        if (step === 1) {
            playChain();
            readout.innerHTML = 'Depois de 8 camadas: sigmóide <b>0,00006</b> · ReLU <b>1</b>';
        }
        if (step === 2) readout.innerHTML = 'AlexNet: <b>15,3%</b> de erro, enquanto o 2º lugar errou <b>26,2%</b>';
        if (step >= 3) {
            playFlood();
            readout.innerHTML = 'Bilhões de pessoas com câmera e internet no bolso: <b>dados de sobra</b> para treinar.';
        }
    });
}

/* ==========================================================================
   O Transformer: self-attention, paralelo e encoder-decoder
   Os pesos de atenção são ilustrativos (somam 100% em cada frase).
   ========================================================================== */

function setupTransformer(stage) {
    const slide = stage.closest('.slide');
    const BASE = ['O', 'animal', 'não', 'atravessou', 'a', 'rua', 'porque', 'estava'];
    const PHASES = [
        { last: 'cansado', top: 1, w: [.02, .58, .04, .08, .01, .12, .03, .07] },
        { last: 'movimentada', top: 5, w: [.02, .10, .03, .09, .04, .61, .03, .05] },
    ];
    const NOTES = [
        'Criado por pesquisadores do Google, no artigo “Attention Is All You Need”.',
        'Por isso dá para treinar com quantidades gigantes de texto.',
        'Pesos ilustrativos: mudou uma palavra, mudou para onde a atenção vai.',
        'Cada palavra é uma conta independente: perfeito para os milhares de núcleos de uma GPU.',
        'O ChatGPT usa só a metade decoder: gera a resposta palavra por palavra.',
    ];
    const attn = stage.querySelector('.tf-attn');
    const arcs = stage.querySelector('.tf-arcs');
    const wordsBox = stage.querySelector('.tf-words');
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    const ns = 'http://www.w3.org/2000/svg';
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const active = () => slide.classList.contains('is-active');

    // self-attention: arcos da palavra em foco (a última) até as outras
    function drawAttention(p) {
        const phase = PHASES[p];
        wordsBox.innerHTML = '';
        const spans = [...BASE, phase.last].map(w => {
            const s = document.createElement('span');
            s.textContent = w;
            wordsBox.append(s);
            return s;
        });
        const focus = spans[spans.length - 1];
        focus.classList.add('is-focus');
        spans[phase.top].classList.add('is-top');
        arcs.innerHTML = '';
        const center = s => s.offsetLeft + s.offsetWidth / 2;
        const xf = center(focus);
        const y = focus.offsetTop - 4;
        phase.w.forEach((w, i) => {
            const xt = center(spans[i]);
            const h = Math.min(150, 30 + Math.abs(xf - xt) * .3);
            const path = document.createElementNS(ns, 'path');
            path.setAttribute('d', `M ${xf} ${y} Q ${(xf + xt) / 2} ${y - h * 2} ${xt} ${y}`);
            path.style.strokeWidth = 1.5 + w * 16;
            path.style.opacity = .2 + w * 1.4;
            arcs.append(path);
            if (i === phase.top) {
                const t = document.createElementNS(ns, 'text');
                t.setAttribute('x', (xf + xt) / 2);
                t.setAttribute('y', y - h - 12);
                t.textContent = `${Math.round(w * 100)}%`;
                arcs.append(t);
            }
        });
        readout.innerHTML = `“${phase.last}” presta mais atenção em <b>“${BASE[phase.top]}”</b> (${Math.round(phase.w[phase.top] * 100)}%)`;
    }

    function playAttention(p = 0) {
        drawAttention(p);
        later(4200, () => active() && playAttention(1 - p));
    }

    // paralelo: a RNN acende uma palavra por vez; o Transformer, todas juntas
    const lanes = ['rnn', 'tf'].map(kind => {
        const lane = stage.querySelector(`.tf-lane-${kind}`);
        const toks = [...BASE, 'cansado'].map(w => {
            const s = document.createElement('span');
            s.textContent = w;
            lane.querySelector('.tf-toks').append(s);
            return s;
        });
        return { toks, steps: lane.querySelector('.tf-steps') };
    });
    const passos = n => `${n} ${n === 1 ? 'passo' : 'passos'}`;

    function playParallel() {
        const [rnn, tf] = lanes;
        [rnn, tf].forEach(l => {
            l.toks.forEach(t => t.classList.remove('is-done'));
            l.steps.textContent = passos(0);
        });
        later(500, () => {
            tf.toks.forEach(t => t.classList.add('is-done'));
            tf.steps.textContent = passos(1);
        });
        rnn.toks.forEach((t, i) => later(500 + i * 380, () => {
            t.classList.add('is-done');
            rnn.steps.textContent = passos(i + 1);
            readout.innerHTML = `RNN: <b>${passos(i + 1)}</b> · Transformer: <b>1 passo</b>`;
        }));
        later(500 + rnn.toks.length * 380 + 1800, () => active() && playParallel());
    }

    // encoder-decoder: tradução "Eu gosto de café" → "I like coffee"
    const enc = Array.from(stage.querySelectorAll('.tf-enc .tf-toks span'));
    const dec = Array.from(stage.querySelectorAll('.tf-dec .tf-toks span'));
    const meaning = stage.querySelector('.tf-meaning');
    const LOOK = [0, 1, 3]; // I ← Eu · like ← gosto · coffee ← café

    function playTranslate() {
        enc.forEach(s => s.classList.remove('is-done', 'is-look'));
        dec.forEach(s => s.classList.remove('is-done'));
        meaning.classList.remove('is-on');
        readout.innerHTML = 'O <b>encoder</b> lê “Eu gosto de café” inteira, de uma vez…';
        later(400, () => enc.forEach(s => s.classList.add('is-done')));
        later(1000, () => meaning.classList.add('is-on'));
        dec.forEach((s, i) => later(1800 + i * 900, () => {
            enc.forEach((e, j) => e.classList.toggle('is-look', j === LOOK[i]));
            s.classList.add('is-done');
            readout.innerHTML = `…e o <b>decoder</b> gera <b>“${dec.slice(0, i + 1).map(d => d.textContent).join(' ')}”</b>, olhando para “${enc[LOOK[i]].textContent}”`;
        }));
        later(1800 + dec.length * 900 + 2200, () => active() && playTranslate());
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.dataset.view = step;
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        if (step === 0) readout.innerHTML = 'GPT = <b>G</b>enerative <b>P</b>re-trained <b>T</b>ransformer';
        if (step === 1) readout.innerHTML = 'A RNN lia em fila; o Transformer lê <b>tudo junto</b> e olha para o texto todo.';
        if (step === 2) playAttention();
        if (step === 3) playParallel();
        if (step >= 4) playTranslate();
    });
}

/* ==========================================================================
   Embeddings: vetores de 8 números (ilustrativos) e a semelhança entre
   eles (cosseno: 1 = mesmo sentido, 0 = nada a ver, negativo = oposto).
   ========================================================================== */

function setupEmbeddings(stage) {
    const slide = stage.closest('.slide');
    const VECS = {
        gato: [.82, .10, -.35, .64, -.20, .45, .05, -.60],
        cachorro: [.78, .18, -.30, .58, -.12, .40, .12, -.52],
        carro: [-.40, .85, .60, -.25, .70, -.55, .30, .20],
    };
    // posição no mapa · de onde o ponto "voa" ao aparecer
    const POINTS = [
        ['gato', 120, 78], ['cachorro', 172, 104], ['leão', 105, 128], ['cavalo', 190, 56],
        ['maçã', 500, 78], ['banana', 552, 104], ['uva', 498, 124],
        ['carro', 480, 250], ['ônibus', 540, 268], ['moto', 490, 290],
        ['homem', 122, 238], ['rei', 262, 210], ['mulher', 122, 296], ['rainha', 262, 268],
    ];
    const ANALOGY = ['homem', 'rei', 'mulher', 'rainha'];
    const TOKENS = ['Eu', 'gosto', 'de', 'café'];
    const NOTES = [
        'Para a rede, “gato” não é uma palavra: é uma lista de números.',
        'Ilustração com 8 números; os modelos de verdade usam milhares.',
        'Ninguém desenha esse mapa à mão: a rede aprende lendo muito texto.',
        'A “direção” de homem para rei é a mesma de mulher para rainha.',
        'Os números não são escritos à mão: a rede aprende durante o treino.',
    ];
    const ns = 'http://www.w3.org/2000/svg';
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    const fmt2 = n => n.toFixed(2).replace('.', ',').replace(/^-/, '−');
    const cos = (a, b) => {
        const dot = a.reduce((s, v, i) => s + v * b[i], 0);
        const len = v => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        return dot / (len(a) * len(b));
    };

    // linhas de barras (positivo para cima, negativo para baixo)
    const rows = Array.from(stage.querySelectorAll('.emb-vec'));
    rows.forEach(row => {
        VECS[row.dataset.word].forEach((v, i) => {
            const b = document.createElement('b');
            b.className = v < 0 ? 'is-neg' : '';
            b.style.setProperty('--v', Math.abs(v));
            b.style.setProperty('--d', `${i * .06}s`);
            b.innerHTML = `<span>${fmt2(v)}</span>`;
            row.querySelector('.emb-bars').append(b);
        });
    });

    // pontos do mapa
    const pts = stage.querySelector('.emb-pts');
    POINTS.forEach(([word, x, y], i) => {
        const g = document.createElementNS(ns, 'g');
        g.style.setProperty('--fx', `${320 - x}px`);
        g.style.setProperty('--fy', `${165 - y}px`);
        g.style.transitionDelay = `${i * .05}s`;
        if (word === 'gato') g.classList.add('is-focus');
        if (ANALOGY.includes(word)) g.classList.add('is-analogy');
        if (word === 'rainha') g.classList.add('is-target');
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r', 6);
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y - 16);
        t.textContent = word;
        g.append(c, t);
        pts.append(g);
    });

    // tokens do GPT, cada um com o seu vetor
    const tokBox = stage.querySelector('.emb-tokens');
    TOKENS.forEach(w => {
        const el = document.createElement('div');
        el.className = 'emb-token';
        const bars = Array.from({ length: 6 }, () => `<b style="--a:${(.25 + Math.random() * .75).toFixed(2)}"></b>`).join('');
        el.innerHTML = `<span>${w}</span><i>${bars}</i><em>⋮</em>`;
        tokBox.append(el);
    });

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stage.dataset.view = step;
        stage.classList.toggle('show-map', step >= 2 && step <= 3);
        stage.classList.toggle('show-analogy', step === 3);
        rows.forEach((r, i) => r.classList.toggle('is-on', step >= 1 || (step === 0 && i === 0)));
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];

        if (step === 0) readout.innerHTML = '“gato” → [0,82; 0,10; −0,35; 0,64; …]';
        if (step === 1) readout.innerHTML = `Semelhança: gato × cachorro <b>${fmt2(cos(VECS.gato, VECS.cachorro))}</b> · gato × carro <b>${fmt2(cos(VECS.gato, VECS.carro))}</b>`;
        if (step === 2) readout.innerHTML = 'Cada vetor é um ponto: <b>gato</b> fica perto de cachorro e leão, e longe de carro.';
        if (step === 3) readout.innerHTML = '<b>rei − homem + mulher ≈ rainha</b>: as contas com vetores carregam o significado.';
        if (step >= 4) readout.innerHTML = 'No GPT-3, cada pedaço de palavra (token) vira um vetor de <b>12.288 números</b>.';
    });
}

/* ==========================================================================
   Onde os embeddings estão hoje. Recomendação: o ponto "Você" é a média
   das músicas que você ouviu, e as sugestões são as 3 mais próximas dele
   que você ainda não ouviu (distância de verdade, no mapa ilustrativo).
   ========================================================================== */

function setupEmbUses(stage) {
    const slide = stage.closest('.slide');
    const QUERY = 'como deixar o café menos amargo';
    const GENRES = [['MPB', 150, 40], ['SAMBA', 260, 270], ['ROCK', 520, 40], ['ELETRÔNICA', 520, 270]];
    const SONGS = [
        [110, 80, 1], [170, 100], [130, 130, 1], [210, 70], [190, 145], [95, 165],
        [230, 220, 1], [290, 230], [200, 245], [320, 200], [260, 190],
        [480, 80], [540, 110], [580, 70], [500, 140], [600, 135],
        [470, 225], [560, 230], [600, 200], [510, 250],
    ];
    const NOTES = [
        'Tudo isso é a mesma ideia: perto no mapa = parecido no sentido.',
        'Nenhuma palavra em comum com “suavizar o sabor”, e mesmo assim é a melhor resposta.',
        'O modelo não sabia nada da sua empresa: o RAG entrega o trecho certo na hora da pergunta.',
        'Na Netflix, a mesma ideia com filmes e séries.',
    ];
    const ns = 'http://www.w3.org/2000/svg';
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const svgEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    };

    // 1 · busca
    const typed = stage.querySelector('.use-typed');
    const [colBad, colGood] = stage.querySelectorAll('.use-col');

    function playSearch() {
        typed.textContent = '';
        colBad.classList.remove('is-on');
        colGood.classList.remove('is-on');
        Array.from(QUERY).forEach((_, i) => later(200 + i * 45, () => (typed.textContent = QUERY.slice(0, i + 1))));
        const t = 200 + QUERY.length * 45;
        later(t + 400, () => {
            colBad.classList.add('is-on');
            readout.innerHTML = 'Por palavras: acha “como deixar… <b>menos</b>”, mas sobre celular <span class="is-veto">✗</span>';
        });
        later(t + 1900, () => {
            colGood.classList.add('is-on');
            readout.innerHTML = 'Por significado: “suavizar o sabor” ≈ “menos amargo” <span class="is-ok">✓</span>';
        });
    }

    // 2 · RAG
    const ragSteps = Array.from(stage.querySelectorAll('.rag-step'));
    const ragArrows = Array.from(stage.querySelectorAll('.use-rag .cnn-arrow'));
    const db = stage.querySelector('.rag-db');
    const dots = Array.from({ length: 32 }, () => stage.querySelector('.rag-dots').appendChild(document.createElement('i')));
    const HITS = [9, 10, 18];
    const RAG_TEXT = [
        'A pergunta chega…',
        '…vira um vetor (embedding)…',
        '…o banco acha os trechos com vetor mais parecido…',
        '…e a IA responde usando o <b>documento certo</b> <span class="is-ok">✓</span>',
    ];

    function playRag() {
        ragSteps.forEach(s => s.classList.remove('is-on'));
        ragArrows.forEach(a => a.classList.remove('is-on'));
        dots.forEach(d => d.classList.remove('is-hit'));
        db.classList.remove('is-found');
        ragSteps.forEach((s, i) => later(300 + i * 1300, () => {
            s.classList.add('is-on');
            if (i > 0) ragArrows[i - 1].classList.add('is-on');
            readout.innerHTML = RAG_TEXT[i];
            if (i === 2) {
                later(500, () => {
                    HITS.forEach(h => dots[h].classList.add('is-hit'));
                    db.classList.add('is-found');
                });
            }
        }));
    }

    // 3 · recomendação
    const genres = stage.querySelector('.use-genres');
    GENRES.forEach(([name, x, y]) => genres.append(Object.assign(svgEl('text', { x, y }), { textContent: name })));
    const songs = stage.querySelector('.use-songs');
    const songEls = SONGS.map(([x, y]) => songs.appendChild(svgEl('circle', { cx: x, cy: y, r: 7 })));
    const heard = SONGS.map((s, i) => (s[2] ? i : -1)).filter(i => i >= 0);
    const you = {
        x: heard.reduce((a, i) => a + SONGS[i][0], 0) / heard.length,
        y: heard.reduce((a, i) => a + SONGS[i][1], 0) / heard.length,
    };
    const sugg = SONGS.map((s, i) => ({ i, d: Math.hypot(s[0] - you.x, s[1] - you.y) }))
        .filter(s => !heard.includes(s.i))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map(s => s.i);
    const youG = stage.querySelector('.use-you');
    youG.setAttribute('transform', `translate(${you.x.toFixed(1)} ${you.y.toFixed(1)})`);

    function playRec() {
        songEls.forEach(c => c.classList.remove('is-heard', 'is-sugg'));
        youG.classList.remove('is-on', 'is-search');
        readout.innerHTML = 'Cada música é um vetor: músicas parecidas ficam perto.';
        heard.forEach((i, k) => later(500 + k * 500, () => songEls[i].classList.add('is-heard')));
        later(2200, () => {
            youG.classList.add('is-on');
            readout.innerHTML = 'Você = a <b>média</b> das músicas que ouviu';
        });
        later(3200, () => youG.classList.add('is-search'));
        later(3900, () => {
            sugg.forEach(i => songEls[i].classList.add('is-sugg'));
            readout.innerHTML = 'Sugestões: as <b>3 músicas mais próximas</b> de você que você ainda não ouviu <span class="is-ok">✓</span>';
        });
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.dataset.view = step;
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        if (step === 0) readout.innerHTML = 'Três usos do dia a dia, um só truque: <b>comparar vetores</b>.';
        if (step === 1) playSearch();
        if (step === 2) playRag();
        if (step >= 3) playRec();
    });
}

/* ==========================================================================
   O que é um LLM. Etapa 2: o modelo escolhe a próxima palavra, acrescenta
   e repete (probabilidades ilustrativas). Etapa 3: tamanhos em escala
   logarítmica — 3 e 6 pesos são as nossas redes dos slides anteriores.
   ========================================================================== */

function setupLLM(stage) {
    const slide = stage.closest('.slide');
    const ROUNDS = [
        [['azul', .62], ['lindo', .15], ['nublado', .09], ['enorme', .05]],
        [['e', .41], ['.', .30], ['hoje', .12], ['porque', .08]],
        [['o', .38], ['limpo', .22], ['a', .14], ['sem', .10]],
        [['mar', .47], ['sol', .25], ['dia', .11], ['ar', .06]],
    ];
    const START = 'O céu é';
    const SIZES = [
        ['Nosso perceptron', 'slide 12', 3, '3 pesos'],
        ['Nossa rede do backprop', 'slide 17', 6, '6 pesos'],
        ['GPT-2', '2019', 1.5e9, '1,5 bilhão'],
        ['GPT-3', '2020', 175e9, '175 bilhões'],
    ];
    const NOTES = [
        'Um modelo de linguagem enorme: e só isso já diz muito.',
        'O LLM não é outra coisa: é uma rede neural, do tipo Transformer, muito grande.',
        'Probabilidades ilustrativas. Ele nunca “sabe” a frase inteira: vai palavra por palavra.',
        'Pesos = os mesmos números que ajustamos no backpropagation, só que bilhões deles.',
        'A rede é o cérebro; o treino é a educação; o LLM é o cérebro já educado.',
    ];
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    const ctx = stage.querySelector('.llm-ctx-text');
    const cands = stage.querySelector('.llm-cands');
    let timers = [];

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
    };
    const pct = p => `${Math.round(p * 100)}%`;

    // 2 · próxima palavra
    function playNext() {
        let words = [];
        const show = () => (ctx.innerHTML = `${START} ${words.map((w, i) => (i === words.length - 1 ? `<b>${w}</b>` : w)).join(' ')}`.trim());
        show();
        ROUNDS.forEach((round, r) => {
            const t0 = 400 + r * 2600;
            later(t0, () => {
                cands.innerHTML = round.map(([w, p]) => `<div class="llm-cand"><span>${w}</span><i style="--p:${p}"></i><span>${pct(p)}</span></div>`).join('');
                readout.innerHTML = `Contexto: “${START}${words.length ? ' ' + words.join(' ') : ''}” → calculando a chance de cada palavra…`;
                requestAnimationFrame(() => cands.querySelectorAll('i').forEach(i => (i.style.width = `${i.style.getPropertyValue('--p') * 100}%`)));
            });
            later(t0 + 1300, () => {
                cands.firstElementChild.classList.add('is-pick');
                words.push(round[0][0]);
                show();
                readout.innerHTML = `Escolhe <b>“${round[0][0]}”</b> (${pct(round[0][1])}), acrescenta e repete`;
            });
        });
        later(400 + ROUNDS.length * 2600 + 1200, () => slide.classList.contains('is-active') && playNext());
    }

    // 3 · escala (log10 de 1 a 10¹²)
    const rows = stage.querySelector('.llm-rows');
    SIZES.forEach(([name, sub, n, label], i) => {
        const w = (Math.log10(n) / 12) * 100;
        const row = document.createElement('div');
        row.className = `llm-row${n > 1e9 ? ' is-big' : ''}`;
        row.style.setProperty('--d', `${i * .35}s`);
        row.innerHTML = `<div class="llm-row-name"><b>${name}</b><span>${sub}</span></div><div class="llm-track" style="--w:${Math.max(w, 1.5).toFixed(1)}%"><i></i><em>${label}</em></div>`;
        rows.append(row);
    });

    // 4 · pesos aleatórios → ajustados (um desenho organizado aparece)
    const gridA = stage.querySelector('.llm-grid-a');
    const gridB = stage.querySelector('.llm-grid-b');
    const cellsB = [];
    for (let i = 0; i < 96; i++) {
        const a = document.createElement('i');
        a.style.setProperty('--a', (.05 + Math.random() * .35).toFixed(2));
        gridA.append(a);
        const b = document.createElement('i');
        const r = Math.floor(i / 12);
        const c = i % 12;
        b.style.setProperty('--b', ((Math.sin(c * .7) + Math.cos(r * .9)) / 4 + .5).toFixed(2));
        gridB.append(b);
        cellsB.push(b);
    }

    function playTrain() {
        cellsB.forEach(c => c.classList.remove('is-on'));
        const order = cellsB.map((_, i) => i).sort(() => Math.random() - .5);
        order.forEach((idx, k) => later(500 + k * 22, () => cellsB[idx].classList.add('is-on')));
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.dataset.view = step;
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        if (step === 0) readout.innerHTML = '<b>L</b>arge <b>L</b>anguage <b>M</b>odel: grande modelo de linguagem';
        if (step === 1) readout.innerHTML = 'Rede neural <b>⊃</b> Transformer <b>⊃</b> LLM · o ChatGPT é o aplicativo';
        if (step === 2) playNext();
        if (step === 3) readout.innerHTML = 'Do nosso perceptron ao GPT-3: de <b>3</b> para <b>175.000.000.000</b> pesos';
        if (step >= 4) {
            playTrain();
            readout.innerHTML = 'O treino não “cria” outra coisa: ele <b>ajusta os pesos</b> da rede até ela virar o LLM.';
        }
    });
}

/* ==========================================================================
   Como o ChatGPT foi treinado. Divisão em tokens ilustrativa (cada modelo
   corta de um jeito); 300 bilhões = tokens do treino do GPT-3.
   ========================================================================== */

function setupTraining(stage) {
    const slide = stage.closest('.slide');
    const TOKENS = ['O', ' in', 'acredit', 'ável', ' Chat', 'G', 'PT', ' aprend', 'eu', ' a', ' convers', 'ar', '.'];
    const TOTAL = 300e9;
    const NOTES = [
        'A criança do slide 2 e o ChatGPT: as mesmas três maneiras de aprender.',
        'Ele lê pedaços, não palavras: por isso às vezes erra ao contar letras.',
        'Antes do ajuste, ele só sabia continuar textos, não responder.',
        'RLHF: aprendizado por reforço com feedback humano.',
    ];
    const rows = Array.from(stage.querySelectorAll('.tr-row'));
    const tokBox = stage.querySelector('.tr-tokens');
    const countEl = stage.querySelector('.tr-count-n');
    const votes = Array.from(stage.querySelectorAll('.tr-vote'));
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');
    let timers = [];
    let raf = null;

    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const stop = () => {
        timers.forEach(clearTimeout);
        timers = [];
        cancelAnimationFrame(raf);
    };

    const toks = TOKENS.map((t, i) => {
        const s = document.createElement('span');
        s.textContent = t;
        s.style.setProperty('--h', (i * 47) % 360);
        tokBox.append(s);
        return s;
    });

    function playTokens() {
        toks.forEach(t => t.classList.remove('is-on'));
        toks.forEach((t, i) => later(200 + i * 160, () => t.classList.add('is-on')));
        countEl.textContent = '0';
        const t0 = performance.now() + 200 + toks.length * 160;
        const frame = now => {
            const k = Math.max(0, Math.min(1, (now - t0) / 1800));
            const v = TOTAL * (1 - Math.pow(1 - k, 3));
            countEl.textContent = v >= 1e9 ? `${Math.round(v / 1e9)} bilhões` : Math.round(v).toLocaleString('pt-BR');
            if (k < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
    }

    function playVotes() {
        votes.forEach(v => v.classList.remove('is-voted'));
        later(900, () => votes[0].classList.add('is-voted'));
        later(1500, () => {
            votes[1].classList.add('is-voted');
            readout.innerHTML = 'Nota alta para A, baixa para B → o modelo é ajustado para dar <b>mais respostas como a A</b>';
        });
    }

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stop();
        stage.dataset.view = step;
        rows.forEach(r => {
            const at = Number(r.dataset.at);
            r.classList.toggle('is-on', step >= at);
            r.classList.toggle('is-now', step === at);
        });
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
        if (step === 0) readout.innerHTML = 'Compreensão, correção e erro: <b>as três aparecem no treino</b>.';
        if (step === 1) {
            playTokens();
            readout.innerHTML = 'Pré-treino: texto da internet, livros e artigos, cortado em <b>tokens</b>';
        }
        if (step === 2) readout.innerHTML = 'Ajuste fino: pessoas mostram <b>como é uma boa resposta</b>';
        if (step >= 3) {
            readout.innerHTML = 'RLHF: pessoas comparam respostas e dão notas…';
            playVotes();
        }
    });
}

/* ==========================================================================
   Os limites (exemplos ilustrativos)
   ========================================================================== */

function setupLimits(stage) {
    const slide = stage.closest('.slide');
    const READ = [
        'Ele escolhe a palavra mais <b>provável</b>; nem sempre é a <b>verdadeira</b>.',
        'Parece real, tem editora e ano… e <b>não existe</b>. Confira sempre as fontes.',
        'O que aconteceu depois do treino ele não viu, a não ser que <b>consulte uma fonte</b>.',
        'Se os textos de treino tinham mais “ele engenheiro”, a previsão <b>repete o padrão</b>.',
    ];
    const NOTES = [
        'Use como assistente, não como oráculo.',
        'Alucinação: o texto “soa certo” porque é provável, não porque é fato.',
        'É por isso que o RAG (slide 25) e a busca na web são tão usados.',
        'Probabilidades ilustrativas. Empresas tentam corrigir isso no ajuste fino e no RLHF.',
    ];
    const readout = stage.querySelector('.mlp-readout');
    const note = stage.querySelector('.mlp-note');

    slide.addEventListener('stepchange', e => {
        const step = e.detail.step;
        stage.dataset.view = step;
        readout.innerHTML = READ[Math.min(step, READ.length - 1)];
        note.textContent = NOTES[Math.min(step, NOTES.length - 1)];
    });
}

/* ==========================================================================
   Neve (inverno da IA): flocos com tamanho, velocidade e deriva aleatórios
   ========================================================================== */

function buildSnow(container) {
    for (let i = 0; i < 90; i++) {
        const flake = document.createElement('i');
        const dur = 7 + Math.random() * 9;
        flake.style.setProperty('--left', `${Math.random() * 100}%`);
        flake.style.setProperty('--size', `${2 + Math.random() * 5}px`);
        flake.style.setProperty('--alpha', (.35 + Math.random() * .6).toFixed(2));
        flake.style.setProperty('--dur', `${dur}s`);
        flake.style.setProperty('--delay', `${-Math.random() * dur}s`); // já começa nevando
        flake.style.setProperty('--drift', `${Math.random() * 80 - 40}px`);
        container.append(flake);
    }
}

// reinicia uma animação CSS (remove a classe, força o layout, coloca de volta)
function retrigger(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect();
    el.classList.add(className);
}

/* ==========================================================================
   Início
   ========================================================================== */

// pulsos elétricos: cada caminho com data-pulse ganha uma cópia animada por cima
document.querySelectorAll('[data-pulse]').forEach(path => {
    const pulse = path.cloneNode();
    pulse.removeAttribute('data-pulse');
    pulse.setAttribute('class', `flow flow-${path.dataset.pulse}`);
    path.after(pulse);
});

document.querySelectorAll('.time-ruler').forEach(buildTimeRuler);
document.querySelectorAll('.nn-diagram').forEach(buildNeuralDiagram);
document.querySelectorAll('.mp-stage').forEach(setupMcCullochPitts);
document.querySelectorAll('.retina').forEach(setupRetina);
document.querySelectorAll('.pcs-stage').forEach(setupStructure);
document.querySelectorAll('.learn-stage').forEach(setupLearning);
document.querySelectorAll('.limit-stage').forEach(setupLimit);
document.querySelectorAll('.mlp-stage').forEach(setupMLP);
document.querySelectorAll('.bp-stage').forEach(setupBackprop);
document.querySelectorAll('.w2-stage').forEach(setupWinter2);
document.querySelectorAll('.cnn-stage').forEach(setupCNN);
document.querySelectorAll('.rnn-stage').forEach(setupRNN);
document.querySelectorAll('.lg-stage').forEach(setupGates);
document.querySelectorAll('.dl-stage').forEach(setupDeep);
document.querySelectorAll('.tf-stage').forEach(setupTransformer);
document.querySelectorAll('.emb-stage').forEach(setupEmbeddings);
document.querySelectorAll('.use-stage').forEach(setupEmbUses);
document.querySelectorAll('.llm-stage').forEach(setupLLM);
document.querySelectorAll('.tr-stage').forEach(setupTraining);
document.querySelectorAll('.lim-stage').forEach(setupLimits);
document.querySelectorAll('.snow').forEach(buildSnow);

slides.forEach(slide => {
    // todo slide começa na etapa 0 (evita animar o "recolhimento" na primeira visita)
    slide.dataset.step = 0;
    // atraso da cascata de entrada: cada [data-anim] entra um pouco depois do anterior
    slide.querySelectorAll('[data-anim]').forEach((el, i) => el.style.setProperty('--i', i));
});

fitStage();
goTo(slideFromHash());
