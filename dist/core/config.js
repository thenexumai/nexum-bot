"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.getKey = getKey;
exports.getSerperKey = getSerperKey;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
function keys(prefix) {
    const out = [];
    for (let i = 1; i <= 10; i++) {
        const v = process.env[`${prefix}${i}`]?.trim();
        if (v)
            out.push(v);
    }
    return out;
}
exports.config = {
    botToken: process.env.BOT_TOKEN,
    adminIds: (process.env.ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean),
    webappUrl: (process.env.WEBAPP_URL || '').replace(/\/$/, ''),
    port: parseInt(process.env.PORT || process.env.NODE_PORT || '3000'),
    dbPath: process.env.DB_PATH || './data/nexum.db',
    publicBot: process.env.PUBLIC_BOT === 'true',
    ai: {
        cerebras: keys('CB'),
        groq: keys('GR'),
        gemini: keys('G'),
        grok: keys('GK'),
        sambanova: keys('SN'),
        together: keys('TO'),
        openrouter: keys('OR'),
        deepseek: keys('DS'),
        claude: keys('CL'),
    },
    serper: [
        process.env.SERPER_KEY,
        process.env.SERPER_KEY2,
        process.env.SERPER_KEY3,
    ].filter(Boolean),
};
// Round-robin key rotation per provider
const _idx = {};
function getKey(provider) {
    const list = exports.config.ai[provider];
    if (!list.length)
        return null;
    const i = (_idx[provider] || 0) % list.length;
    _idx[provider] = i + 1;
    return list[i];
}
function getSerperKey() {
    if (!exports.config.serper.length)
        return null;
    const i = (_idx['serper'] || 0) % exports.config.serper.length;
    _idx['serper'] = i + 1;
    return exports.config.serper[i];
}
