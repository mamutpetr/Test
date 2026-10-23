import { MagnetEngine, MagnetModel } from './magnet.js';

const engine = new MagnetEngine();
const $ = (id) => document.getElementById(id);

const ui = {
  canvas: $('field'),
  status: $('status'),
  title: $('title'),
  arrow: $('arrow'),
  go: document.querySelector('.go'),
  value: $('value'),
  bar: $('bar'),
  meterLabel: $('meter-label'),
  source: $('source'),
  train: $('train'),
  calib: $('calib'),
  polarity: $('polarity'),
  debug: $('debug'),
  hint: $('hint'),
  debugLayer: $('debug-layer'),
  cross: $('cross'),
  debugText: $('debug-text'),
};

const SOURCE_NAMES = { magnetometer: 'Магнітометр', compass: 'Компас', touch: 'Палець' };
const isTouchDevice = matchMedia('(pointer: coarse)').matches;

// --- Літери заголовка: кожна тягнеться до магніту окремо --------------------------------

function splitLetters(el) {
  const text = el.textContent.trim();
  el.textContent = '';
  el.setAttribute('aria-label', text);
  text.split(' ').forEach((word, i, words) => {
    const w = document.createElement('span');
    w.className = 'word';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'ch';
      c.textContent = ch;
      w.append(c);
    }
    el.append(w);
    if (i < words.length - 1) el.append(' ');
  });
}
splitLetters(ui.title);

const letters = [...ui.title.querySelectorAll('.ch')].map((el) => ({ el, pull: 9, reach: 120, tx: 0, ty: 0, rot: true }));
const magnets = [...document.querySelectorAll('.mag')].map((el) => ({
  el,
  pull: Number(el.dataset.pull || 14),
  reach: Number(el.dataset.reach || 200),
  glow: el.classList.contains('glow'),
  tx: 0,
  ty: 0,
}));

// --- Кадр ---------------------------------------------------------------------------------

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let wasClose = false;
let lastText = 0;
let lastFix = 0;

function influence(r, cx, cy, reach) {
  const d = Math.hypot(r.x * innerWidth - cx, r.y * innerHeight - cy) / reach;
  return r.strength / (1 + d * d);
}

function frame(now) {
  const r = engine.tick();
  const mx = r.x * innerWidth;
  const my = r.y * innerHeight;
  const motion = reduceMotion ? 0.3 : 1;

  // Знак z підказує, який полюс дивиться на телефон.
  const pole = r.source === 'magnetometer' && r.delta[2] < 0 ? 'var(--south)' : 'var(--north)';
  document.documentElement.style.setProperty('--pole', pole);

  // Спершу читаємо всі розміри, потім пишемо стилі — без зайвих перерахунків макета.
  const items = [...magnets, ...letters];
  const rects = items.map((m) => m.el.getBoundingClientRect());
  items.forEach((m, i) => {
    const rect = rects[i];
    const cx = rect.left + rect.width / 2 - m.tx;
    const cy = rect.top + rect.height / 2 - m.ty;
    const k = influence(r, cx, cy, m.reach);
    const dx = mx - cx;
    const dy = my - cy;
    const d = Math.hypot(dx, dy) || 1;
    m.tx = (dx / d) * m.pull * k * motion;
    m.ty = (dy / d) * m.pull * k * motion;
    const tilt = m.rot ? Math.max(-14, Math.min(14, (dx / d) * 14 * k)) * motion : 0;
    m.el.style.transform = `translate(${m.tx.toFixed(2)}px, ${m.ty.toFixed(2)}px) scale(${(1 + 0.05 * k * motion).toFixed(4)}) rotate(${tilt.toFixed(2)}deg)`;
    if (m.glow) {
      m.el.style.setProperty('--glow', Math.min(1, k * 1.5).toFixed(3));
      m.el.style.setProperty('--gx', `${(mx - rect.left).toFixed(1)}px`);
      m.el.style.setProperty('--gy', `${(my - rect.top).toFixed(1)}px`);
    }
    if (m.el === ui.go) {
      const weight = Math.min(1, k * 2.5);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      ui.arrow.style.transform = `rotate(${(angle * weight).toFixed(1)}deg)`;
      // Легкий «клац», коли магніт підходить до кнопки (Android).
      const close = k > 0.55;
      if (close && !wasClose) navigator.vibrate?.(15);
      wasClose = close;
    }
  });

  drawField(r, mx, my);

  if (now - lastText > 100) {
    lastText = now;
    renderText(r);
  }
  if (!ui.debugLayer.hidden) renderDebug(r, mx, my);
  if (now - lastFix > 500) {
    lastFix = now;
    renderFix(r);
  }
  requestAnimationFrame(frame);
}

// --- «Ошурки» на фоні ---------------------------------------------------------------------

const ctx = ui.canvas.getContext('2d');
const css = getComputedStyle(document.documentElement);
const rgb = { north: css.getPropertyValue('--north').trim(), south: css.getPropertyValue('--south').trim() };

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ui.canvas.width = Math.round(innerWidth * dpr);
  ui.canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function drawField(r, mx, my) {
  const w = innerWidth;
  const h = innerHeight;
  ctx.clearRect(0, 0, w, h);
  const color = r.source === 'magnetometer' && r.delta[2] < 0 ? rgb.south : rgb.north;

  if (r.strength > 0.01) {
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 240);
    g.addColorStop(0, `rgb(${color} / ${0.32 * r.strength})`);
    g.addColorStop(1, `rgb(${color} / 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const step = 24;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const k = influence(r, x, y, 150);
      const dx = mx - x;
      const dy = my - y;
      const d = Math.hypot(dx, dy) || 1;
      const half = (1.4 + 11 * k) / 2;
      ctx.strokeStyle = k > 0.02 ? `rgb(${color} / ${(0.1 + 0.75 * k).toFixed(3)})` : 'rgb(140 145 165 / 0.13)';
      ctx.beginPath();
      ctx.moveTo(x - (dx / d) * half, y - (dy / d) * half);
      ctx.lineTo(x + (dx / d) * half, y + (dy / d) * half);
      ctx.stroke();
    }
  }
}

// --- Тексти: статус, шкала, підказка ------------------------------------------------------

function renderText(r) {
  const name = SOURCE_NAMES[r.source];
  let status = 'Датчик вимкнено';
  if (r.source === 'touch') status = isTouchDevice ? 'Палець' : 'Миша';
  else if (r.source && r.calibrating) status = 'Калібрування…';
  else if (r.source && r.present) status = `${name} · ${Math.round(r.magnitude)} ${r.unit}`;
  else if (r.source) status = `${name} · магніту немає`;
  ui.status.textContent = status;
  ui.status.classList.toggle('live', !!r.present);

  ui.bar.style.width = `${(r.strength * 100).toFixed(1)}%`;
  if (r.source === 'magnetometer') {
    ui.meterLabel.textContent = 'Поле магніту (Земля ≈ 50 µT)';
    ui.value.textContent = `${Math.round(r.magnitude)} µT`;
  } else if (r.source === 'compass') {
    ui.meterLabel.textContent = 'Відхилення компаса';
    ui.value.textContent = `${Math.round(r.magnitude)}°`;
  } else {
    ui.meterLabel.textContent = 'Сила «магніту»';
    ui.value.textContent = `${Math.round(r.strength * 100)}%`;
  }

  const sensor = r.source === 'magnetometer' || r.source === 'compass';
  const trained = sensor && engine.model.trained;
  ui.source.textContent = sensor ? 'Пальцем' : 'Увімкнути датчик';
  ui.source.classList.toggle('primary', !sensor);
  ui.train.disabled = !sensor;
  ui.calib.disabled = !sensor;
  ui.polarity.hidden = !sensor || trained;
  ui.train.classList.toggle('primary', sensor && !trained);

  let hint;
  if (!r.source) hint = 'Натисніть «Увімкнути датчик», покладіть телефон на стіл і візьміть магніт.';
  else if (r.source === 'touch') {
    hint = isTouchDevice
      ? 'Датчик недоступний, тож магніт — ваш палець: ведіть ним по екрану. Як увімкнути справжній датчик — нижче.'
      : 'На комп\'ютері магнітометра немає: ведіть мишею. Відкрийте сторінку на телефоні.';
  } else if (trained) {
    hint = `Модель навчена (${engine.model.samples.length} зразків). Водіть магнітом біля телефона.`;
  } else {
    hint = r.source === 'compass'
      ? 'Режим компаса: бачить лише напрям, тож неточний. Натисніть «Навчити» — стане краще.'
      : 'Працює приблизний режим. Натисніть «Навчити» і покажіть магніт у 9 точках.';
  }
  ui.hint.textContent = hint;
}

// --- Чому магніт не видно і як це виправити -------------------------------------------------

const UA = navigator.userAgent;
const env = {
  android: /Android/i.test(UA),
  ios: /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  samsung: /SamsungBrowser/i.test(UA),
  inApp: /; wv\)|FBAN|FBAV|Instagram|Barcelona|Telegram/i.test(UA),
};
const fix = {
  box: $('fix'),
  title: $('fix-title'),
  body: $('fix-body'),
  steps: $('fix-steps'),
  flag: $('flag-row'),
  diag: $('diag'),
};

function renderFix(r) {
  const s = engine.stats;
  fix.diag.textContent =
    `Діагностика · джерело: ${r.source ?? '—'} · Magnetometer API: ${s.magnetometerApi.join(', ') || 'немає'}` +
    `${s.magnetometerError ? ` (${s.magnetometerError})` : ''} · компас: ${s.compassEvents} · гіроскоп: ${s.orientationEvents}`;

  let title = null;
  let body = '';
  let flagSteps = false;
  if (r.source === 'magnetometer' || !r.source) {
    title = null;
  } else if (env.ios) {
    title = 'На iPhone магнітометр недоступний';
    body = 'Safari і інші браузери на iPhone не дають сайтам доступ до магнітометра. Лишається компас, ' +
      'а він на магніт майже не реагує. Відкрийте сторінку на Android у Chrome.';
  } else if (env.android && (env.samsung || env.inApp)) {
    title = 'Відкрийте сторінку в Google Chrome';
    body = `${env.samsung ? 'Samsung Internet' : 'Вбудований браузер застосунку'} не дає доступ до магнітометра. ` +
      'Скопіюйте адресу цієї сторінки, відкрийте її в Chrome і ввімкніть прапорець:';
    flagSteps = true;
  } else if (env.android && s.magnetometerApi.length && s.magnetometerError) {
    title = 'Chrome не дав доступ до магнітометра';
    body = 'Натисніть значок ліворуч від адреси → Дозволи (Налаштування сайту) → «Датчики руху» → Дозволити, ' +
      'потім перезавантажте сторінку.';
  } else if (env.android) {
    title = 'Увімкніть магнітометр у Chrome';
    body = 'Без цього сторінка бачить лише компас Android, а він ігнорує сильні поля, тож магніт поруч не помічає. ' +
      'Chrome дає доступ до магнітометра після одного прапорця:';
    flagSteps = true;
  }

  fix.box.hidden = !title;
  if (!title) return;
  fix.title.textContent = title;
  fix.body.textContent = body;
  fix.steps.hidden = !flagSteps;
  fix.flag.hidden = !flagSteps;
}

$('copy').addEventListener('click', (e) => {
  const text = $('flag-url').textContent;
  const done = () => (e.target.textContent = 'Скопійовано');
  const fallback = () => getSelection().selectAllChildren($('flag-url'));
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
});

function renderDebug(r, mx, my) {
  ui.cross.hidden = !r.present;
  ui.cross.style.left = `${mx}px`;
  ui.cross.style.top = `${my}px`;
  const f = (v) => v.toFixed(1).padStart(7);
  ui.debugText.textContent =
    `джерело  ${r.source ?? '—'}\n` +
    `Δ        ${r.delta.map(f).join(' ')}\n` +
    `|Δ|      ${r.magnitude.toFixed(1)} ${r.unit}\n` +
    `сила     ${r.strength.toFixed(2)}\n` +
    `позиція  ${r.x.toFixed(2)}, ${r.y.toFixed(2)}`;
}

// --- Кнопки --------------------------------------------------------------------------------

async function startSensors(preferTouch = false) {
  const source = await engine.start({ preferTouch });
  if (source !== 'touch') navigator.wakeLock?.request('screen').catch(() => {});
}

ui.source.addEventListener('click', () => {
  const sensor = engine.source === 'magnetometer' || engine.source === 'compass';
  startSensors(sensor);
});
ui.calib.addEventListener('click', () => engine.recalibrate());
ui.polarity.addEventListener('click', () => engine.flipPolarity());
ui.debug.addEventListener('click', () => {
  ui.debugLayer.hidden = !ui.debugLayer.hidden;
  ui.debug.setAttribute('aria-pressed', String(!ui.debugLayer.hidden));
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('email');
  if (!email.value.includes('@')) {
    email.focus();
    return;
  }
  email.value = '';
  $('thanks').hidden = false;
});

// --- Навчання: показати магніт у 9 точках ---------------------------------------------------

const TARGETS = [
  [0.5, 0.12], [0.88, 0.12], [0.88, 0.5], [0.88, 0.88],
  [0.5, 0.88], [0.12, 0.88], [0.12, 0.5], [0.12, 0.12], [0.5, 0.5],
];
const SAMPLES_PER_TARGET = 12;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const training = {
  overlay: $('training'),
  target: $('target'),
  title: $('t-title'),
  body: $('t-body'),
  start: $('t-start'),
  cancel: $('t-cancel'),
  run: 0,
};

function say(title, body) {
  training.title.textContent = title;
  training.body.textContent = body;
}

ui.train.addEventListener('click', () => {
  training.run++;
  training.overlay.hidden = false;
  training.target.hidden = true;
  training.start.hidden = false;
  training.start.textContent = 'Почати';
  training.cancel.textContent = 'Скасувати';
  say(
    'Навчання',
    'Покладіть телефон на стіл і приберіть магніт. Потім підносьте магніт до кожної позначки ' +
      '(над екраном або збоку біля краю) і тримайте, поки коло не заповниться. Тримайте магніт ' +
      'однією стороною до телефона.',
  );
});

training.cancel.addEventListener('click', () => {
  training.run++;
  training.overlay.hidden = true;
});

training.start.addEventListener('click', async () => {
  if (training.start.textContent !== 'Почати') {
    training.overlay.hidden = true;
    return;
  }
  const run = ++training.run;
  const alive = () => run === training.run;
  training.start.hidden = true;
  const profile = engine.profile;
  const holdAt = profile.on * 1.2;
  const removedAt = profile.off * 0.8;

  say('Вимірюю фон…', 'Не рухайте телефон.');
  engine.recalibrate();
  while (engine.reading.calibrating) {
    await nextFrame();
    if (!alive()) return;
  }

  const samples = [];
  for (const [i, [tx, ty]] of TARGETS.entries()) {
    const label = `Точка ${i + 1} з ${TARGETS.length}`;
    training.target.hidden = false;
    training.target.style.left = `${tx * 100}%`;
    training.target.style.top = `${ty * 100}%`;
    training.target.style.setProperty('--p', 0);
    training.target.classList.remove('holding');

    say(label, 'Приберіть магніт подалі.');
    while (engine.reading.magnitude > removedAt) {
      await nextFrame();
      if (!alive()) return;
    }

    say(label, 'Піднесіть магніт до позначки.');
    const collected = [];
    let heldSince = -1;
    let lastSample = 0;
    while (collected.length < SAMPLES_PER_TARGET) {
      const now = await nextFrame();
      if (!alive()) return;
      const r = engine.reading;
      if (r.magnitude < holdAt) {
        // Магніт відійшов — починаємо точку заново, щоб вчитися лише на спокійному утриманні.
        if (heldSince >= 0) say(label, 'Піднесіть магніт до позначки.');
        heldSince = -1;
        collected.length = 0;
        training.target.classList.remove('holding');
      } else {
        if (heldSince < 0) {
          heldSince = now;
          say(label, 'Тримайте…');
          training.target.classList.add('holding');
        }
        if (now - heldSince > 300 && now - lastSample > 80) {
          collected.push([...r.delta]);
          lastSample = now;
        }
      }
      training.target.style.setProperty('--p', collected.length / SAMPLES_PER_TARGET);
    }
    for (const d of collected) samples.push({ d, x: tx, y: ty });
    navigator.vibrate?.(30);
  }

  engine.setModel(new MagnetModel(samples));
  training.target.hidden = true;
  say('Готово!', 'Модель навчена. Тепер сторінка знає, де ваш магніт.');
  training.start.hidden = false;
  training.start.textContent = 'Спробувати';
  training.cancel.textContent = 'Закрити';
});

// --- Старт ---------------------------------------------------------------------------------

// iPhone дає доступ до орієнтації лише після натискання, тож там чекаємо на кнопку.
const needsGesture = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
if (needsGesture) {
  engine.start({ preferTouch: true });
} else {
  startSensors();
}
requestAnimationFrame(frame);
