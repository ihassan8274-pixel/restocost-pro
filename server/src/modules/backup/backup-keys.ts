// server/src/modules/backup/backup-keys.ts
//
// ============================================================================
//  WHICH KEYS BELONG IN A BACKUP — pure, zero dependencies, fully testable.
//
//  ⛔ WHY A SEPARATE MODULE:
//     core.mjs imports store.mjs, and store.mjs talks to the database. So a
//     module that imported COLLECTION_KEYS from core.mjs could only be tested
//     by opening the production database — which is exactly what the
//     production-db-safety guard exists to forbid.
//     Therefore COLLECTION_KEYS arrives as an argument.
//
//  ⛔ WHY THESE ARE NOT IN COLLECTION_KEYS:
//     COLLECTION_KEYS drives device sync (sync.mjs / data.mjs) and the
//     destructive /api/clear. The keys below are server-local state:
//       ① backup scheduling would be pushed to every device,
//       ② worse, rcerp_telegram_updates_offset is the bot's read cursor —
//          if devices tracked it, every device would replay old messages,
//       ③ /api/clear deletes all of COLLECTION_KEYS, which would zero the
//          offset and make the bot resend its entire history.
// ============================================================================

export const BACKUP_SETTINGS_KEY = 'rcerp_backup_settings';
export const VERIFY_LOG_KEY = 'rcerp_backup_verify_log';

/**
 * ⛔ Keys that must never enter a backup.
 *  rcerp_sessions    — login sessions. Restoring them revives expired ones
 *                      => authentication bypass.
 *  rcerp_rate_limits — throttle counters. Restoring them re-opens the way for
 *                      a bot that keeps guessing passwords.
 *  (both are also excluded from CDC in store.mjs, for the same reasons)
 *
 * ⛔ NOT here, on purpose: 'rcerp_telegram_'
 *    That is the CDC exclusion prefix in store.mjs, not a backup rule. Using
 *    it here would swallow 'rcerp_telegram_updates_offset' — the one key whose
 *    loss makes the bot replay every message it ever received.
 *    Its only real member, 'rcerp_telegram_settings', holds the bot token, but
 *    secrets.mjs encrypts it, so a backup carries ciphertext, not a token.
 */
export const NEVER_BACK_UP: readonly string[] = ['rcerp_sessions', 'rcerp_rate_limits'];

/** Single known keys: server-local state that must survive a restore. */
export const BACKUP_EXTRA_KEYS: readonly string[] = [
  BACKUP_SETTINGS_KEY,               // schedule + retention
  VERIFY_LOG_KEY,                    // verification history
  'rcerp_telegram_updates_offset',   // losing it => bot replays every old message
  'rcerp_webhooks',
  'rcerp_intake_aliases',
  'rcerp_tg_catalog_msgs',
];

/** One key per entity: 'rcerp_tg_flow:<chatId>' can never be a static list. */
export const BACKUP_PREFIXES: readonly string[] = [
  'rcerp_tg_flow:',      // telegram flow session per chat (2h TTL)
  'rcerp_tg_flow_msg:',  // message_id per chat, so the bot can edit its message
];

/**
 * ⭐ Saved in the backup but NOT compared by verifyBackup.
 * Both change in the same instant the backup is created, i.e. right after
 * snapshotAll(), so their content would always differ from live:
 *   rcerp_backup_settings   — the scheduler writes lastRunAt immediately after
 *   rcerp_backup_verify_log — createBackup appends an entry right after writing
 * Without this, /api/backups/verify-now reports a permanent mismatch, which
 * teaches you to ignore verification. It blocks comparison, never saving.
 */
export const VERIFY_EXCLUDE: ReadonlySet<string> = new Set([BACKUP_SETTINGS_KEY, VERIFY_LOG_KEY]);

interface KeyClassifier {
  isBlocked: (key: string) => boolean;
  isKnown: (key: string) => boolean;
  scrub: (data: Record<string, unknown>, counts?: Record<string, unknown>) => Record<string, unknown>;
}

/** Build the classifier for a given collection list. */
export const makeKeyClassifier = (collectionKeys: readonly string[]): KeyClassifier => {
  const collections = new Set(collectionKeys);
  const extra = new Set(BACKUP_EXTRA_KEYS);

  const isBlocked = (key: string): boolean =>
    NEVER_BACK_UP.some((prefix) => key.startsWith(prefix));

  const isKnown = (key: string): boolean => {
    if (isBlocked(key)) return false;
    if (collections.has(key)) return true;
    if (extra.has(key)) return true;
    return BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix));
  };

  /**
   * Belt-and-braces scrub, applied to a whole snapshot.
   * Removes blocked keys from both the payload and the counts, so a backup
   * file can never carry a session or a throttle counter.
   */
  const scrub = (data: Record<string, unknown>, counts?: Record<string, unknown>): Record<string, unknown> => {
    for (const key of Object.keys(data)) {
      if (!isBlocked(key)) continue;
      delete data[key];
      if (counts) delete counts[key];
    }
    return data;
  };

  return { isBlocked, isKnown, scrub };
};