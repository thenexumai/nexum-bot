"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMemory = saveMemory;
exports.getMemories = getMemories;
exports.clearMemory = clearMemory;
exports.saveMessage = saveMessage;
exports.getHistory = getHistory;
exports.clearHistory = clearHistory;
exports.autoExtract = autoExtract;
const db_1 = require("../core/db");
function saveMemory(uid, key, value) {
    db_1.db.prepare(`
    INSERT INTO memory (uid, key, value) VALUES (?, ?, ?)
    ON CONFLICT(uid, key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(uid, key, value);
}
function getMemories(uid) {
    return db_1.db.prepare('SELECT key, value FROM memory WHERE uid=? ORDER BY id DESC LIMIT 30').all(uid);
}
function clearMemory(uid) {
    db_1.db.prepare('DELETE FROM memory WHERE uid=?').run(uid);
}
function saveMessage(uid, role, content) {
    db_1.db.prepare('INSERT INTO conversations (uid, role, content) VALUES (?,?,?)').run(uid, role, content.slice(0, 4000));
    // Keep last 120 per user
    db_1.db.prepare(`
    DELETE FROM conversations WHERE uid=? AND id NOT IN (
      SELECT id FROM conversations WHERE uid=? ORDER BY id DESC LIMIT 120
    )
  `).run(uid, uid);
}
function getHistory(uid, limit = 12) {
    return db_1.db.prepare('SELECT role, content FROM conversations WHERE uid=? ORDER BY id DESC LIMIT ?').all(uid, limit).reverse();
}
function clearHistory(uid) {
    db_1.db.prepare('DELETE FROM conversations WHERE uid=?').run(uid);
}
// Auto-extract facts from conversation
function autoExtract(uid, userText) {
    const save = (k, v) => saveMemory(uid, k, v);
    const nameMatch = userText.match(/меня зовут\s+([А-ЯЁA-Z][а-яёa-z]+)/i);
    if (nameMatch)
        save('name', nameMatch[1]);
    const cityMatch = userText.match(/(?:я из|живу в|нахожусь в)\s+([А-ЯЁA-Z][а-яёa-z]+)/i);
    if (cityMatch)
        save('city', cityMatch[1]);
    const ageMatch = userText.match(/мне\s+(\d{1,2})\s+лет/i);
    if (ageMatch)
        save('age', ageMatch[1]);
    if (/работаю|разработчик|дизайнер|менеджер|врач|учитель|студент/i.test(userText)) {
        save('occupation', userText.slice(0, 80));
    }
}
