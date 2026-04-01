import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../infra/logger';

export class FileVault {
    private static ALGORITHM = 'aes-256-cbc';
    private static VAULT_DIR = path.join(process.cwd(), 'data/vault');

    static init() {
        if (!fs.existsSync(this.VAULT_DIR)) {
            fs.mkdirSync(this.VAULT_DIR, { recursive: true });
        }
    }

    static encrypt(text: string, masterKey: string): string {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(masterKey, 'salt', 32);
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    static decrypt(encryptedData: string, masterKey: string): string {
        const [ivHex, encryptedText] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(masterKey, 'salt', 32);
        const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    static saveSecret(uid: number, name: string, value: string, masterKey: string) {
        this.init();
        const encrypted = this.encrypt(value, masterKey);
        const filePath = path.join(this.VAULT_DIR, `${uid}_${name}.nexum`);
        fs.writeFileSync(filePath, encrypted);
        Logger.success('vault', `Secret ${name} saved for user ${uid}`);
    }

    static getSecret(uid: number, name: string, masterKey: string): string | null {
        const filePath = path.join(this.VAULT_DIR, `${uid}_${name}.nexum`);
        if (!fs.existsSync(filePath)) return null;
        const encrypted = fs.readFileSync(filePath, 'utf8');
        try {
            return this.decrypt(encrypted, masterKey);
        } catch (e) {
            Logger.error('vault', 'Decryption failed. Wrong master key?');
            return null;
        }
    }
}
