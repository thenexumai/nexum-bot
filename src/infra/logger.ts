import chalk from 'chalk';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    SUCCESS = 2,
    WARN = 3,
    ERROR = 4
}

export class Logger {
    private static minLevel: LogLevel = LogLevel.DEBUG;

    private static getTime(): string {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }

    private static formatMessage(level: string, color: any, scope: string, message: string): string {
        const timeStr = chalk.gray(`[${this.getTime()}]`);
        const levelStr = color(`[${level.padEnd(7)}]`);
        const scopeStr = chalk.cyan(`[${scope.toUpperCase()}]`);
        return `${timeStr} ${levelStr} ${scopeStr} ${message}`;
    }

    static debug(scope: string, message: string) {
        if (this.minLevel <= LogLevel.DEBUG) {
            console.log(this.formatMessage('DEBUG', chalk.magenta, scope, message));
        }
    }

    static info(scope: string, message: string) {
        if (this.minLevel <= LogLevel.INFO) {
            console.log(this.formatMessage('INFO', chalk.blue, scope, message));
        }
    }

    static success(scope: string, message: string) {
        if (this.minLevel <= LogLevel.SUCCESS) {
            console.log(this.formatMessage('SUCCESS', chalk.green, scope, message));
        }
    }

    static warn(scope: string, message: string) {
        if (this.minLevel <= LogLevel.WARN) {
            console.log(this.formatMessage('WARN', chalk.yellow, scope, message));
        }
    }

    static error(scope: string, message: string, error?: any) {
        if (this.minLevel <= LogLevel.ERROR) {
            console.error(this.formatMessage('ERROR', chalk.red, scope, message));
            if (error) {
                if (error instanceof Error) {
                    console.error(chalk.red(error.stack));
                } else {
                    console.error(error);
                }
            }
        }
    }
}
