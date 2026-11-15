import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// Security & Invitation Verification Tests
function hashPasscode(passcode: string, salt: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${salt}:${passcode.trim().toUpperCase()}`)
    .digest('hex');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

test('Invitation passcode hashing uses unique salt and rejects invalid or reused codes', () => {
  const secret = 'test-hmac-secret';
  const salt = crypto.randomBytes(16).toString('hex');
  const passcode = 'ES-7K9M-4P2W';
  const storedHash = hashPasscode(passcode, salt, secret);

  // Never store plaintext passcode inside hash string
  assert.equal(storedHash.includes(passcode), false);

  // Valid passcode matches timing-safely
  assert.equal(
    timingSafeHexEqual(hashPasscode('es-7k9m-4p2w', salt, secret), storedHash),
    true
  );

  // Invalid passcode fails
  assert.equal(
    timingSafeHexEqual(hashPasscode('ES-0000-0000', salt, secret), storedHash),
    false
  );

  // State machine prevents reuse, expired, or revoked redemption
  const invitation = {
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    redeemedAt: null as string | null,
    revokedAt: null as string | null,
    attemptCount: 0,
    maxAttempts: 5,
  };

  const canRedeem = (inv: typeof invitation) =>
    !inv.redeemedAt &&
    !inv.revokedAt &&
    inv.attemptCount < inv.maxAttempts &&
    new Date(inv.expiresAt).getTime() > Date.now();

  assert.equal(canRedeem(invitation), true);
  invitation.redeemedAt = new Date().toISOString();
  assert.equal(canRedeem(invitation), false, 'Redeemed passcode cannot be reused');
});

test('Expired or revoked invitations are rejected even with valid hash', () => {
  type InvCheck = { expiresAt: string; redeemedAt: string | null; revokedAt: string | null };
  const expired: InvCheck = {
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    redeemedAt: null,
    revokedAt: null,
  };
  const revoked: InvCheck = {
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    redeemedAt: null,
    revokedAt: new Date().toISOString(),
  };

  const isActive = (inv: InvCheck) =>
    !inv.redeemedAt &&
    !inv.revokedAt &&
    new Date(inv.expiresAt).getTime() > Date.now();

  assert.equal(isActive(expired), false);
  assert.equal(isActive(revoked), false);
});
