// Qis Exchange Engine — Internal Crypto Module
//
// Per Secret Ownership Rule (BUSINESS_RULES_ADDENDUM.md):
// - Only Exchange Engine may decrypt an Exchange API Secret.
// - This module is the SOLE place that holds the Master Key.
// - Every other Engine (Strategy, Grid, Execution, Portfolio, AI, Notification)
//   and every API service must call Exchange Engine methods with the
//   ciphertext blob still encrypted; decryption happens only inside this file.
//
// Per TECH_STACK.md:
// - AES-256-GCM authenticated encryption
// - Envelope encryption: one Master Key (KEK) from env
// - keyVersion is BOTH embedded in the encrypted blob (version:iv:authTag:data)
//   AND stored per record in DB. The blob embedding makes decrypt() self-
//   describing after a Master Key rotation; the DB column is kept for indexing
//   and partial re-encryption.

import * as crypto from 'crypto';

export interface DecryptContext {
  exchangeAccountId?: string;
  userId?: string;
  purpose?: string;
}

export class ExchangeEngineCrypto {
  private readonly algorithm = 'aes-256-gcm';
  // Map of keyVersion -> master key buffer. When rotating, the OLD key MUST be
  // retained here so ciphertext encrypted with previous versions can still be
  // decrypted (forward compatibility of existing data). Only the entry for
  // `currentKeyVersion` is used by encrypt().
  private readonly masterKeys: Map<number, Buffer>;

  // Current KEK version. Bump this when the Master Key is rotated and
  // a re-encryption migration is in progress. Existing records keep their
  // stored keyVersion; new records tag with this number.
  private readonly currentKeyVersion = 1;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    this.masterKeys = new Map();
    this.masterKeys.set(this.currentKeyVersion, Buffer.from(key, 'hex'));
  }

  /**
   * Encrypts plaintext using AES-256-GCM with the current Master Key.
   * Returns version:iv:authTag:ciphertext (version is decimal, rest is base64)
   * as a single string. The version prefix lets decrypt() pick the correct
   * Master Key after a rotation.
   */
  encrypt(plainText: string): string {
    const masterKey = this.masterKeys.get(this.currentKeyVersion);
    if (!masterKey) {
      // Defensive: constructor seeds this map; should never trigger.
      throw new Error(
        `Master key for current version ${this.currentKeyVersion} is missing`,
      );
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
      this.currentKeyVersion.toString(),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Returns the key version that newly encrypted records should be tagged with.
   * Use this when persisting apiKeyKeyVersion / apiSecretKeyVersion.
   */
  getCurrentKeyVersion(): number {
    return this.currentKeyVersion;
  }

  /**
   * Decrypts a previously-encrypted blob. Emits an audit log per Rule #5.
   * The plaintext is returned for the Engine to use within the same function
   * scope (e.g. ccxt request), and must never be returned to the caller,
   * stored in a long-lived variable, or passed across Engine boundaries.
   */
  decrypt(encryptedText: string, context?: DecryptContext): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted format: expected version:iv:authTag:ciphertext');
    }
    const [versionStr, ivB64, authTagB64, dataB64] = parts;

    const version = Number.parseInt(versionStr, 10);
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error(`Invalid key version in encrypted blob: "${versionStr}"`);
    }

    const masterKey = this.masterKeys.get(version);
    if (!masterKey) {
      throw new Error(
        `No master key available for keyVersion=${version}. ` +
          'The record was likely encrypted with a rotated-out key. ' +
          'Re-encrypt via migration or restore the previous key to this process.',
      );
    }

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    const plaintext = decrypted.toString('utf8');

    // Audit log — NO plaintext, NO ciphertext. Only metadata.
    // Going to stdout (not NestJS Logger) because this class lives in the
    // engine package and must not depend on @nestjs/common.
    const audit = {
      event: 'secret.decrypt',
      keyVersion: version,
      exchangeAccountId: context?.exchangeAccountId,
      userId: context?.userId,
      purpose: context?.purpose,
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.log(`[ExchangeEngineCrypto] ${JSON.stringify(audit)}`);

    return plaintext;
  }
}
