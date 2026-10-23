// Магнітне поле → позиція магніту на екрані.
//
// Джерела даних, від найточнішого:
//  1. Magnetometer (Generic Sensor API) — повний вектор поля в µT. У Chrome на Android
//     вмикається прапорцем chrome://flags/#enable-generic-sensor-extra-classes.
//  2. Компас (deviceorientationabsolute / webkitCompassHeading) — лише напрям
//     горизонтального поля, зате працює без прапорців і на iPhone.
//  3. Палець або миша — «віртуальний магніт», щоб ефект було видно будь-де.
//
// Координати пристрою як в Android і W3C: x — праворуч, y — до верху телефона,
// z — з екрана на вас.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
  const l = length(a);
  return l < 1e-6 ? [0, 0, 0] : scale(a, 1 / l);
};
const distSq = (a, b) => {
  const d = sub(a, b);
  return d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
};
const rad = (deg) => (deg * Math.PI) / 180;

/** Матриця повороту пристрій → світ із кутів deviceorientation (W3C: Rz(α)·Rx(β)·Ry(γ)). */
export function rotationFromEuler(alpha, beta, gamma) {
  const cA = Math.cos(rad(alpha)), sA = Math.sin(rad(alpha));
  const cB = Math.cos(rad(beta)), sB = Math.sin(rad(beta));
  const cG = Math.cos(rad(gamma)), sG = Math.sin(rad(gamma));
  return [
    cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG,
  ];
}

export function toWorld(r, v) {
  if (!r) return v;
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}

export function toDevice(r, v) {
  if (!r) return v;
  return [
    r[0] * v[0] + r[3] * v[1] + r[6] * v[2],
    r[1] * v[0] + r[4] * v[1] + r[7] * v[2],
    r[2] * v[0] + r[5] * v[1] + r[8] * v[2],
  ];
}

/**
 * Фон: поле Землі + власне поле телефона. Поле Землі зберігається у світових координатах
 * і повертається назад через гіроскоп, тому поворот телефона не схожий на магніт.
 */
export class Baseline {
  earth = null;
  bias = [0, 0, 0];

  get ready() {
    return this.earth !== null;
  }

  reset(raw, bias, rotation) {
    this.bias = bias;
    this.earth = toWorld(rotation, sub(raw, bias));
  }

  clear() {
    this.earth = null;
  }

  delta(raw, rotation) {
    return sub(raw, add(toDevice(rotation, this.earth), this.bias));
  }

  adapt(raw, rotation, alpha) {
    this.earth = lerp(this.earth, toWorld(rotation, sub(raw, this.bias)), alpha);
  }
}

/**
 * Маленька модель: ядерний k-найближчих сусідів від вектора поля до точки на екрані.
 * Навчається на самому телефоні. Напрям поля каже, де магніт, а сила — наскільки близько.
 */
export class MagnetModel {
  static MIN_SAMPLES = 4;

  constructor(samples = []) {
    this.samples = samples; // [{d: [x,y,z], x, y}]
  }

  get trained() {
    return this.samples.length >= MagnetModel.MIN_SAMPLES;
  }

  predict(delta) {
    const m = length(delta);
    if (!this.trained || m < 1e-3) return null;
    const dir = normalize(delta);
    const logM = Math.log(m);
    const scored = this.samples
      .map((s) => {
        const dirDist = distSq(dir, normalize(s.d));
        const magDist = (logM - Math.log(Math.max(length(s.d), 1e-3))) ** 2;
        return { s, w: Math.exp(-dirDist / 0.18 - magDist / 1.62) };
      })
      .sort((a, b) => b.w - a.w)
      .slice(0, 5);
    const total = scored.reduce((acc, e) => acc + e.w, 0);
    if (total < 1e-12) return { x: scored[0].s.x, y: scored[0].s.y };
    let x = 0, y = 0;
    for (const { s, w } of scored) {
      x += s.x * w;
      y += s.y * w;
    }
    return { x: x / total, y: y / total };
  }

  toJSON() {
    return this.samples.map((s) => [...s.d.map((v) => +v.toFixed(2)), +s.x.toFixed(3), +s.y.toFixed(3)]);
  }

  static fromJSON(rows) {
    if (!Array.isArray(rows)) return new MagnetModel();
    return new MagnetModel(
      rows
        .filter((r) => Array.isArray(r) && r.length === 5 && r.every(Number.isFinite))
        .map((r) => ({ d: r.slice(0, 3), x: r[3], y: r[4] })),
    );
  }

  /**
   * Без навчання: горизонтальна частина поля дивиться вздовж лінії між магнітометром
   * (зазвичай угорі телефона) і магнітом. Знак залежить від полюса — звідси polarity.
   */
  static heuristic(delta, strength, polarity) {
    const angle = Math.atan2(-delta[1] * polarity, delta[0] * polarity);
    const reach = 0.55 - 0.4 * strength;
    return { x: 0.5 + Math.cos(angle) * reach, y: 0.2 + Math.sin(angle) * reach * 1.6 };
  }
}

/** Пороги для кожного джерела: µT у магнітометра, «умовні µT» у компаса. */
export const PROFILES = {
  // Невеликий магнітик за кілька сантиметрів дає лише 10–30 µT, тож поріг низький.
  magnetometer: { on: 12, off: 7, quiet: 3.5, min: 6, max: 800, unit: 'µT' },
  compass: { on: 3, off: 1.8, quiet: 0.8, min: 2.5, max: 45, unit: '°' },
  touch: { on: 0.5, off: 0.5, quiet: 0, min: 0, max: 1, unit: '' },
};

/** Гістерезис, сила, оцінка позиції та згладжування — однаково для всіх датчиків. */
export class Tracker {
  present = false;
  strength = 0;
  x = 0.5;
  y = 0.5;

  constructor(profile) {
    this.profile = profile;
  }

  update(delta, model, polarity) {
    const p = this.profile;
    const m = length(delta);
    const wasPresent = this.present;
    this.present = m > (this.present ? p.off : p.on);
    const target = this.present
      ? Math.min(1, Math.max(0, Math.log(m / p.min) / Math.log(p.max / p.min)))
      : 0;
    this.strength += (target - this.strength) * (target > this.strength ? 0.35 : 0.08);
    if (this.present) {
      const pos = model.predict(delta) ?? MagnetModel.heuristic(delta, target, polarity);
      if (wasPresent) {
        this.x += (pos.x - this.x) * 0.3;
        this.y += (pos.y - this.y) * 0.3;
      } else {
        this.x = pos.x;
        this.y = pos.y;
      }
    }
    return m;
  }
}

const WARMUP = 25;
const EARTH_UT = 25; // типова горизонтальна складова поля Землі в Україні ≈ 20–25 µT

/**
 * Збирає все докупи. Після start() у reading завжди лежить свіжий стан:
 * { source, calibrating, present, strength, x, y, delta, magnitude, unit }
 */
export class MagnetEngine {
  source = null;
  polarity = 1;
  reading = { source: null, calibrating: true, present: false, strength: 0, x: 0.5, y: 0.5, delta: [0, 0, 0], magnitude: 0, unit: '' };

  #rotation = null;
  #relAlpha = null;
  #baseline = new Baseline();
  #filtered = null;
  #total = 0;
  #warm = { sum: [0, 0, 0], n: 0 };
  #tracker = null;
  #models = {};
  #compass = { abs: null, ref: null, rel0: null };
  /** Що вдалося отримати від браузера — для діагностики на сторінці. */
  stats = {
    magnetometerApi: ['UncalibratedMagnetometer', 'Magnetometer'].filter((n) => n in window),
    magnetometerError: null,
    orientationEvents: 0,
    compassEvents: 0,
  };
  #touch = { active: false, x: 0.5, y: 0.5 };
  #listeners = [];

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('magnet-models') || '{}');
      for (const [k, v] of Object.entries(saved)) this.#models[k] = MagnetModel.fromJSON(v);
      this.polarity = Number(localStorage.getItem('magnet-polarity')) === -1 ? -1 : 1;
    } catch {
      // Сховище недоступне — працюємо без збережених моделей.
    }
  }

  get model() {
    return this.#models[this.source] ?? new MagnetModel();
  }

  get profile() {
    return PROFILES[this.source] ?? PROFILES.touch;
  }

  setModel(model) {
    this.#models[this.source] = model;
    this.#save();
  }

  flipPolarity() {
    this.polarity = -this.polarity;
    this.#save();
  }

  #save() {
    try {
      const out = {};
      for (const [k, v] of Object.entries(this.#models)) out[k] = v.toJSON();
      localStorage.setItem('magnet-models', JSON.stringify(out));
      localStorage.setItem('magnet-polarity', String(this.polarity));
    } catch {
      // Не страшно: модель просто не переживе перезавантаження.
    }
  }

  /** Перевиміряти фон. Магніт треба прибрати. */
  recalibrate() {
    this.#baseline.clear();
    this.#filtered = null;
    this.#warm = { sum: [0, 0, 0], n: 0 };
    this.#compass.ref = null;
    if (this.#tracker) this.#tracker.present = false;
    this.reading = { ...this.reading, calibrating: this.source !== 'touch', present: false };
  }

  /**
   * Вмикає найкраще доступне джерело. Викликати з обробника натискання: iPhone дає доступ
   * до орієнтації лише після жесту користувача.
   */
  async start({ preferTouch = false } = {}) {
    this.stop();
    if (!preferTouch) {
      await this.#requestOrientationPermission();
      this.#listenOrientation();
      if (await this.#tryMagnetometer()) return this.#use('magnetometer');
      if (await this.#tryCompass()) return this.#use('compass');
    }
    this.#listenTouch();
    return this.#use('touch');
  }

  stop() {
    for (const off of this.#listeners) off();
    this.#listeners = [];
    this.source = null;
  }

  #use(source) {
    this.source = source;
    this.#tracker = new Tracker(PROFILES[source]);
    this.recalibrate();
    return source;
  }

  #on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.#listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  async #requestOrientationPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        await DOE.requestPermission();
      } catch {
        // Користувач відмовив або немає жесту — далі спрацює запасне джерело.
      }
    }
  }

  #listenOrientation() {
    // Відносна орієнтація (гіроскоп) — щоб віднімати поворот телефона.
    this.#on(window, 'deviceorientation', (e) => {
      if (e.alpha == null) return;
      this.stats.orientationEvents++;
      if (typeof e.webkitCompassHeading === 'number') {
        // iPhone: alpha відносна, а компас приходить окремим полем (за годинниковою стрілкою).
        this.stats.compassEvents++;
        this.#onCompass(360 - e.webkitCompassHeading);
      } else if (e.absolute) {
        // Деякі браузери шлють тут абсолютну орієнтацію — тоді гіроскопної в нас немає.
        this.stats.compassEvents++;
        this.#onCompass(e.alpha);
        return;
      }
      this.#relAlpha = e.alpha;
      this.#rotation = rotationFromEuler(e.alpha, e.beta ?? 0, e.gamma ?? 0);
    });
    this.#on(window, 'deviceorientationabsolute', (e) => {
      if (e.alpha == null) return;
      this.stats.compassEvents++;
      this.#onCompass(e.alpha);
    });
  }

  async #tryMagnetometer() {
    // Некалібрований кращий (Android не «звикає» до магніту), але є не на всіх телефонах.
    for (const name of this.stats.magnetometerApi) {
      if (await this.#tryMagnetometerCtor(window[name])) return true;
    }
    return false;
  }

  #tryMagnetometerCtor(Ctor) {
    return new Promise((resolve) => {
      let sensor;
      const timer = setTimeout(() => {
        sensor?.stop();
        this.stats.magnetometerError ??= `${Ctor.name}: немає даних`;
        resolve(false);
      }, 4000);
      try {
        sensor = new Ctor({ frequency: 60 });
        sensor.addEventListener('error', (e) => {
          clearTimeout(timer);
          this.stats.magnetometerError = `${Ctor.name}: ${e.error?.name ?? 'помилка'} ${e.error?.message ?? ''}`.trim();
          resolve(false);
        });
        let first = true;
        sensor.addEventListener('reading', () => {
          if (first) {
            first = false;
            clearTimeout(timer);
            this.#listeners.push(() => sensor.stop());
            resolve(true);
          }
          if (this.source !== 'magnetometer') return;
          const raw = [sensor.x, sensor.y, sensor.z];
          const bias = 'xBias' in sensor ? [sensor.xBias, sensor.yBias, sensor.zBias] : [0, 0, 0];
          this.#onField(raw, bias);
        });
        sensor.start();
      } catch (err) {
        clearTimeout(timer);
        this.stats.magnetometerError = `${Ctor.name}: ${err.name} ${err.message}`.trim();
        resolve(false);
      }
    });
  }

  #tryCompass() {
    return new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        if (this.#compass.abs !== null) resolve(true);
        else if (performance.now() - started > 1500) resolve(false);
        else setTimeout(check, 100);
      };
      check();
    });
  }

  #onField(raw, bias) {
    const field = this.#filtered ? lerp(this.#filtered, raw, 0.35) : raw;
    this.#filtered = field;
    this.#total = length(sub(field, bias));
    if (!this.#baseline.ready) {
      this.#warm.sum = add(this.#warm.sum, field);
      if (++this.#warm.n >= WARMUP) this.#baseline.reset(scale(this.#warm.sum, 1 / this.#warm.n), bias, this.#rotation);
      return;
    }
    const delta = this.#baseline.delta(field, this.#rotation);
    if (length(delta) < this.profile.quiet) this.#baseline.adapt(field, this.#rotation, 0.005);
    this.#emit(delta);
  }

  /** Компас: магніт відхиляє стрілку від того, куди вона мала б дивитися з урахуванням гіроскопа. */
  #onCompass(absAlpha) {
    const c = this.#compass;
    const unit = (deg) => [Math.sin(rad(deg)), Math.cos(rad(deg)), 0];
    const measured = unit(absAlpha);
    c.abs = c.abs ? normalize(lerp(c.abs, measured, 0.4)) : measured;
    if (this.source !== 'compass') return;

    const turn = this.#relAlpha !== null && c.rel0 !== null ? this.#relAlpha - c.rel0 : 0;
    if (c.ref === null) {
      this.#warm.n++;
      if (this.#warm.n >= 15) {
        c.ref = Math.atan2(c.abs[0], c.abs[1]) * (180 / Math.PI);
        c.rel0 = this.#relAlpha;
      }
      return;
    }
    const expected = unit(c.ref + turn);
    // Різниця напрямів, переведена в «µT»: який вектор треба додати до поля Землі.
    const delta = scale(sub(c.abs, expected), EARTH_UT);
    // Кут між напрямами в градусах — зручніше для порогів компаса.
    const angle = Math.acos(Math.max(-1, Math.min(1, c.abs[0] * expected[0] + c.abs[1] * expected[1]))) * (180 / Math.PI);
    if (angle < this.profile.quiet) c.ref += angleDiff(Math.atan2(c.abs[0], c.abs[1]) * (180 / Math.PI), c.ref + turn) * 0.01;
    this.#emit(scale(normalize(delta), angle));
  }

  #listenTouch() {
    const move = (e) => {
      this.#touch.x = e.clientX / innerWidth;
      this.#touch.y = e.clientY / innerHeight;
      if (e.pointerType === 'mouse') this.#touch.active = true;
    };
    this.#on(window, 'pointermove', move, { passive: true });
    this.#on(window, 'pointerdown', (e) => {
      move(e);
      this.#touch.active = true;
    }, { passive: true });
    for (const type of ['pointerup', 'pointercancel']) {
      this.#on(window, type, (e) => {
        if (e.pointerType !== 'mouse') this.#touch.active = false;
      }, { passive: true });
    }
    this.#on(document.documentElement, 'mouseleave', () => (this.#touch.active = false));
  }

  /** Викликати щокадру: для пальця стан оновлюється тут, для датчиків — у їхніх подіях. */
  tick() {
    if (this.source !== 'touch') return this.reading;
    const t = this.#tracker;
    const target = this.#touch.active ? 1 : 0;
    t.present = this.#touch.active;
    t.strength += (target - t.strength) * (target > t.strength ? 0.2 : 0.06);
    t.x += (this.#touch.x - t.x) * 0.35;
    t.y += (this.#touch.y - t.y) * 0.35;
    this.reading = { source: 'touch', calibrating: false, present: t.present, strength: t.strength, x: t.x, y: t.y, delta: [0, 0, 0], magnitude: 0, unit: '' };
    return this.reading;
  }

  #emit(delta) {
    const magnitude = this.#tracker.update(delta, this.model, this.polarity);
    const t = this.#tracker;
    this.reading = {
      source: this.source,
      calibrating: false,
      present: t.present,
      strength: t.strength,
      x: t.x,
      y: t.y,
      delta,
      magnitude,
      unit: this.profile.unit,
      total: this.#total,
    };
  }
}

function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}
