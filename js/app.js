/* Площадки, плеер в сетке, форма, появление блоков. Без зависимостей. */
(function () {
  'use strict';

  /* ---------- Переключатель площадок ---------- */

  var plat = document.querySelector('.tabs');
  if (plat) {
    var links = document.querySelectorAll('[data-track]');
    var names = { ya: 'Яндекс Музыке', sp: 'Spotify', yt: 'YouTube' };

    apply('ya');

    plat.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-plat]');
      if (!btn) return;
      plat.querySelectorAll('[data-plat]').forEach(function (b) {
        b.classList.toggle('is-on', b === btn);
      });
      apply(btn.dataset.plat);
    });

    function apply(key) {
      links.forEach(function (el) {
        var href = el.dataset[key];
        // Ссылки на площадку ещё нет — строку не превращаем в битую ссылку.
        if (!href || href === '#') {
          el.removeAttribute('href');
          el.setAttribute('aria-disabled', 'true');
        } else {
          el.href = href;
          el.removeAttribute('aria-disabled');
          el.target = '_blank';
          el.rel = 'noopener';
        }
      });
      plat.setAttribute('data-current', names[key] || '');
    }
  }

  /* ---------- Плеер в сетке ---------- */

  // Один Audio на всю страницу: включил другую песню — первая замолкает.
  // Файл не грузится, пока не нажали play.
  var cards = document.querySelectorAll('[data-audio]');
  if (cards.length) {
    var au = new Audio();
    au.preload = 'none';
    var cur = null;

    var fmt = function (s) {
      if (!isFinite(s)) return '0:00';
      var sec = Math.floor(s % 60);
      return Math.floor(s / 60) + ':' + (sec < 10 ? '0' : '') + sec;
    };
    var part = function (c, sel) { return c.querySelector(sel); };

    cards.forEach(function (c) {
      part(c, '.strip__play').addEventListener('click', function () {
        if (cur === c) { au.paused ? au.play() : au.pause(); return; }
        if (cur) {
          cur.classList.remove('is-play');
          part(cur, '.strip__play').textContent = '▶';
          part(cur, '.strip__bar').style.width = 0;
          part(cur, '.strip__time').textContent = '0:00';
        }
        cur = c;
        au.src = c.dataset.audio;
        au.play();
      });
      part(c, '.strip__track').addEventListener('click', function (e) {
        if (cur !== c || !au.duration) return;
        au.currentTime = e.offsetX / e.currentTarget.clientWidth * au.duration;
      });
    });

    au.addEventListener('play', sync);
    au.addEventListener('pause', sync);
    au.addEventListener('ended', sync);
    au.addEventListener('timeupdate', function () {
      if (!cur) return;
      part(cur, '.strip__bar').style.width = (au.currentTime / au.duration * 100 || 0) + '%';
      part(cur, '.strip__time').textContent = fmt(au.currentTime);
    });

    function sync() {
      if (!cur) return;
      cur.classList.toggle('is-play', !au.paused);
      part(cur, '.strip__play').textContent = au.paused ? '▶' : '❚❚';
    }
  }

  /* ---------- Форма ---------- */

  // Почта собирается из кусков уже в браузере: в коде страницы целого адреса нет,
  // и боты, которые ищут адреса для спама, его не найдут.
  var MAIL = ['da-scoo', 'ya.ru'].join('@');
  document.querySelectorAll('[data-mail]').forEach(function (a) { a.href = 'mailto:' + MAIL; a.textContent = MAIL; });

  var form = document.querySelector('[data-form]');
  if (form) initForm(form);

  function initForm(f) {
    var note = f.querySelector('[data-note]');
    var btn = f.querySelector('[data-submit]');
    var typed = 0;   // когда начали печатать: бот заполняет форму мгновенно, человек — нет
    f.addEventListener('input', function () { typed = typed || Date.now(); });

    f.addEventListener('submit', function (e) {
      e.preventDefault();

      var bad = [];
      ['name', 'email', 'subject', 'message'].forEach(function (n) {
        var el = f.elements[n];
        el.classList.remove('is-bad');
        if (!el.value.trim()) { el.classList.add('is-bad'); bad.push(el); }
      });

      if (bad.length) {
        say('Заполните отмеченные поля.', 'is-err');
        bad[0].focus();
        return;
      }

      // Слишком быстро или вообще без набора — бот: делаем вид, что ушло, и не шлём.
      if (!typed || Date.now() - typed < 3000) {
        f.reset();
        say('Письмо ушло. Отвечу, как только прочитаю.', 'is-ok');
        return;
      }

      btn.disabled = true;
      var was = btn.textContent;
      btn.textContent = 'Отправляю…';
      say('', '');

      // Письмо уходит через formsubmit.co — сервер сайту не нужен. Ответ: { success: "true" }.
      f.elements._subject.value = 'Сайт: ' + f.elements.subject.value.trim();
      fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { throw new Error('bad'); }); })
        .then(function (d) {
          if (d && String(d.success) === 'true') {
            f.reset();
            say('Письмо ушло. Отвечу, как только прочитаю.', 'is-ok');
          } else {
            throw new Error((d && d.error) || 'bad');
          }
        })
        .catch(function () {
          say('Отправить не вышло. Напишите на ' + MAIL + ' или в телеграм — так точно дойдёт.', 'is-err');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = was;
        });
    });

    function say(text, cls) {
      note.textContent = text;
      note.className = 'form__note ' + (cls || '');
    }
  }

  /* ---------- Появление блоков ---------- */

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      'IntersectionObserver' in window) {
    var items = document.querySelectorAll('.hero, .best, .grid, .form');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px' });

    items.forEach(function (el) { el.classList.add('rise'); io.observe(el); });
  }
})();
