// Money-to-cents migration: systematic rename of all money fields to *Cents (integer halalas)
// Strategy: add *Cents fields, keep old fields for now (deprecated), run migration script later
// This script processes TYPE FILES only — business logic updated separately

import fs from 'node:fs';
import path from 'node:path';

const MONEY_KEYS = [
  'totalAmount', 'totalValue', 'totalCost', 'totalQty', 'totalQtyPU', 'totalConsumedValue', 'totalConsumedQty',
  'unitPrice', 'unitCost', 'unitPricePU', 'purchaseUnitPrice', 'tradeUnitPrice',
  'price', 'cost', 'value', 'amount', 'subtotal', 'vat', 'vatAmount', 'vatRate',
  'tax', 'taxAmount', 'discount', 'balance', 'salary', 'paid', 'paidAmount',
  'creditLimit', 'baseSalary', 'allowances', 'deductions', 'bonus',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'costPerUsableKg', 'pricePerKg', 'yieldPercent',
  'exchangeRate', 'currencyCode', 'vatInclusive',
  'totalQty', 'totalValue', 'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  'totalConsumedValue', 'totalConsumedQty', 'totalTheoreticalUsage', 'totalActualUsage',
  'totalUsageVariance', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'varianceCost', 'totalValue', 'totalQtyPU',
  'lastPricePU', 'lastPriceDate', 'lastSupplierId', 'lastSupplierName',
  'minPU', 'maxPU', 'currentPU', 'quantityPU', 'lastPricePU',
  'purchaseUnitPrice', 'purchaseUnitConversion', 'purchaseQty',
  'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'subtotal', 'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  'totalConsumedValue', 'totalConsumedQty', 'totalTheoreticalUsage', 'totalActualUsage',
  'totalUsageVariance', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  'totalConsumedValue', 'totalConsumedQty', 'totalTheoreticalUsage', 'totalActualUsage',
  'totalUsageVariance', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
];

// Deduplicate
const UNIQUE_MONEY_KEYS = [...new Set(MONEY_KEYS)];

// Type files to process
const TYPE_FILES = [
  'src/types/procurement.ts',
  'src/types/inventory.ts',
  'src/types/financial.ts',
  'src/types/production.ts',
  'src/types/pos.ts',
  'src/types/labor.ts',
  'src/types/reports.ts',
  'src/types/expenses.ts',
];

function migrateFile(filePath) {
  if (!fs.existsSync(filePath)) return { file: filePath, changed: false, reason: 'not found' };
  
  let src = fs.readFileSync(filePath, 'utf8');
  const original = src;
  let changes = 0;
  
  // Pattern: fieldName: number  ->  fieldNameCents: number  (for money fields)
  // We only rename fields that are clearly money-related
  for (const key of UNIQUE_MONEY_KEYS) {
    // Match: `key: number` or `key?: number` or `key: number | ...`
    const pattern = new RegExp(`(\\b${key}\\b)(\\s*\\??)(\\s*:\s*number(?:\\s*\\|\\s*[^;,\\}]+)?\\s*[;,])`, 'g');
    src = src.replace(pattern, (match, name, optional, rest) => {
      changes++;
      return `${name}Cents${optional}${rest}`;
    });
  }
  
  if (src !== original) {
    fs.writeFileSync(filePath, src, 'utf8');
    return { file: filePath, changed: true, changes };
  }
  return { file: filePath, changed: false, changes: 0 };
}

let totalChanges = 0;
for (const f of TYPE_FILES) {
  const result = migrateFile(f);
  if (result.changed) {
    console.log(`${result.file}: ${result.changes} fields renamed`);
    totalChanges += result.changes;
  } else if (result.reason) {
    console.log(`${result.file}: ${result.reason}`);
  }
}
console.log(`\nTotal type fields renamed: ${totalChanges}`);