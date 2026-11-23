/* Structured JSON logger with secret redaction. */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY_RE = /(key|secret|token|password|signature|authorization|cookie|private)/i;
const ADDRESS_KEY_RE = /(address|extraId)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) out[k] = "[redacted]";
      else if (ADDRESS_KEY_RE.test(k) && typeof v === "string") out[k] = v.length > 10 ? `${v.slice(0, 4)}…${v.slice(-4)}` : "[redacted]";
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    // Strip query strings from URLs: they can carry api keys (e.g. ChangeNOW v1 style).
    return value.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, "$1?[redacted]");
  }
  return value;
}

function minLevel(): Level {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return l in ORDER ? l : "info";
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  if (ORDER[level] < ORDER[minLevel()]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};
