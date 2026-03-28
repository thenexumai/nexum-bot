/**
 * NEXUM Logger
 * Structured logging with levels, inspired by OpenClaw's logInfo pattern.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_PROD = process.env.NODE_ENV === 'production';

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function fmt(level: string, module: string, msg: string, meta?: unknown): string {
  const base = `[${ts()}] [${level.toUpperCase()}] [${module}] ${msg}`;
  if (meta !== undefined) {
    const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return `${base} ${metaStr}`;
  }
  return base;
}

export const logger = {
  debug: (module: string, msg: string, meta?: unknown) => {
    if (!IS_PROD) console.debug(fmt('debug', module, msg, meta));
  },
  info: (module: string, msg: string, meta?: unknown) => {
    console.info(fmt('info', module, msg, meta));
  },
  warn: (module: string, msg: string, meta?: unknown) => {
    console.warn(fmt('warn', module, msg, meta));
  },
  error: (module: string, msg: string, meta?: unknown) => {
    console.error(fmt('error', module, msg, meta));
  },
};

/** Create a module-scoped logger */
export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: unknown) => logger.debug(module, msg, meta),
    info:  (msg: string, meta?: unknown) => logger.info(module, msg, meta),
    warn:  (msg: string, meta?: unknown) => logger.warn(module, msg, meta),
    error: (msg: string, meta?: unknown) => logger.error(module, msg, meta),
  };
}
