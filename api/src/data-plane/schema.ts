// =============================================================================
//  api/src/data-plane/schema.ts -- per-company Drizzle schema
//
//  ONE DATABASE PER COMPANY. There is no shared table and no cross-company
//  query in this file by design: a company's data cannot leak into another's
//  report even by accident, because the second database does not exist.
//
//  ⛔ WHY pos_item_map IS KEYED ON (pos_source, pos_item_id)
//     Not `foodics_item_map`. Foodics is a vendor name, and hardcoding it in a
//     table name means adding a second POS is a schema migration on every
//     company database. Keying on the source makes it config-only: the Control
//     Plane sets `pos.source` and the ingest path follows.
//
//  ⛔ WHY file_fingerprint IS TEXT, NOT varchar(128)
//     Measured over the 744 real exports: `dedupeKey()` output runs 1,992 to
//     3,812 characters. A varchar(128) column declared in an earlier draft
//     would have truncated every fingerprint, collapsing distinct reports
//     together -- a silent double count wearing a database constraint's
//     clothes. The column is `text` and the unique constraint is real.
//
//  ⛔ WHY THE UNIQUE CONSTRAINTS BELOW ARE NOT OPTIONAL
//     The dedupe is enforced in application code by `buildIngestPlan()`. That is
//     necessary and not sufficient: an import interrupted halfway and re-run
//     would double every row, and the plan's in-memory `seenKeys` set is gone
//     by then. The constraints make the database refuse.
// =============================================================================

import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  text,
  boolean,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── pos_item_map ────────────────────────────────────────────────────────────

/**
 *  ⭐ The join between a POS item and our own product.
 *
 *  `name_en` is NULL, never '', when unfilled. An empty string and "not
 *  translated yet" are different states and the report layer has to tell them
 *  apart to prompt for the English name. It is never backfilled from the
 *  Arabic name: a machine transliteration presented as a human translation is
 *  worse than an empty field, and the existing 25 seeded values contain real
 *  errors (`مطبق جبن سايل` -> "Caream Cheese").
 */
export const posItemMap = pgTable(
  'pos_item_map',
  {
    id: serial('id').primaryKey(),
    posSource: varchar('pos_source', { length: 16 }).notNull(),   // foodics | none
    posItemId: varchar('pos_item_id', { length: 64 }).notNull(), // the vendor's own id
    itemNameAr: varchar('item_name_ar', { length: 256 }),
    nameEn: varchar('name_en', { length: 256 }),                 // NULL until entered
    category: varchar('category', { length: 64 }),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // ⭐⭐ The composite key the whole POS-agnostic design rests on.
    vendorKey: uniqueIndex('pos_item_map_source_item_uq').on(t.posSource, t.posItemId),
  }),
);

// ── ingestion_batches ───────────────────────────────────────────────────────

/**
 *  ⭐ One row per file that was read.
 *
 *  `business_date` is a DATE taken from the file's OWN "date range" row. It is
 *  never the folder name and never the import timestamp: measured, 336 of 744
 *  files sit in a folder whose name contradicts their own content, and
 *  `10.2026/5..31` are September reports wearing an October folder.
 *
 *  Duplicates are recorded, not discarded -- `duplicate_of` points at the batch
 *  that was actually kept. Deleting them would leave no evidence that 336 files
 *  arrived, which is exactly the question someone asks after a bad import.
 */
export const ingestionBatches = pgTable(
  'ingestion_batches',
  {
    id: serial('id').primaryKey(),
    sourceFile: text('source_file').notNull(),           // full path as collected
    fileFingerprint: text('file_fingerprint').notNull(), // content fingerprint, 2-4 KB
    businessDate: date('business_date'),                 // NULL if the file had no range
    dateFrom: varchar('date_from', { length: 12 }),
    dateTo: varchar('date_to', { length: 12 }),
    branchRef: varchar('branch_ref', { length: 16 }),
    reportShape: varchar('report_shape', { length: 16 }), // by_branch | by_product
    rowCount: integer('row_count'),
    status: varchar('status', { length: 16 }).default('pending').notNull(),
    // pending | ingested | duplicate | rejected
    duplicateOf: integer('duplicate_of'),
    rejectReason: text('reject_reason'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // ⛔⛔ NO unique index on file_fingerprint, and that is deliberate.
    //
    //   A first draft had `uniqueIndex(...).on(t.fileFingerprint)` here, on the
    //   theory that it would stop a re-import. It does -- and it also makes the
    //   `duplicate_of` column unreachable, because a second file with the same
    //   fingerprint cannot be inserted at all. Measured on the real import:
    //   744 files read, 408 written, and every one of the 336 duplicate files
    //   vanished with no record. The operator cannot then answer "those totals
    //   look high, did you double-import?" -- the evidence was deleted by the
    //   constraint that was supposed to protect them.
    //
    //   Re-import safety comes from pos_order_lines_slot_uq instead, which
    //   keys on the transaction's real identity. Duplicate FILES are recorded;
    //   duplicate TRANSACTIONS are refused.
    //
    //   ⭐ source_file IS unique. One physical file must occupy one row across
    //   repeated runs, or a re-run grows the table without adding information
    //   and the 744-vs-408 count stops meaning anything.
    sourceUq: uniqueIndex('ingestion_batches_source_file_uq').on(t.sourceFile),
    fingerprintIdx: index('ingestion_batches_fingerprint_idx').on(t.fileFingerprint),
    dateIdx: index('ingestion_batches_business_date_idx').on(t.businessDate),
    branchIdx: index('ingestion_batches_branch_ref_idx').on(t.branchRef),
  }),
);

// ── branches ────────────────────────────────────────────────────────────────

/**
 *  ⭐ One row per branch. `ref` is the vendor's own stable code (B02, B08...).
 *
 *  Legacy code matched branch names by fuzzy Arabic string comparison. That is
 *  unnecessary here: measured across the 744 files, all 12 branches have one
 *  unchanging ref, so the ref is the join key and the Arabic name is only ever
 *  display text.
 */
export const branches = pgTable(
  'branches',
  {
    id: serial('id').primaryKey(),
    ref: varchar('ref', { length: 16 }).notNull(),
    nameAr: varchar('name_ar', { length: 256 }),
    nameEn: varchar('name_en', { length: 256 }), // NULL until entered
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    refUq: uniqueIndex('branches_ref_uq').on(t.ref),
  }),
);

// ── pos_order_lines ─────────────────────────────────────────────────────────

/**
 *  ⭐ One row per branch x item x business day, after deduplication.
 *
 *  ⛔ MONEY IS `numeric`, NOT FLOAT. Measured across 16,044 rows, the exports
 *     carry 5 decimal places (2286.51633). Summing those in a double and
 *     storing the result is how a report ends up a halala away from the truth.
 *
 *  ⛔ net_sales IS STORED, NOT RECOMPUTED. Foodics computes
 *     `profit = net_sales - cost`, and that identity holds on all 16,044 rows
 *     with a maximum error of 0.0000. Keeping net_sales lets the food-cost
 *     report divide cost by the figure the vendor actually divided by, and it
 *     turns a corrupted import into a detectable one.
 */
export const posOrderLines = pgTable(
  'pos_order_lines',
  {
    // ⭐ A plain serial, deliberately. A 34-day import is ~8.8k rows; a company
    //    ingesting years of daily exports reaches millions, not billions. An
    //    integer overflow here would be a silent wrong id, and the extra 4
    //    bytes per row buys nothing at this scale.
    id: serial('id').primaryKey(),
    posSource: varchar('pos_source', { length: 16 }).notNull(),
    posItemId: varchar('pos_item_id', { length: 64 }).notNull(),

    branchRef: varchar('branch_ref', { length: 16 }).notNull(),
    businessDate: date('business_date').notNull(),

    quantitySold: numeric('quantity_sold', { precision: 12, scale: 3 }).notNull(),
    grossSales: numeric('gross_sales', { precision: 14, scale: 5 }).notNull(), // incl. VAT
    netSales: numeric('net_sales', { precision: 14, scale: 5 }).notNull(),
    cost: numeric('cost', { precision: 14, scale: 5 }).notNull(),
    profit: numeric('profit', { precision: 14, scale: 5 }).notNull(),

    vat: numeric('vat', { precision: 14, scale: 5 }),
    discount: numeric('discount', { precision: 14, scale: 5 }),
    totalExVat: numeric('total_ex_vat', { precision: 14, scale: 5 }),
    returnAmount: numeric('return_amount', { precision: 14, scale: 5 }),
    returnQty: numeric('return_qty', { precision: 12, scale: 3 }),
    cancelAmount: numeric('cancel_amount', { precision: 14, scale: 5 }),
    cancelQty: numeric('cancel_qty', { precision: 12, scale: 3 }),

    ingestionBatchId: integer('ingestion_batch_id')
      .notNull()
      .references(() => ingestionBatches.id),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // ⭐⭐⭐ The deduplication guarantee, enforced by the database rather than
    //    by a Set that only exists for the length of one Node process.
    //    A re-import of the same file now fails loudly instead of doubling
    //    the month's revenue.
    slotUq: uniqueIndex('pos_order_lines_slot_uq').on(
      t.posSource,
      t.posItemId,
      t.branchRef,
      t.businessDate,
    ),
    batchIdx: index('pos_order_lines_batch_idx').on(t.ingestionBatchId),
    dateIdx: index('pos_order_lines_business_date_idx').on(t.businessDate),
    branchIdx: index('pos_order_lines_branch_ref_idx').on(t.branchRef),
    itemIdx: index('pos_order_lines_item_idx').on(t.posItemId),
  }),
);

export type PosItemMapRow = typeof posItemMap.$inferSelect;
export type PosOrderLineRow = typeof posOrderLines.$inferSelect;
export type IngestionBatchRow = typeof ingestionBatches.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;