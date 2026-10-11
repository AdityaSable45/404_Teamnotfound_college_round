type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function sanitize(data: unknown): unknown {
  if (typeof data === 'string') {
    // Redact strings that look like API keys or tokens
    return data.replace(/(AIza[0-9A-Za-z-_]{35}|sk-[a-zA-Z0-9_-]{20,})/g, '[REDACTED_API_KEY]');
  }
  if (data && typeof data === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (/key|secret|token|password|auth/i.test(key)) {
        copy[key] = '[REDACTED_SECRET]';
      } else if (key === 'text' && typeof value === 'string') {
        // Redact or summarize user-submitted text to protect privacy
        copy[key] = `[Text of length ${value.length}]`;
      } else {
        copy[key] = sanitize(value);
      }
    }
    return copy;
  }
  return data;
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
  },
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${msg}`, meta ? sanitize(meta) : '');
    }
  },
};
