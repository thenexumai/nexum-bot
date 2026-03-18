// PC Agent Pairing System

import { randomBytes } from "crypto";
import db from "../db/user-db";

interface PairingSession {
  code: string;
  userId: number;
  expiresAt: Date;
  deviceId?: string;
  status: "pending" | "paired" | "expired";
}

export const generatePairingCode = (userId: number): string => {
  const code = randomBytes(3).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  const stmt = db.prepare(`
    INSERT INTO pairing_codes (code, user_id, expires_at) VALUES (?, ?, ?)
  `);
  stmt.run(code, userId, expiresAt.toISOString());

  return code;
};

export const verifyPairingCode = (code: string, deviceId: string): { success: boolean; userId?: number } => {
  const stmt = db.prepare(`
    SELECT user_id FROM pairing_codes 
    WHERE code = ? AND expires_at > datetime('now')
  `);
  
  const result = stmt.get(code) as any;
  if (!result) return { success: false };

  // Mark as paired
  const updateStmt = db.prepare(`
    UPDATE pairing_codes SET status = 'paired', device_id = ? WHERE code = ?
  `);
  updateStmt.run(deviceId, code);

  return { success: true, userId: result.user_id };
};

export const getPairedAgents = (userId: number): string[] => {
  const stmt = db.prepare(`
    SELECT device_id FROM pairing_codes 
    WHERE user_id = ? AND status = 'paired'
  `);
  
  const results = stmt.all(userId) as any[];
  return results.map(r => r.device_id).filter(Boolean);
};
