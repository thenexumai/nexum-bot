/**
 * NEXUM Code Assistant - работа с кодом, файлами и проектами
 * Адаптировано из open-source инструментов без упоминания брендов
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FileEdit {
    path: string;
    oldContent: string;
    newContent: string;
    description: string;
}

export interface CodeAnalysis {
    language: string;
    linesOfCode: number;
    complexity: number;
    issues: string[];
    suggestions: string[];
}

/**
 * Читает файл и возвращает его содержимое с номерами строк
 */
export async function readFileWithLines(filePath: string): Promise<string> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        return lines.map((line, idx) => `${idx + 1}  ${line}`).join('\n');
    } catch (err) {
        throw new Error(`Не могу прочитать ${filePath}: ${err}`);
    }
}

/**
 * Заменяет текст в файле (найти и заменить)
 */
export async function replaceInFile(
    filePath: string,
    searchText: string,
    replaceText: string
): Promise<{ success: boolean; message: string }> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        
        if (!content.includes(searchText)) {
            return {
                success: false,
                message: `Текст "${searchText.slice(0, 50)}..." не найден в файле`
            };
        }

        const newContent = content.replace(searchText, replaceText);
        await fs.writeFile(filePath, newContent, 'utf-8');
        
        return {
            success: true,
            message: `✅ Файл обновлён: ${filePath}`
        };
    } catch (err) {
        return {
            success: false,
            message: `❌ Ошибка: ${err}`
        };
    }
}

/**
 * Создаёт новый файл с содержимым
 */
export async function createFile(
    filePath: string,
    content: string
): Promise<{ success: boolean; message: string }> {
    try {
        // Создаём директории если нужно
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(filePath, content, 'utf-8');
        
        return {
            success: true,
            message: `✅ Создан файл: ${filePath}`
        };
    } catch (err) {
        return {
            success: false,
            message: `❌ Ошибка: ${err}`
        };
    }
}

/**
 * Выполняет bash команду и возвращает результат
 */
export async function runBashCommand(
    command: string,
    cwd?: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execAsync(command, { 
            cwd: cwd || process.cwd(),
            timeout: 30000 // 30 секунд максимум
        });
        
        return {
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim()
        };
    } catch (err: any) {
        return {
            success: false,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message
        };
    }
}

/**
 * Анализирует код и даёт рекомендации
 */
export async function analyzeCode(filePath: string): Promise<CodeAnalysis> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        
        // Определяем язык
        const languageMap: Record<string, string> = {
            '.ts': 'TypeScript',
            '.js': 'JavaScript',
            '.py': 'Python',
            '.java': 'Java',
            '.cpp': 'C++',
            '.c': 'C',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.swift': 'Swift',
            '.kt': 'Kotlin'
        };
        
        const language = languageMap[ext] || 'Unknown';
        const lines = content.split('\n');
        const linesOfCode = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
        
        // Простой анализ сложности
        const complexity = calculateComplexity(content);
        
        // Находим потенциальные проблемы
        const issues: string[] = [];
        const suggestions: string[] = [];
        
        // Проверяем на общие проблемы
        if (content.includes('console.log')) {
            issues.push('Найдены console.log - уберите перед продакшеном');
        }
        
        if (content.includes('any') && ext === '.ts') {
            issues.push('Использование типа "any" - лучше указать конкретные типы');
        }
        
        if (linesOfCode > 300) {
            suggestions.push('Файл большой (>300 строк) - рассмотрите разбиение на модули');
        }
        
        if (content.includes('TODO') || content.includes('FIXME')) {
            suggestions.push('Есть TODO/FIXME комментарии - не забудьте исправить');
        }
        
        return {
            language,
            linesOfCode,
            complexity,
            issues,
            suggestions
        };
    } catch (err) {
        throw new Error(`Не могу проанализировать ${filePath}: ${err}`);
    }
}

/**
 * Вычисляет сложность кода (упрощённая метрика)
 */
function calculateComplexity(code: string): number {
    let complexity = 1;
    
    // Подсчитываем условия
    const conditions = (code.match(/\bif\b|\belse\b|\bswitch\b|\bcase\b/g) || []).length;
    complexity += conditions;
    
    // Подсчитываем циклы
    const loops = (code.match(/\bfor\b|\bwhile\b|\bdo\b/g) || []).length;
    complexity += loops * 2;
    
    // Подсчитываем логические операторы
    const logical = (code.match(/&&|\|\|/g) || []).length;
    complexity += logical;
    
    return complexity;
}

/**
 * Ищет файлы в проекте по паттерну
 */
export async function findFiles(
    directory: string,
    pattern: string
): Promise<string[]> {
    try {
        const result = await runBashCommand(`find "${directory}" -name "${pattern}" -type f | head -20`);
        
        if (result.success && result.stdout) {
            return result.stdout.split('\n').filter(Boolean);
        }
        
        return [];
    } catch {
        return [];
    }
}

/**
 * Получает структуру проекта (дерево файлов)
 */
export async function getProjectStructure(directory: string, maxDepth: number = 3): Promise<string> {
    try {
        const result = await runBashCommand(`tree -L ${maxDepth} -I 'node_modules|dist|.git' "${directory}"`);
        
        if (result.success && result.stdout) {
            return result.stdout;
        }
        
        // Fallback если tree не установлен
        const fallbackResult = await runBashCommand(`find "${directory}" -maxdepth ${maxDepth} -type f | head -50`);
        return fallbackResult.stdout || 'Не удалось получить структуру';
    } catch {
        return 'Ошибка при получении структуры проекта';
    }
}

/**
 * Grep по файлам (поиск текста в проекте)
 */
export async function grepInProject(
    directory: string,
    searchText: string,
    filePattern: string = '*'
): Promise<string[]> {
    try {
        const result = await runBashCommand(
            `grep -r "${searchText}" "${directory}" --include="${filePattern}" | head -20`
        );
        
        if (result.success && result.stdout) {
            return result.stdout.split('\n').filter(Boolean);
        }
        
        return [];
    } catch {
        return [];
    }
}

/**
 * Git операции (статус, diff, commit)
 */
export async function gitStatus(directory: string): Promise<string> {
    const result = await runBashCommand('git status --short', directory);
    return result.stdout || result.stderr || 'Не git репозиторий';
}

export async function gitDiff(directory: string): Promise<string> {
    const result = await runBashCommand('git diff', directory);
    return result.stdout || 'Нет изменений';
}

export async function gitCommit(directory: string, message: string): Promise<{ success: boolean; message: string }> {
    const addResult = await runBashCommand('git add .', directory);
    if (!addResult.success) {
        return { success: false, message: addResult.stderr };
    }
    
    const commitResult = await runBashCommand(`git commit -m "${message}"`, directory);
    return {
        success: commitResult.success,
        message: commitResult.stdout || commitResult.stderr
    };
}

/**
 * Запускает тесты проекта
 */
export async function runTests(directory: string): Promise<{ success: boolean; output: string }> {
    // Пробуем разные test runners
    const runners = [
        'npm test',
        'yarn test',
        'pnpm test',
        'pytest',
        'cargo test',
        'go test ./...'
    ];
    
    for (const runner of runners) {
        const result = await runBashCommand(runner, directory);
        if (result.success || result.stdout.includes('test')) {
            return {
                success: result.success,
                output: result.stdout + '\n' + result.stderr
            };
        }
    }
    
    return {
        success: false,
        output: 'Не найден test runner'
    };
}

/**
 * Форматирует код (prettier, black, etc)
 */
export async function formatCode(filePath: string): Promise<{ success: boolean; message: string }> {
    const ext = path.extname(filePath);
    
    let command = '';
    if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
        command = `npx prettier --write "${filePath}"`;
    } else if (ext === '.py') {
        command = `black "${filePath}"`;
    } else if (ext === '.go') {
        command = `gofmt -w "${filePath}"`;
    } else if (ext === '.rs') {
        command = `rustfmt "${filePath}"`;
    } else {
        return { success: false, message: 'Форматтер для этого языка не найден' };
    }
    
    const result = await runBashCommand(command);
    return {
        success: result.success,
        message: result.success ? `✅ Отформатирован: ${filePath}` : result.stderr
    };
}
