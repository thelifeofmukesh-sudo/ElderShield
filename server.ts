import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_ROLE_PERMISSIONS } from './src/engine/permissions.ts';
import type { Invitation, Member, NotificationOutboxItem, Role } from './src/types/eldershield.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Server-side invitation store (stores ONLY salted SHA-256 hashes, never raw passcodes)
interface ServerInvitationRecord extends Invitation {
  salt: string;
}

const serverInvitations = new Map<string, ServerInvitationRecord>();
const redeemRateLimiter = new Map<string, { count: number; windowStart: number }>();

function hashPasscode(passcode: string, salt: string): string {
  return crypto
    .createHmac('sha256', process.env.INVITATION_HMAC_SECRET || 'eldershield-local-dev-hmac-key')
    .update(`${salt}:${passcode.trim().toUpperCase()}`)
    .digest('hex');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateReadablePasscode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  return `ES-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

// Seed initial demo invitation hash on server startup for ES-DEMO-4829
const DEMO_SEED_SALT = 'demo_seed_salt_2026';
serverInvitations.set('inv_demo_pending', {
  id: 'inv_demo_pending',
  profileId: 'profile_arthur_demo',
  label: 'Weekend Visiting Nurse (Sample Passcode: ES-DEMO-4829)',
  recipientEmailHint: 'nurse.visit@eldershield.local',
  role: 'caretaker',
  permissions: [...DEFAULT_ROLE_PERMISSIONS.caretaker],
  salt: DEMO_SEED_SALT,
  codeHash: hashPasscode('ES-DEMO-4829', DEMO_SEED_SALT),
  codeMasked: 'ES-••••-4829',
  expiresAt: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
  maxAttempts: 5,
  attemptCount: 0,
  redeemedAt: null,
  redeemedByMemberId: null,
  revokedAt: null,
  createdBy: 'Arthur Pendelton',
  createdAt: new Date(Date.now() - 86400 * 1000).toISOString(),
});

function sanitizeInput(val: unknown, maxLen = 240): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Health & capability inspection endpoint (never exposes secret keys)
  app.get('/api/health', (_req, res) => {
    const emailConfigured = Boolean(process.env.RESEND_API_KEY);
    const supabaseConfigured = Boolean(
      process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    res.json({
      ok: true,
      service: 'ElderShield API',
      emailProviderConfigured: emailConfigured,
      emailProviderName: emailConfigured ? 'Resend' : 'Demo Simulation Only',
      supabaseConfigured,
      mode: supabaseConfigured ? 'supabase_configured' : 'local_demo_mode',
      timestamp: new Date().toISOString(),
    });
  });

  // List server-tracked invitations (without exposing codeHash or salt)
  app.get('/api/invitations', (_req, res) => {
    const list = Array.from(serverInvitations.values()).map(({ salt: _s, codeHash: _h, ...pub }) => ({
      ...pub,
      codeHash: '[REDACTED_SERVER_HASH]',
    }));
    res.json({ invitations: list });
  });

  // Create expiring passcode invitation (server validates actor role & generates hash)
  app.post('/api/invitations/create', (req, res) => {
    const { actorRole, actorName, label, recipientEmailHint, role, permissions, expiresInDays } =
      req.body ?? {};

    // Server-side authorization check: only elderly_owner or permitted coordinator may invite
    if (actorRole !== 'elderly_owner') {
      res.status(403).json({
        error: 'Forbidden: Only the Elderly Profile Owner can generate new access passcodes.',
      });
      return;
    }

    const cleanRole: Exclude<Role, 'elderly_owner'> =
      role === 'family_member' ? 'family_member' : 'caretaker';
    const cleanLabel = sanitizeInput(label, 120) || `${cleanRole} invitation`;
    const cleanEmail = sanitizeInput(recipientEmailHint, 160);
    const days = Math.min(30, Math.max(1, Number(expiresInDays) || 7));

    const passcode = generateReadablePasscode();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashPasscode(passcode, salt);
    const id = `inv_${crypto.randomUUID().slice(0, 8)}`;

    const allowedPerms = Array.isArray(permissions)
      ? permissions.filter((p) => typeof p === 'string')
      : [...DEFAULT_ROLE_PERMISSIONS[cleanRole]];

    const record: ServerInvitationRecord = {
      id,
      profileId: 'profile_arthur_demo',
      label: cleanLabel,
      recipientEmailHint: cleanEmail,
      role: cleanRole,
      permissions: allowedPerms as Invitation['permissions'],
      salt,
      codeHash,
      codeMasked: `ES-••••-${passcode.slice(-4)}`,
      expiresAt: new Date(Date.now() + days * 86400 * 1000).toISOString(),
      maxAttempts: 5,
      attemptCount: 0,
      redeemedAt: null,
      redeemedByMemberId: null,
      revokedAt: null,
      createdBy: sanitizeInput(actorName, 80) || 'Profile Owner',
      createdAt: new Date().toISOString(),
    };

    serverInvitations.set(id, record);

    const { salt: _s, codeHash: _h, ...safeRecord } = record;
    res.status(201).json({
      invitation: { ...safeRecord, codeHash: '[STORED_AS_HMAC_SHA256]' },
      // Returned ONCE at creation for sharing out-of-band; never stored in plaintext
      oneTimePasscode: passcode,
    });
  });

  // Redeem passcode invitation with rate limiting, attempt tracking, expiry & single-use checks
  app.post('/api/invitations/redeem', (req, res) => {
    const clientIp = req.ip || 'local';
    const nowMs = Date.now();
    const rate = redeemRateLimiter.get(clientIp) || { count: 0, windowStart: nowMs };
    if (nowMs - rate.windowStart > 60_000) {
      rate.count = 0;
      rate.windowStart = nowMs;
    }
    rate.count++;
    redeemRateLimiter.set(clientIp, rate);

    if (rate.count > 12) {
      res.status(429).json({
        error: 'Too many passcode verification attempts. Please wait one minute before retrying.',
      });
      return;
    }

    const passcode = sanitizeInput(req.body?.passcode, 32).toUpperCase();
    const memberName = sanitizeInput(req.body?.memberName, 80);
    const memberEmail = sanitizeInput(req.body?.memberEmail, 140);
    const relationship = sanitizeInput(req.body?.relationship, 80);

    if (!passcode || !memberName || !memberEmail) {
      res.status(400).json({
        error: 'Passcode, full name, and email address are required.',
      });
      return;
    }

    // Match against active invitations using timing-safe comparison
    let matched: ServerInvitationRecord | undefined;
    for (const inv of serverInvitations.values()) {
      if (inv.revokedAt || inv.redeemedAt) continue;
      if (new Date(inv.expiresAt).getTime() < nowMs) continue;
      if (inv.attemptCount >= inv.maxAttempts) continue;

      const candidateHash = hashPasscode(passcode, inv.salt);
      if (timingSafeHexEqual(candidateHash, inv.codeHash)) {
        matched = inv;
        break;
      }
    }

    if (!matched) {
      // Increment attempt counts on active invitations matching masked suffix if provided, or return generic error
      for (const inv of serverInvitations.values()) {
        if (!inv.revokedAt && !inv.redeemedAt && passcode.endsWith(inv.codeMasked.slice(-4))) {
          inv.attemptCount++;
        }
      }
      res.status(401).json({
        error: 'Invalid, expired, revoked, or already redeemed invitation passcode.',
      });
      return;
    }

    const newMemberId = `member_${crypto.randomUUID().slice(0, 8)}`;
    matched.redeemedAt = new Date(nowMs).toISOString();
    matched.redeemedByMemberId = newMemberId;

    const initials = memberName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');

    // Role and permissions come strictly from the server invitation record, never from req.body
    const createdMember: Member = {
      id: newMemberId,
      name: memberName,
      email: memberEmail,
      role: matched.role,
      relationship: relationship || (matched.role === 'family_member' ? 'Family Member' : 'Caretaker'),
      permissions: [...matched.permissions],
      active: true,
      joinedAt: new Date(nowMs).toISOString(),
      avatarInitials: initials || 'ES',
      canViewHealthVaultCategories: {
        basicProfile: true,
        emergencyContacts: true,
        healthcareNotes: true,
        prescriberDetails: matched.role === 'family_member',
        medicationList: true,
        appointmentHistory: true,
      },
    };

    const { salt: _s, codeHash: _h, ...safeInv } = matched;
    res.json({
      verified: true,
      member: createdMember,
      invitation: { ...safeInv, codeHash: '[STORED_AS_HMAC_SHA256]' },
    });
  });

  // Revoke an active invitation
  app.post('/api/invitations/revoke', (req, res) => {
    const { actorRole, invitationId } = req.body ?? {};
    if (actorRole !== 'elderly_owner') {
      res.status(403).json({ error: 'Only the Elderly Profile Owner may revoke invitations.' });
      return;
    }
    const inv = serverInvitations.get(String(invitationId));
    if (!inv) {
      res.status(404).json({ error: 'Invitation not found.' });
      return;
    }
    inv.revokedAt = new Date().toISOString();
    const { salt: _s, codeHash: _h, ...safeInv } = inv;
    res.json({ invitation: { ...safeInv, codeHash: '[STORED_AS_HMAC_SHA256]' } });
  });

  // Process Notification Outbox (Resend live when configured, honest demo simulation otherwise)
  app.post('/api/notifications/process', async (req, res) => {
    const items = Array.isArray(req.body?.items) ? (req.body.items as NotificationOutboxItem[]) : [];
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || 'ElderShield Care <onboarding@resend.dev>';

    const processed: NotificationOutboxItem[] = [];
    const seenDedup = new Set<string>();

    for (const item of items) {
      if (item.status !== 'queued' && item.status !== 'failed') {
        processed.push(item);
        continue;
      }

      if (seenDedup.has(item.deduplicationKey)) {
        processed.push({
          ...item,
          status: 'cancelled',
          errorMessage: 'Duplicate notification suppressed by deduplication key.',
        });
        continue;
      }
      seenDedup.add(item.deduplicationKey);

      const nowIso = new Date().toISOString();
      if (resendApiKey) {
        try {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [item.recipientEmail],
              subject: item.subject,
              text: `${item.bodyPreview}\n\nEvent Reference: ${item.deduplicationKey}\nSent via ElderShield NotifyCare.`,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            processed.push({
              ...item,
              status: 'failed',
              attemptCount: item.attemptCount + 1,
              lastAttemptAt: nowIso,
              errorMessage: `Resend HTTP ${response.status}: ${errText.slice(0, 140)}`,
              deliveryMode: 'resend_live',
            });
          } else {
            processed.push({
              ...item,
              status: 'sent_live',
              attemptCount: item.attemptCount + 1,
              lastAttemptAt: nowIso,
              errorMessage: null,
              deliveryMode: 'resend_live',
            });
          }
        } catch (err) {
          processed.push({
            ...item,
            status: 'failed',
            attemptCount: item.attemptCount + 1,
            lastAttemptAt: nowIso,
            errorMessage: err instanceof Error ? err.message : 'Network error sending email',
            deliveryMode: 'resend_live',
          });
        }
      } else {
        // Explicit, honest demo simulation — never claims real email was dispatched
        processed.push({
          ...item,
          status: 'simulated_sent',
          attemptCount: item.attemptCount + 1,
          lastAttemptAt: nowIso,
          errorMessage: null,
          deliveryMode: 'demo_simulation',
        });
      }
    }

    res.json({
      deliveryMode: resendApiKey ? 'resend_live' : 'demo_simulation',
      realEmailDispatched: Boolean(resendApiKey),
      notice: resendApiKey
        ? 'Processed via Resend server-side email integration.'
        : 'Demo simulation mode: RESEND_API_KEY is not configured. Notifications were logged in the simulated outbox and NO real external emails were sent.',
      processed,
    });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ElderShield server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
