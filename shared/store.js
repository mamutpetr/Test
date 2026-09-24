// Shared "backend" simulated via localStorage.
// Both the client and driver apps read/write here, and use the browser's
// `storage` event to react in near real-time when the two tabs are open
// side by side on the same origin.

const STORAGE_KEY = 'taxi_state_v1';

const DEFAULT_STATE = {
  drivers: [],   // { id, name, car, plate, online, lat, lng }
  rides:   [],   // { id, clientName, from, to, distanceKm, price,
                 //   status: 'requested'|'accepted'|'arrived'|'started'|'completed'|'cancelled',
                 //   driverId, createdAt, updatedAt }
};

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function writeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const Store = {
  get: readState,

  update(mutator) {
    const state = readState();
    mutator(state);
    writeState(state);
    return state;
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
  },

  onChange(handler) {
    const local = () => handler(readState());
    // Fired when *another* tab writes to localStorage on the same origin.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) local();
    });
    // Fired by our own tab after we write (dispatched manually below).
    window.addEventListener('taxi:changed', local);
  },

  notify() {
    window.dispatchEvent(new CustomEvent('taxi:changed'));
  },
};

// Small helpers used by both apps.
export const uid = () => Math.random().toString(36).slice(2, 10);

export function estimatePrice(distanceKm) {
  const base = 40;         // UAH pickup fee
  const perKm = 15;        // UAH per km
  return Math.round(base + perKm * distanceKm);
}

export function fakeDistanceKm(from, to) {
  // Deterministic pseudo-distance from two strings so the estimate is stable.
  const s = (from + '|' + to).toLowerCase();
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.max(1.2, ((h % 180) / 10) + 1); // ~1.2 – 19.2 km
}

export function formatUAH(n) {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency', currency: 'UAH', maximumFractionDigits: 0,
  }).format(n);
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('uk-UA', {
    hour: '2-digit', minute: '2-digit',
  });
}

export const StatusLabel = {
  requested: 'Пошук водія',
  accepted:  'Водій прямує',
  arrived:   'Водій на місці',
  started:   'У дорозі',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};
