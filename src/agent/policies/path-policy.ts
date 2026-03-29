/**
 * NEXUM Path Policy — file system access control
 * Defines which paths are allowed, blocked, or require confirmation.
 */

import os from 'os';
import path from 'path';

const homeDir = os.homedir();

// ── Allowed workspace roots ────────────────────────────────────────────────────

export const ALLOWED_ROOTS: string[] = [
  path.join(homeDir, 'Desktop'),
  path.join(homeDir, 'Documents'),
  path.join(homeDir, 'Downloads'),
  path.join(homeDir, 'nexum-workspace'),
  '/tmp',
  'C:\\Users\\Public\\Documents',
  'C:\\Nexum',
];

// ── Blocked path patterns ──────────────────────────────────────────────────────

const BLOCKED_PATTERNS: RegExp[] = [
  // Unix system dirs
  /^\/bin/, /^\/sbin/, /^\/usr\/bin/, /^\/usr\/sbin/,
  /^\/System/, /^\/Library\/System/, /^\/private\/etc/,
  /^\/etc\/shadow/, /^\/etc\/sudoers/,
  // Windows system dirs
  /^C:\\Windows\\System32/i, /^C:\\Windows\\SysWOW64/i,
  /^C:\\Windows\\WinSxS/i,
  // Sensitive config dirs
  /[\/\\]\.ssh[\/\\]/, /[\/\\]\.aws[\/\\]/, /[\/\\]\.gnupg[\/\\]/,
  /[\/\\]\.config[\/\\]chromium/i, /[\/\\]\.config[\/\\]google-chrome/i,
  // Key files
  /id_rsa$/, /id_ecdsa$/, /id_ed25519$/, /\.pem$/, /\.key$/,
  // Blockchain wallets
  /wallet\.dat/, /keystore[\/\\]/,
];

// ── Path validators ───────────────────────────────────────────────────────────

export interface PathCheckResult {
  allowed: boolean;
  reason: string;
  normalized: string;
}

export function checkPath(filePath: string): PathCheckResult {
  const normalized = path.normalize(filePath);

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        allowed: false,
        reason: `Path is in a protected location: ${normalized}`,
        normalized,
      };
    }
  }

  // Check for path traversal attempts
  if (normalized.includes('..')) {
    return {
      allowed: false,
      reason: 'Path traversal detected',
      normalized,
    };
  }

  // Check if within allowed roots (warning only — not a hard block for general use)
  const inAllowed = ALLOWED_ROOTS.some(root =>
    normalized.toLowerCase().startsWith(root.toLowerCase())
  );

  return {
    allowed: true,
    reason: inAllowed ? 'Within allowed workspace' : 'Outside default workspace (proceed with caution)',
    normalized,
  };
}

export function isWithinWorkspace(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return ALLOWED_ROOTS.some(root =>
    normalized.toLowerCase().startsWith(root.toLowerCase())
  );
}

export function sanitizePath(filePath: string): string {
  // Remove null bytes and dangerous chars
  return filePath
    .replace(/\0/g, '')
    .replace(/[<>"|?*]/g, '_')
    .trim();
}
