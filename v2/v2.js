/* Айдар Хуснутдинов — вторая версия.
   Первый экран виден сразу; курсор пишет по фото светящийся мазок. Заголовки пишет кисть
   Shygyrt вживую, когда до них долистали. Нажал на песню — в мини-плеере
   растёт эквалайзер, а имя светится цветами обложки. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var WAVES = window.WAVES || {};
  var NS = 'http://www.w3.org/2000/svg';
  var fmt = function (s) {
    if (!isFinite(s)) return '0:00';
    var sec = Math.floor(s % 60);
    return Math.floor(s / 60) + ':' + (sec < 10 ? '0' : '') + sec;
  };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  var yr = $('[data-year]'); if (yr) yr.textContent = new Date().getFullYear();

  /* ================= КИСТЬ ВЖИВУЮ ================= */
  // Shygyrt отдаёт не картинку, а движение кисти (brush/*.json, флаг --anim):
  // мазки по порядку, у каждого волоска — с какой точки мазка он касается бумаги
  // и оба его края. Холст ведёт кисть по траектории: волоски тянутся по ходу
  // движения, между мазками и буквами рука делает паузу, брызги падают в конце.
  // Готовые мазки «высыхают» на отдельном холсте, каждый кадр дорисовываем
  // только тот, что в работе.

  function Painter(box, data, color) {
    var img = box.querySelector('img');
    var cv = document.createElement('canvas');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', (img && img.alt) || '');
    var w = img.getBoundingClientRect().width || box.clientWidth;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var k = w * dpr / data.w;
    cv.width = Math.round(data.w * k); cv.height = Math.round(data.h * k);
    cv.style.width = w + 'px';
    // Светящаяся надпись: кисть пишет невидимую маску, а на холст её кладёт fluidFrame.
    var ink = cv;
    if (box.hasAttribute('data-glow-ink') && fluid) {
      ink = document.createElement('canvas'); ink.width = cv.width; ink.height = cv.height;
      glowText(cv, ink, cv.height / cv.width);
    }
    var ctx = ink.getContext('2d');
    var dry = document.createElement('canvas'); dry.width = cv.width; dry.height = cv.height;
    var dctx = dry.getContext('2d');
    ctx.fillStyle = dctx.fillStyle = color || data.color;
    box.replaceChild(cv, img);
    box.classList.add('is-img');

    // Тайминг руки: длина мазка + паузы на отрыв кисти (между буквами дольше).
    var st = data.strokes, raw = [], t = 0;
    st.forEach(function (s, i) {
      t += i === 0 ? 0 : (s.c === st[i - 1].c ? 0.05 : (s.c - st[i - 1].c > 1 ? 0.22 : 0.11));
      var d = 0.09 + s.l * 0.42;
      raw.push([t, d]); t += d;
    });

    function bristle(c, b, upto) {
      var L = b[1], R = b[2], m = L.length / 2, j = upto - b[0];
      if (j <= 0) return;
      var full = j >= m - 1, end = full ? m - 1 : Math.floor(j), f = full ? 0 : j - end, i;
      c.beginPath();
      c.moveTo(L[0] * k, L[1] * k);
      for (i = 1; i <= end; i++) c.lineTo(L[i * 2] * k, L[i * 2 + 1] * k);
      if (f > 0 && end + 1 < m) {
        c.lineTo((L[end * 2] + (L[end * 2 + 2] - L[end * 2]) * f) * k, (L[end * 2 + 1] + (L[end * 2 + 3] - L[end * 2 + 1]) * f) * k);
        c.lineTo((R[end * 2] + (R[end * 2 + 2] - R[end * 2]) * f) * k, (R[end * 2 + 1] + (R[end * 2 + 3] - R[end * 2 + 1]) * f) * k);
      }
      for (i = end; i >= 0; i--) c.lineTo(R[i * 2] * k, R[i * 2 + 1] * k);
      c.closePath(); c.fill();
    }
    function splats(c, s) {
      s.s.forEach(function (p) {
        c.beginPath(); c.moveTo(p[0] * k, p[1] * k);
        for (var i = 2; i < p.length; i += 2) c.lineTo(p[i] * k, p[i + 1] * k);
        c.closePath(); c.fill();
      });
    }
    var ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

    this.play = function (ms) {
      var unit = ms / t, t0 = performance.now(), dried = 0;
      (function frame(now) {
        var sec = (now - t0) / unit;
        while (dried < st.length && sec >= raw[dried][0] + raw[dried][1]) {
          st[dried].b.forEach(function (b) { bristle(dctx, b, 1e9); });
          splats(dctx, st[dried]);
          dried++;
        }
        ctx.clearRect(0, 0, ink.width, ink.height);
        ctx.drawImage(dry, 0, 0);
        for (var i = dried; i < st.length && raw[i][0] <= sec; i++) {
          var upto = ease(clamp((sec - raw[i][0]) / raw[i][1], 0, 1)) * (st[i].n - 1);
          st[i].b.forEach(function (b) { bristle(ctx, b, upto); });
        }
        if (dried < st.length) requestAnimationFrame(frame);
        else cv.style.width = '';            // дальше холст тянется вместе с колонкой
      })(t0);
    };
  }

  // Движение кисти качаем сразу, а пишем, когда надпись доезжает до взгляда.
  function brushOnView(box, ms) {
    var data = fetch(box.dataset.brush).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    data.catch(function () { box.classList.add('is-img'); });
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      data.then(function (d) {
        setTimeout(function () { new Painter(box, d, box.dataset.color).play(ms); }, +box.dataset.delay || 0);
      }, function () {});
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(box);
  }
  if (!reduce) $$('[data-brush]').forEach(function (b) { brushOnView(b, 2800); });
  else $$('[data-brush]').forEach(function (b) { b.classList.add('is-img'); });

  /* ================= ЗВУК ================= */

  var au = new Audio();
  au.preload = 'none';
  var actx = null, analyser = null, freq = null;
  var lvl = 0, bass = 0, lastBeat = 0, peakAvg = 1;
  var kick = 0, lowPrev = new Float32Array(16), fluxMean = 0, fluxVar = 0;   // удар бочки: 1 в момент удара, дальше гаснет
  var cur = null;
  var beatFns = [];

  function ensureGraph() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      var src = actx.createMediaElementSource(au);
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.35;
      src.connect(analyser); analyser.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) { actx = null; analyser = null; }
  }
  var playing = function () { return !!(analyser && cur && !au.paused); };

  function readLevel(now) {
    if (!playing()) { lvl += (0 - lvl) * 0.08; return; }
    analyser.getByteFrequencyData(freq);
    var sum = 0, b = 0, i;
    for (i = 0; i < 360; i++) sum += freq[i];
    for (i = 2; i < 18; i++) b += freq[i];
    // Мастера громкие и разные: меряем относительно недавнего пика.
    var avg = sum / 360;
    peakAvg = Math.max(avg, peakAvg * 0.996, 1);
    var target = clamp((avg / peakAvg - 0.5) / 0.5, 0, 1);
    lvl += (target - lvl) * (target > lvl ? 0.45 : 0.12);
    bass = b / 16 / 255;
    // Удар = резкий прирост энергии в басу (спектральный поток), а не просто
    // «громко»: сжатый мастер громкий всегда. Порог — среднее + 1,6 разброса
    // за последние секунды, так ловится и тихая бочка, и плотная.
    var flux = 0;
    for (i = 1; i < 13; i++) { var d = freq[i] - lowPrev[i]; if (d > 0) flux += d; lowPrev[i] = freq[i]; }
    fluxMean += (flux - fluxMean) * 0.05;
    fluxVar += ((flux - fluxMean) * (flux - fluxMean) - fluxVar) * 0.05;
    var sd = Math.sqrt(fluxVar);
    if (flux > fluxMean + 1.6 * sd && flux > 40 && now - lastBeat > 200) {
      lastBeat = now;
      var strength = clamp((flux - fluxMean) / (3 * sd + 1), 0.3, 1);
      kick = Math.max(kick, 0.45 + 0.55 * strength);
      beatFns.forEach(function (f) { f(strength); });
    }
  }

  function title(el) {
    return (el.querySelector('[aria-label]').getAttribute('aria-label') || '').replace(/^Слушать: /, '');
  }

  function play(el, seekFrac) {
    ensureGraph();
    if (cur === el) {
      if (seekFrac == null) { if (au.paused) au.play(); else au.pause(); }
      else if (au.duration) au.currentTime = seekFrac * au.duration;
      else pendingSeek = seekFrac;           // песня ещё грузится — перемотаем, как узнаем длину
      return;
    }
    if (cur) stopUi(cur);
    cur = el;
    pendingSeek = seekFrac;
    au.src = el.dataset.audio;
    au.play().catch(function () {});
    el.style.setProperty('--cov', 'url("' + el.dataset.cover + '")');
    glowPalette(el.querySelector('.card__cover img'), el);
    $('[data-mini-cover]').src = el.dataset.cover;
    $('[data-mini-title]').textContent = title(el);
    $('[data-mini]').classList.add('on');
  }

  function stopUi(el) {
    el.classList.remove('is-play');
    el.querySelector('[data-clip]').setAttribute('width', 0);
    el.querySelector('.strip__play').textContent = '▶';
    el.querySelector('[data-dur]').textContent = fmt((WAVES[el.dataset.song] || {}).dur);
  }

  function sync() {
    var on = cur && !au.paused;
    $('[data-mini-btn]').textContent = on ? '❚❚' : '▶';
    $('[data-mini-btn]').setAttribute('aria-label', on ? 'Пауза' : 'Играть');
    if (!cur) return;
    cur.classList.toggle('is-play', !!on);
    cur.querySelector('.strip__play').textContent = on ? '❚❚' : '▶';
  }
  var pendingSeek = null;
  au.addEventListener('loadedmetadata', function () {
    if (pendingSeek != null) au.currentTime = pendingSeek * au.duration;
    pendingSeek = null;
  });
  au.addEventListener('play', sync);
  au.addEventListener('pause', sync);
  au.addEventListener('ended', function () {
    var cards = $$('.grid .card'), i = cards.indexOf(cur);
    if (i > -1 && i < cards.length - 1) play(cards[i + 1]); else sync();   // сетка играет подряд, как альбом
  });
  au.addEventListener('timeupdate', function () {
    if (!cur || !au.duration) return;
    var p = au.currentTime / au.duration;
    cur.querySelector('[data-clip]').setAttribute('width', (p * 160).toFixed(2));
    cur.querySelector('[data-dur]').textContent = fmt(au.currentTime);
    $('[data-mini-bar]').style.width = p * 100 + '%';
  });
  $('[data-mini-btn]').addEventListener('click', function () { if (cur) play(cur); });

  // Перемотка: нажал и тянешь по полосе — песня едет следом.
  function scrubber(el, card) {
    var go = function (e) {
      var r = el.getBoundingClientRect(), c = card();
      if (c) play(c, clamp((e.clientX - r.left) / r.width, 0, 0.999));
    };
    el.addEventListener('pointerdown', function (e) {
      if (!card()) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); go(e);
      var mv = function (ev) { go(ev); };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', function up() {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
      });
    });
  }
  scrubber($('.mini__bar'), function () { return cur; });

  /* ---------- Карточки: волна песни вместо полоски ---------- */
  function bars(g, peaks, h) {
    peaks.forEach(function (p, i) {
      var r = document.createElementNS(NS, 'rect');
      var bh = Math.max(1.5, p * h);
      r.setAttribute('x', i + 0.18); r.setAttribute('width', 0.64);
      r.setAttribute('y', (h - bh) / 2); r.setAttribute('height', bh);
      g.appendChild(r);
    });
  }
  $$('.card').forEach(function (card) {
    var w = WAVES[card.dataset.song] || { peaks: [], dur: 0 };
    var svg = card.querySelector('[data-wave]');
    svg.setAttribute('viewBox', '0 0 160 24');
    var id = 'clip-' + card.dataset.song;
    svg.innerHTML = '<defs><clipPath id="' + id + '"><rect data-clip x="0" y="0" width="0" height="24"/></clipPath></defs>' +
      '<g class="base"></g><g class="played" clip-path="url(#' + id + ')"></g>';
    bars(svg.querySelector('.base'), w.peaks, 24);
    bars(svg.querySelector('.played'), w.peaks, 24);
    card.querySelector('[data-dur]').textContent = fmt(w.dur);
    card.querySelector('.strip__play').addEventListener('click', function () { play(card); });
    card.querySelector('.card__cover').addEventListener('click', function () { play(card); });
    card.querySelector('.card__cover').style.cursor = 'pointer';
    scrubber(svg, function () { return card; });
  });

  /* ---------- Слова проявляются при чтении ---------- */
  var words = $('[data-words]');
  if (words && hasGsap && !reduce) {
    words.innerHTML = words.textContent.trim().split(/\s+/).map(function (w) {
      return '<span class="w">' + w + '</span>';
    }).join(' ');
    // Не «вкл/выкл» по слову, а мягкая волна: каждое слово плавно набирает цвет,
    // проявление тянется на ~12 слов вперёд — резкой границы нет.
    var ws = $$('.w', words), WAVE = 12;
    var paint = function (p) {
      var head = p * (ws.length + WAVE);
      ws.forEach(function (w, i) {
        var x = clamp((head - i) / WAVE, 0, 1);
        w.style.opacity = (0.22 + 0.78 * x * x * (3 - 2 * x)).toFixed(3);
      });
    };
    paint(0);
    ScrollTrigger.create({
      trigger: words, start: 'top 85%', end: 'bottom 55%', scrub: 0.6,
      onUpdate: function (s) { paint(s.progress); }
    });
  }

  if (hasGsap && !reduce) {
    gsap.from('.grid .card', {
      y: 40, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: { each: 0.07, grid: [3, 3] },
      scrollTrigger: { trigger: '.grid', start: 'top 85%' }
    });
  }

  /* ================= ФОТО: КУРСОР-КИСТЬ ================= */
  // Курсор пишет по фото короткий мазок, как кисть Shygyrt: несколько волосков,
  // у каждого свой отступ и толщина, сухие волоски местами отрываются от бумаги.
  // Мазок — прорезь в грязи, сквозь неё светится тот же живой градиент, что в
  // комнате: в тишине — цвета грязи и жёлтый синт, под музыку — цвета обложки.
  // Мазок высыхает за пару секунд. Без мыши (телефон) кисть иногда проходит сама.
  var mx = -1, my = -1;
  addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { mx = e.clientX; my = e.clientY; } }, { passive: true });
  var hero = $('[data-hero]'), bOut = $('[data-brush-fx]'), bCtx = bOut && bOut.getContext('2d');
  var bMask = document.createElement('canvas'), bmCtx = bMask.getContext('2d');
  var bris = [], NBR = 11;
  for (var bi = 0; bi < NBR; bi++) bris.push({ o: (bi / (NBR - 1) - 0.5) * (1.1 + Math.random() * 0.3), w: 0.04 + Math.random() * 0.1, ph: Math.random() * 9 });
  var bx = -1, by = -1, bLive = 0, bAuto = 0, bW = 0, bH = 0, touch = matchMedia('(hover: none)').matches;
  function brushSeg(x0, y0, x1, y1, sp, now) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var size = (clamp(48 - sp * 0.35, 20, 46) + 8) * bW / 1400;   // быстрее ведёшь — тоньше и суше
    bmCtx.lineCap = 'round';
    bris.forEach(function (b) {
      var dry = Math.sin(now / 90 + b.ph) + Math.sin(now / 37 + b.ph * 2);   // волосок то касается, то нет
      if (dry < -0.5 + sp * 0.012) return;
      bmCtx.globalAlpha = 0.75 + 0.25 * Math.sin(b.ph);
      bmCtx.lineWidth = Math.max(1, size * b.w);
      bmCtx.beginPath();
      bmCtx.moveTo(x0 + nx * b.o * size, y0 + ny * b.o * size);
      bmCtx.lineTo(x1 + nx * b.o * size, y1 + ny * b.o * size);
      bmCtx.stroke();
    });
    bmCtx.globalAlpha = 1;
    bLive = now;
  }
  function brushFrame(now) {
    if (!fluid || !bOut) return;
    var r = hero.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    var W = Math.round(r.width), H = Math.round(r.height);
    if (W !== bW || H !== bH) {   // мазок мягкий, хватит половины разрешения
      bW = W; bH = H; bOut.width = bMask.width = Math.round(W / 2); bOut.height = bMask.height = Math.round(H / 2);
      bmCtx.setTransform(0.5, 0, 0, 0.5, 0, 0); bx = -1;
    }
    var tx = -1, ty = -1;
    if (mx >= 0 && my > r.top && my < r.bottom) { tx = mx - r.left; ty = my - r.top; }
    else if (touch && now - bAuto < 1400) {   // без мыши: короткий проход сам по себе
      var a = (now - bAuto) / 1400;
      tx = W * (0.15 + 0.7 * a); ty = H * (0.55 + 0.12 * Math.sin(a * 5 + bAuto));
    } else if (touch && now - bAuto > 6000) bAuto = now;
    if (tx >= 0) {
      if (bx >= 0) {
        var sp = Math.hypot(tx - bx, ty - by);
        if (sp > 1.5) brushSeg(bx, by, tx, ty, sp, now);
      }
      bx = tx; by = ty;
    } else bx = -1;
    if (now - bLive > 2600) { if (bLive) { bCtx.clearRect(0, 0, W, H); bmCtx.clearRect(0, 0, W, H); bLive = 0; } return; }
    // Высыхание: маска гаснет понемногу каждый кадр.
    bmCtx.globalCompositeOperation = 'destination-out';
    bmCtx.fillStyle = 'rgba(0,0,0,.022)'; bmCtx.fillRect(0, 0, W, H);
    bmCtx.globalCompositeOperation = 'source-over';
    bCtx.globalCompositeOperation = 'copy'; bCtx.drawImage(bMask, 0, 0);
    bCtx.globalCompositeOperation = 'source-in'; bCtx.drawImage(flat, 0, 0, bOut.width, bOut.height);
  }
  /* ================= ЭКВАЛАЙЗЕР ================= */
  // Показываем там, где на него смотрят: на обложке играющей песни и в мини-плеере
  // (он виден с любого места страницы). 24 полосы по октавам — слева бас, справа верх.
  // Каждая полоса меряется от своего недавнего пика, иначе громкий мастер давит
  // всё в потолок; вверх полоса прыгает быстро, вниз опадает плавно — так видно
  // и бочку, и мелодию, а не хаотичное дёргание.

  var NB = 24, bandsLo = [], bandsHi = [], bv = new Float32Array(NB), bpk = new Float32Array(NB).fill(0.2), bmean = new Float32Array(NB).fill(0.3);
  function setupBands() {
    var hz = actx.sampleRate / analyser.fftSize;
    for (var i = 0; i < NB; i++) {
      var f0 = 45 * Math.pow(12000 / 45, i / NB), f1 = 45 * Math.pow(12000 / 45, (i + 1) / NB);
      bandsLo[i] = Math.max(1, Math.floor(f0 / hz));
      bandsHi[i] = Math.max(bandsLo[i] + 1, Math.ceil(f1 / hz));
    }
  }
  function bandsStep() {
    if (!playing()) { for (var j = 0; j < NB; j++) bv[j] *= 0.88; return; }
    if (!bandsLo.length) setupBands();
    for (var i = 0; i < NB; i++) {
      var m = 0;
      for (var b = bandsLo[i]; b < bandsHi[i]; b++) if (freq[b] > m) m = freq[b];
      m /= 255;
      // Мастер сжат — полоса почти всегда у потолка. Смотрим, насколько она сейчас
      // выше своего среднего за пару секунд: так видны удары и движение мелодии.
      bmean[i] += (m - bmean[i]) * 0.02;
      bpk[i] = Math.max(m, bpk[i] * 0.995);
      var lo = bmean[i] * 0.9;
      var t = Math.pow(clamp((m - lo) / Math.max(bpk[i] - lo, 0.05), 0, 1), 1.3);
      t = 0.2 * m + 0.8 * t;
      bv[i] += (t - bv[i]) * (t > bv[i] ? 0.5 : 0.09);
    }
  }
  function drawBars(cv, color, alpha) {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    c.fillStyle = color; c.globalAlpha = alpha;
    var gap = W / NB, bw = gap * 0.5;
    for (var i = 0; i < NB; i++) {
      var h = Math.max(dpr * 2, bv[i] * H);
      c.fillRect(i * gap + (gap - bw) / 2, H - h, bw, h);
    }
  }
  var miniEq = $('[data-mini-eq]');
  function eqFrame() {
    bandsStep();
    if (cur) drawBars(miniEq, '#16151A', 1);
  }
  var bandAvg = function (a, b) { var m = 0; for (var i = a; i < b; i++) m += bv[i]; return m / (b - a); };

  /* ================= ЖИВОЙ ГРАДИЕНТ ИЗ ОБЛОЖКИ ================= */
  // Как анимированные обложки в Apple Music: пять размытых пятен цветов обложки
  // играющей песни плывут по фону и мягко дышат басом. Мелодия ускоряет течение,
  // а удар бочки не мигает, а подталкивает течение — пятна на миг плывут быстрее.
  // Визуализация одна на всю страницу: фоны полосы с DIRT, комнаты и письма, имя,
  // штриховка под словами и мазок по фото. В тишине она застывшая — как кадр, на
  // котором остановилась; любая песня её оживляет, пауза снова плавно замораживает.
  // Застывший кадр не перерисовывается — видеокарта отдыхает.
  // Считаем в половинном разрешении: картинка всё равно размытая.

  var PAPER = [0.933, 0.925, 0.902], INK = [0.086, 0.082, 0.102], RED = [0.91, 0.2, 0.12];
  // До первой песни — грязь с отливом: жёлтый синта, охра, ржавчина, болотный, синий с лёгким отливом в фиолет.
  var palNow = [[0.95, 0.76, 0.1], [0.78, 0.42, 0.12], [0.55, 0.2, 0.1], [0.35, 0.45, 0.18], [0.18, 0.27, 0.57]];
  var palTo = palNow.map(function (c) { return c.slice(); });

  // Пять самых заметных цветов обложки: насыщенные и разные по оттенку.
  // Обложка почти без цвета (DIRT — чёрная кисть на белом) дала бы серое пятно
  // на сером — для таких берём цвета сайта: красный, жёлтый, синий.
  var ACCENTS = [[0.91, 0.2, 0.12], [0.95, 0.76, 0.1], [0.17, 0.21, 0.91], [0.91, 0.2, 0.12], [0.95, 0.76, 0.1]];
  var ACCENT_COV = 'radial-gradient(circle at 25% 30%, #E8331F, transparent 60%), radial-gradient(circle at 75% 70%, #F2C21B, transparent 60%), radial-gradient(circle at 75% 25%, #1F3BE8, transparent 55%)';
  function glowPalette(img, card) {
    if (!img) return;
    var go = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 32;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
        var d = x.getImageData(0, 0, 32, 32).data, buckets = {};
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
          var h = 0;
          if (mx !== mn) h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
          var key = Math.floor(h * 2) + '-' + (mx > 0.5 ? 1 : 0);
          var w = 0.15 + sat * mx;
          var bk = buckets[key] || (buckets[key] = { w: 0, r: 0, g: 0, b: 0 });
          bk.w += w; bk.r += r * w; bk.g += g * w; bk.b += b * w;
        }
        var list = Object.keys(buckets).map(function (k) { var o = buckets[k]; return [o.r / o.w, o.g / o.w, o.b / o.w, o.w]; })
          .sort(function (a, b) { return b[3] - a[3]; });
        var satSum = 0;
        for (var j = 0; j < 5; j++) {
          var c5 = (list[j % list.length] || [0.2, 0.2, 0.2]);
          var hi = Math.max(c5[0], c5[1], c5[2]), lo = Math.min(c5[0], c5[1], c5[2]);
          satSum += hi ? (hi - lo) / hi : 0;
          palTo[j] = c5.slice(0, 3);
        }
        if (satSum / 5 < 0.18) {
          palTo = ACCENTS.map(function (c) { return c.slice(); });
          if (card) card.style.setProperty('--cov', ACCENT_COV);
        }
      } catch (e) {}
    };
    if (img.complete) go(); else img.addEventListener('load', go, { once: true });
  }

  function Glow(cv, base, strength, grain) {
    var g = null, u = {};
    var f = function (x) { return x.toFixed(3); };   // в GLSL «0» — целое, нужен «0.000»
    try { g = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false }); } catch (e) { g = null; }
    if (!g) return null;
    var vs = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
    var fs = [
      'precision mediump float;',
      'uniform vec2 res;uniform float t;uniform float kick;uniform float mid;uniform float on;',
      'uniform vec3 col[5];uniform vec3 pos[5];varying vec2 v;',
      'float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
      'void main(){',
      ' vec2 a=vec2(res.x/res.y,1.);vec2 uv=v;',
      ' uv+=.07*vec2(sin(uv.y*4.+t*.9),cos(uv.x*3.3-t*.7))*(.4+mid*1.2);',
      ' vec3 acc=vec3(0.);float ws=0.;',
      ' for(int i=0;i<5;i++){vec2 d=(uv-pos[i].xy)*a;float r=pos[i].z*(1.+kick*.45);float w=exp(-dot(d,d)/(r*r));acc+=col[i]*w;ws+=w;}',
      ' vec3 c=acc/max(ws,1e-3);',
      ' vec3 base=vec3(' + base.map(f).join(',') + ');',
      ' c=mix(base,c*(.8+.45*kick*on),clamp(ws,0.,1.)*(' + f(strength[0]) + '+' + f(strength[1]) + '*on));',
      ' vec2 q=v-.5;c=mix(c,base,clamp(dot(q,q)*' + f(strength[2]) + ',0.,1.));',
      ' c+=(hash(v*res+fract(t))-.5)*' + f(grain == null ? 0.03 : grain) + ';',
      ' gl_FragColor=vec4(c,1.);}'
    ].join('\n');
    function sh(type, src) {
      var o = g.createShader(type); g.shaderSource(o, src); g.compileShader(o);
      if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o));
      return o;
    }
    try {
      var prog = g.createProgram();
      g.attachShader(prog, sh(g.VERTEX_SHADER, vs));
      g.attachShader(prog, sh(g.FRAGMENT_SHADER, fs));
      g.linkProgram(prog); g.useProgram(prog);
      var buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), g.STATIC_DRAW);
      var loc = g.getAttribLocation(prog, 'p');
      g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      ['res', 't', 'kick', 'mid', 'on', 'col', 'pos'].forEach(function (n) { u[n] = g.getUniformLocation(prog, n); });
    } catch (e) { return null; }
    this.draw = function (state, w, h) {
      if (!w) {
        var rc = cv.getBoundingClientRect();
        if (rc.bottom < 0 || rc.top > innerHeight) return false;   // за экраном не рисуем
      }
      var W = Math.max(2, w || Math.round(cv.clientWidth * 0.5)), H = Math.max(2, h || Math.round(cv.clientHeight * 0.5));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; g.viewport(0, 0, W, H); }
      g.uniform2f(u.res, W, H);
      g.uniform1f(u.t, state.t);
      g.uniform1f(u.kick, state.kick);
      g.uniform1f(u.mid, state.mid);
      g.uniform1f(u.on, state.on);
      g.uniform3fv(u.col, state.cols);
      g.uniform3fv(u.pos, state.pos);
      g.drawArrays(g.TRIANGLES, 0, 6);
      return true;
    };
  }

  var mk = function (sel, base, str) { var o = reduce ? null : new Glow($(sel), base, str); return o && o.draw ? o : null; };
  var backs = [
    mk('[data-glow]', INK, [0.82, 0, 0.8]),           // комната: на тёмном
    mk('[data-glow-best]', PAPER, [0.52, 0, 0.5]),    // полоса с DIRT: на бумаге мягче — поверх текст
    mk('[data-glow-write]', RED, [0.5, 0, 0.75])      // письмо: на красном
  ].filter(Boolean);
  // Под словами три размытые кляксы-визуализации, у каждой свой цвет: тушь
  // (яркий ультрамарин), жёлтый синта, красный. Каждая — плоская и очень плавная:
  // сумма мягких гауссовых комков, без света и складок, чуть светлее к краю.
  // Ложатся как краски ризографа — умножением: на стыках синий с жёлтым дают
  // зелёный, жёлтый с красным — оранжевый. Сверху неподвижное зерно бумаги.
  // Холст прозрачный: на фото краска ложится мягким полупрозрачным краем.
  // Полоса заходит на фото, буквы под ним целиком лежат на краске.
  // Они шире слов и наползают друг на друга, по высоте — узкая полоса.
  // Течёт и раздувается под музыку, в тишине застывает, как всё остальное.
  function Skills(cv) {
    var g = null, u = {}, words = $$('.skills .word');
    // Прозрачность заранее умножена на цвет: без этого Safari белит фото под холстом.
    try { g = cv.getContext('webgl', { antialias: false }); } catch (e) {}
    if (!g) return;
    var fs = [
      'precision highp float;',
      'uniform vec2 res;uniform float t;uniform float kick;uniform vec2 ctr[3];uniform vec2 rad[3];uniform vec3 pal[6];uniform float op[3];varying vec2 v;',
      // Плотность капли: три мягких комка, которые медленно ходят относительно центра — форма неровная, но гладкая.
      'float dens(vec2 p,vec2 c,vec2 r,float s){float d=0.;',
      ' for(int k=0;k<3;k++){float fk=float(k);',
      '  vec2 o=r*vec2(.35*sin(t*(.31+.09*fk)+s*2.3+fk*2.1),.18*cos(t*(.27+.11*fk)+s*1.7+fk*1.4));',
      '  vec2 rr=r*vec2(.6+.08*sin(t*.4+fk+s),.75+.08*cos(t*.5+fk*1.7+s))*(1.+kick*.15);',
      '  vec2 q=(p-c-o)/rr;d+=exp(-dot(q,q));}',
      ' return d;}',
      'vec3 drop(vec2 p,int i,out float a){',
      ' vec2 c,r;vec3 core,rim;float o;',
      ' if(i==0){c=ctr[0];r=rad[0];core=pal[0];rim=pal[1];o=op[0];}',
      ' else if(i==1){c=ctr[1];r=rad[1];core=pal[2];rim=pal[3];o=op[1];}',
      ' else{c=ctr[2];r=rad[2];core=pal[4];rim=pal[5];o=op[2];}',
      ' float d=dens(p,c,r,float(i));',
      ' a=(1.-exp(-d*2.2))*o;',
      ' return mix(rim,core,smoothstep(.1,1.4,d));}',
      'void main(){',
      ' vec2 p=v*res;',
      ' vec3 c=vec3(1.);float a,A=1.;vec3 k;',
      ' k=drop(p,0,a);c*=mix(vec3(1.),k,a);A*=1.-a;',
      ' k=drop(p,1,a);c*=mix(vec3(1.),k,a);A*=1.-a;',
      ' k=drop(p,2,a);c*=mix(vec3(1.),k,a);A*=1.-a;',
      ' A=1.-A;c=clamp((c-(1.-A))/max(A,1e-3),0.,1.);',   // краски смешаны на белом, наружу — цвет и прозрачность
      ' c+=(fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)-.5)*.05;',   // зерно не двигается
      ' gl_FragColor=vec4(c*A,A);}'
    ].join('\n');
    var sh = function (type, src) { var o = g.createShader(type); g.shaderSource(o, src); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
    try {
      var prog = g.createProgram();
      g.attachShader(prog, sh(g.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));
      g.attachShader(prog, sh(g.FRAGMENT_SHADER, fs));
      g.linkProgram(prog); g.useProgram(prog);
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), g.STATIC_DRAW);
      var loc = g.getAttribLocation(prog, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      ['res', 't', 'kick', 'ctr', 'rad', 'pal', 'op'].forEach(function (n) { u[n] = g.getUniformLocation(prog, n); });
    } catch (e) { console.warn(e); return; }
    // Цвета капель — из той же цветомузыки, что на всей странице: синий, жёлтый и
    // ржавый из текущей палитры, чуть сочнее и разбавленные бумагой.
    var PICK = [4, 0, 2], PAPER3 = [0.933, 0.925, 0.902];
    var soft = function (c, k) {   // чуть сочнее цвет палитры, потом разбавить бумагой
      var l = (c[0] + c[1] + c[2]) / 3;
      return [0, 1, 2].map(function (j) { var v = Math.min(1, Math.max(0, l + (c[j] - l) * 1.25 + 0.06)); return v + (PAPER3[j] - v) * k; });
    };
    g.uniform1fv(u.op, [0.95, 0.95, 0.95]);
    this.draw = function (st) {
      var rc = cv.getBoundingClientRect();
      if (rc.bottom < 0 || rc.top > innerHeight || !rc.width) return false;
      var dpr = 0.5;   // капли размытые — половины разрешения хватает, видеокарте вчетверо легче
      var W = Math.round(rc.width * dpr), H = Math.round(rc.height * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; g.viewport(0, 0, W, H); }
      var c = [], r = [], row = words.length > 1 && Math.abs(words[0].getBoundingClientRect().top - words[1].getBoundingClientRect().top) < 10;
      words.forEach(function (w) {
        var q = w.getBoundingClientRect();
        c.push((q.left - rc.left + q.width / 2) * dpr, (rc.bottom - q.top - q.height * (row ? 0.38 : 0.5)) * dpr);   // в строку — полоса от низа фото до низа букв
        // В строку — капли широкие и заходят на соседей; столбиком на телефоне — высокие.
        r.push((row ? Math.max(q.width * 0.95, rc.width * 0.26) : rc.width * 0.55) * dpr,
               q.height * (row ? 0.62 : 0.38) * dpr);   // слова целиком на краске
      });
      g.uniform2f(u.res, W, H); g.uniform1f(u.t, st.t + 3.0); g.uniform1f(u.kick, st.kick);
      g.uniform2fv(u.ctr, c); g.uniform2fv(u.rad, r);
      var pal = [];
      PICK.forEach(function (i) { var col = st.cols.slice(i * 3, i * 3 + 3); pal.push.apply(pal, soft(col, 0.08).concat(soft(col, 0.38))); });
      g.uniform3fv(u.pal, pal);
      g.drawArrays(g.TRIANGLES, 0, 6);
      return true;
    };
  }
  var sk = reduce ? null : new Skills($('[data-glow-skills]'));
  if (sk && sk.draw) backs.push(sk);
  backs.forEach(function (g) { g.stale = true; });

  var gLast = performance.now(), gMid = 0, gT = 0, gLive = 0, gBass = 0, gDraw = true, gDirty = true;
  addEventListener('resize', function () { gDirty = true; backs.forEach(function (g) { g.stale = true; }); });
  function glowFrame(now) {
    var dt = Math.min(now - gLast, 50) / 1000; gLast = now;
    var on = playing();
    // Play — оживает быстро; пауза — течение плавно замедляется и застывает.
    gLive += ((on ? 1 : 0) - gLive) * (on ? 0.08 : 0.03);
    if (gLive < 0.002) gLive = 0;
    kick *= 0.94;
    var bass = on ? bandAvg(0, 4) : 0;
    gBass += (bass - gBass) * (bass > gBass ? 0.6 : 0.12);
    var mid = on ? bandAvg(8, 17) : 0;
    gMid += (mid - gMid) * 0.05;
    gT += dt * gLive * (0.37 + gMid * 1.4 + kick * 1.1);
    var moving = 0;
    for (var i = 0; i < 5; i++) for (var k = 0; k < 3; k++) {
      var d = palTo[i][k] - palNow[i][k]; palNow[i][k] += d * 0.04; moving = Math.max(moving, Math.abs(d));
    }
    // Рисуем, только если что-то меняется; иначе на экране остаётся застывший кадр.
    gDraw = gLive > 0 || moving > 0.003 || gBass > 0.003 || gDirty;
    gDirty = false;
    var cols = [], pos = [];
    for (i = 0; i < 5; i++) {
      cols.push(palNow[i][0], palNow[i][1], palNow[i][2]);
      pos.push(0.5 + 0.42 * Math.sin(gT * (0.7 + i * 0.23) + i * 1.7),
               0.5 + 0.42 * Math.cos(gT * (0.5 + i * 0.31) + i * 2.3),
               0.28 + 0.06 * Math.sin(gT * 0.9 + i));
    }
    var st = { t: gT, kick: gBass, mid: gMid, cols: cols, pos: pos, on: 1 };
    // Фон, пропущенный за экраном, дорисуем, когда до него долистают.
    backs.forEach(function (g) { if (gDraw || g.stale) g.stale = !g.draw(st); });
  }

  /* ================= ГРЯЗЬ, КОТОРАЯ СВЕТИТСЯ ================= */
  // Мазки кисти и штрихи — прорезь, сквозь неё видна та же визуализация, что на фонах:
  // имя, штриховка под словами, мазок курсора по фото. Считаем её в маленьком
  // холсте, каждая надпись — маска поверх.
  var fluidCv = document.createElement('canvas');
  var fluid = reduce ? null : new Glow(fluidCv, [0.62, 0.36, 0.12], [1, 0, 0], 0);   // между пятнами — тёплая охра
  if (fluid && !fluid.draw) fluid = null;
  var glowers = [], glowDirty = true;
  var flat = document.createElement('canvas'), flatCtx = flat.getContext('2d');
  // dark — притемнить под бумагу (имя); remask — пересобрать маску при новом размере.
  function glowText(cv, mask, ar, dark, src, remask) {
    glowers.push({ cv: cv, mask: mask, ar: ar, c: cv.getContext('2d'), dark: dark, src: src || { x: 0, y: 0, w: 1, h: 1 }, remask: remask });
  }
  function fluidFrame() {
    if (!fluid) return;
    if (!gDraw && !glowDirty) return;   // застыло — на экране остаётся последний кадр
    var cols = [], pos = [];
    for (var i = 0; i < 5; i++) {
      cols.push(palNow[i][0], palNow[i][1], palNow[i][2]);
      pos.push(0.5 + 0.45 * Math.sin(gT * 1.3 * (0.7 + i * 0.23) + i * 1.7),
               0.5 + 0.45 * Math.cos(gT * 1.3 * (0.5 + i * 0.31) + i * 2.3), 0.38);
    }
    fluid.draw({ t: gT * 1.5, kick: gBass, mid: gMid, on: 1, cols: cols, pos: pos }, 320, 140);
    // Кадр из WebGL забираем один раз в обычный холст: иначе каждая маска тянула бы его
    // из видеокарты отдельно. Этот же кадр берёт мазок по фото.
    if (flat.width !== 320) { flat.width = 320; flat.height = 140; }
    flatCtx.globalCompositeOperation = 'copy'; flatCtx.drawImage(fluidCv, 0, 0);
    glowDirty = false;
    var dpr = Math.min(devicePixelRatio || 1, 2), fw = flat.width, fh = flat.height;
    glowers.forEach(function (g) {
      // Размер холста — по вёрстке без трансформаций: имя в шапке сжимается масштабом.
      if (!g.W) {
        g.W = Math.round(g.cv.offsetWidth * dpr); g.H = Math.round(g.ar ? g.W * g.ar : g.cv.offsetHeight * dpr);
        if (g.remask) g.remask(g);
      }
      var W = g.W, H = g.H, c = g.c, sr = g.src;
      if (!W || !H) return;
      if (g.cv.width !== W || g.cv.height !== H) { g.cv.width = W; g.cv.height = H; }
      c.globalCompositeOperation = 'copy'; c.drawImage(g.mask, 0, 0, W, H);
      c.globalCompositeOperation = 'source-in';
      c.drawImage(flat, sr.x * fw, sr.y * fh, sr.w * fw, sr.h * fh, 0, 0, W, H);
      // Затемнение под бумагу — сразу в холст, а не CSS-фильтром (фильтр пересчитывался бы каждый кадр).
      if (g.dark) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(22,21,26,' + g.dark + ')'; c.fillRect(0, 0, W, H); }
    });
  }

  /* ---------- Шапка: имя слева, меню справа ---------- */
  // Шапка сразу маленькая и не меняется при прокрутке. Имя светится той же грязью,
  // что и всё остальное: каждая буква — своя маска, а градиент общий на всё слово.
  var bar = $('[data-bar]'), nameEl = $('[data-name]'), spacerImg = $('.name img');
  var letters = [];
  bar.classList.add('menu');
  function buildName(d) {
    var groups = {};
    d.strokes.forEach(function (st) { (groups[st.c] || (groups[st.c] = [])).push(st); });
    Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ch) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      var pts = function (a) { for (var i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); } };
      groups[ch].forEach(function (st) { st.b.forEach(function (b) { pts(b[1]); pts(b[2]); }); st.s.forEach(pts); });
      x0 = Math.floor(x0 - 2); y0 = Math.floor(y0 - 2); x1 = Math.ceil(x1 + 2); y1 = Math.ceil(y1 + 2);
      var mask = document.createElement('canvas'); mask.width = x1 - x0; mask.height = y1 - y0;
      var m = mask.getContext('2d'); m.translate(-x0, -y0); m.fillStyle = '#000';
      var poly = function (a, back) {
        for (var i = 0; i < a.length; i += 2) m.lineTo(a[i], a[i + 1]);
        if (back) for (i = back.length - 2; i >= 0; i -= 2) m.lineTo(back[i], back[i + 1]);
      };
      groups[ch].forEach(function (st) {
        st.b.forEach(function (b) { m.beginPath(); poly(b[1], b[2]); m.closePath(); m.fill(); });
        st.s.forEach(function (p) { m.beginPath(); poly(p); m.closePath(); m.fill(); });
      });
      var cv = document.createElement('canvas');
      cv.style.left = x0 / d.w * 100 + '%'; cv.style.top = y0 / d.h * 100 + '%';
      cv.style.width = (x1 - x0) / d.w * 100 + '%'; cv.style.height = (y1 - y0) / d.h * 100 + '%';
      nameEl.appendChild(cv);
      glowText(cv, mask, 0, 0.34, { x: x0 / d.w, y: y0 / d.h, w: (x1 - x0) / d.w, h: (y1 - y0) / d.h });
      letters.push(cv);
    });
    nameEl.classList.add('is-letters');
    barMeasure();
  }
  // Имя в шапке ровно там, где h1 держит под него место.
  function barMeasure() {
    var r = spacerImg.getBoundingClientRect();
    nameEl.style.width = r.width + 'px'; nameEl.style.height = r.height + 'px';
    nameEl.style.transform = 'translate3d(' + r.left.toFixed(1) + 'px,' + (r.top + scrollY).toFixed(1) + 'px,0)';
    glowers.forEach(function (g) { g.W = 0; }); glowDirty = true;
    barSync();
  }
  function barSync() { bar.classList.toggle('is-small', scrollY > 0); }
  addEventListener('scroll', barSync, { passive: true });
  addEventListener('resize', barMeasure);
  addEventListener('load', barMeasure);
  if (spacerImg.complete) barMeasure(); else spacerImg.addEventListener('load', barMeasure, { once: true });
  fetch('brush/name.json').then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) { if (fluid) buildName(d); }, function () {});

  /* ---------- Главный цикл ---------- */
  (function frame(now) {
    readLevel(now);
    eqFrame(); glowFrame(now); fluidFrame(); brushFrame(now);
    requestAnimationFrame(frame);
  })(performance.now());

  /* ---------- Форма ---------- */
  var form = $('[data-form]');
  if (form) {
    var note = form.querySelector('[data-note]'), btn = form.querySelector('[data-submit]');
    var say = function (t, c) { note.textContent = t; note.className = 'form__note ' + (c || ''); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      ['name', 'email', 'subject', 'message'].forEach(function (n) {
        var el = form.elements[n]; el.classList.remove('is-bad');
        if (!el.value.trim()) { el.classList.add('is-bad'); bad.push(el); }
      });
      if (bad.length) { say('Заполните отмеченные поля.', 'is-err'); bad[0].focus(); return; }
      btn.disabled = true; var was = btn.textContent; btn.textContent = 'Отправляю…'; say('', '');
      // Письмо уходит через formsubmit.co — сервер сайту не нужен. Ответ: { success: "true" }.
      form.elements._subject.value = 'Сайт: ' + form.elements.subject.value.trim();
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { throw new Error('bad'); }); })
        .then(function (d) {
          if (d && String(d.success) === 'true') { form.reset(); say('Письмо ушло. Отвечу, как только прочитаю.', 'is-ok'); }
          else throw new Error('bad');
        })
        .catch(function () { say('Отправить не вышло. Напишите на da-scoo@ya.ru или в телеграм — так точно дойдёт.', 'is-err'); })
        .finally(function () { btn.disabled = false; btn.textContent = was; });
    });
  }
})();
