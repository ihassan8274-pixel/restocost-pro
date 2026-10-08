// Money-to-cents migration: rename all money fields to *Cents (integer halalas)

import fs from 'node:fs';
import path from 'node:path';

const MONEY_FIELDS = [
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
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  // inventory-specific
  'unitCost', 'unitPrice', 'purchaseUnitPrice', 'standardPrice', 'yieldPercentage',
  'pricePerKg', 'yieldPercent', 'grossWeight', 'pricePerKg', 'usableWeight', 'wasteWeight', 'costPerUsableKg',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays', 'purchaseUnitConversion',
  'tradeUomConversion', 'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'quantity', 'delta', 'theoreticalQty', 'countedQty', 'actualQty', 'varianceQty',
  'unitCost', 'varianceCost', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'transportCost', 'unitCost', 'purchaseUnitConversion', 'conversion',
  'unitCost', 'purchaseUnitQty', 'conversion', 'inventoryQty', 'unitCost',
  'purchaseUnitQty', 'parsedTotal', 'total', 'inventoryTotal',
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  'revenue', 'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  'totalConsumedValue', 'totalConsumedQty', 'totalTheoreticalUsage', 'totalActualUsage',
  'totalUsageVariance', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  // financial
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
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
  // pos
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  'revenue', 'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  'totalConsumedValue', 'totalConsumedQty', 'totalTheoreticalUsage', 'totalActualUsage',
  'totalUsageVariance', 'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
];

const UNIQUE = [...new Set(MONEY_FIELDS)];

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

let total = 0;
for (const f of TYPE_FILES) {
  if (!fs.existsSync(f)) { console.log('SKIP:', f); continue; }
  let src = fs.readFileSync(f, 'utf8');
  const original = src;
  
  for (const key of [...new Set(MONEY_FIELDS)]) {
    const pattern = new RegExp(`\\b${key}\\b(\\s*\\??)(\\s*:\\s*number(?:\\s*\\|\\s*[^;,\\}]+)?\\s*[;,])`, 'g');
    src = src.replace(pattern, (match, opt, rest) => {
      if (match.includes('Cents')) return match;
      return match.replace(key, key + 'Cents');
    });
  }
  
  if (src !== original) {
    fs.writeFileSync(f, src, 'utf8');
    console.log(`${f}: migrated`);
  }
}

console.log('done');