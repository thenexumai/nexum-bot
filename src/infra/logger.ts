// OpenClaw-style beautiful colored logger

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: COLORS.gray,
  INFO:  COLORS.cyan,
  WARN:  COLORS.yellow,
  ERROR: COLORS.red,
  SUCCESS: COLORS.green,
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  DEBUG: '●',
  INFO:  '◆',
  WARN:  '▲',
  ERROR: '✖',
  SUCCESS: '✔',
};

function timestamp(): string {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
}

function format(level: LogLevel, module: string, message: string, data?: unknown): string {
  const ts  = `${COLORS.dim}[${timestamp()}]${COLORS.reset}`;
  const lv  = `${LEVEL_COLORS[level]}${LEVEL_ICONS[level]} ${level.padEnd(7)}${COLORS.reset}`;
  const mod = `${COLORS.magenta}[${module}]${COLORS.reset}`;
  const msg = message;
  const extra = data !== undefined ? `\n  ${COLORS.dim}${JSON.stringify(data, null, 2)}${COLORS.reset}` : '';
  return `${ts} ${lv} ${mod} ${msg}${extra}`;
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) =>
    console.log(format('DEBUG', module, message, data)),
  info: (module: string, message: string, data?: unknown) =>
    console.log(format('INFO', module, message, data)),
  warn: (module: string, message: string, data?: unknown) =>
    console.warn(format('WARN', module, message, data)),
  error: (module: string, message: string, data?: unknown) =>
    console.error(format('ERROR', module, message, data)),
  success: (module: string, message: string, data?: unknown) =>
    console.log(format('SUCCESS', module, message, data)),
};

export default logger;
