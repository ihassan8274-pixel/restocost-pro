// Money-to-cents migration: ONLY actual money fields (prices, costs, amounts, totals, VAT)
// NOT quantities, conversion factors, percentages, or counts

import fs from 'node:fs';

const MONEY_FIELDS = [
  // Prices & costs
  'unitPrice', 'unitCost', 'unitPricePU', 'purchaseUnitPrice', 'tradeUnitPrice',
  'price', 'cost', 'amount', 'subtotal', 'vat', 'vatAmount', 'vatRate',
  'tax', 'taxAmount', 'discount', 'balance', 'salary', 'paid', 'paidAmount',
  'creditLimit', 'baseSalary', 'allowances', 'deductions', 'bonus',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'costPerUsableKg', 'pricePerKg', 'yieldPercent',
  'exchangeRate', 'vatInclusive',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // Totals
  'totalAmount', 'totalValue', 'totalCost', 'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  'totalConsumedValue', 'totalConsumedQty',
  'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  'totalVarianceCost', 'varianceRate',
  'totalShortageValue', 'totalSurplusValue', 'netVarianceValue',
  'totalSystemCost', 'totalCountedCost', 'totalVariance', 'totalVarianceCost',
  'varianceRate', 'totalTheoreticalUsage', 'totalActualUsage', 'totalUsageVariance',
  // Financial
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // POS
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  'revenue', 'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // Financial
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // POS
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  // Financial
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // POS
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
  // Financial
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'vatAmount', 'vatRate', 'exchangeRate',
  'discount', 'varianceAmount', 'matchedAmount', 'varianceAmount',
  'purchaseCost', 'salvageValue', 'accumulatedDepreciation',
  'revenue', 'profit', 'loss', 'margin', 'marginPct',
  'foodCost', 'laborCost', 'operatingCost', 'wastageCost', 'profit', 'marginPct',
  // POS
  'totalSales', 'totalFood', 'totalLabor', 'totalNet',
];

// Fields that are QUANTITIES/CONVERSIONS - DO NOT MIGRATE
const QUANTITY_FIELDS = new Set([
  'quantity', 'totalQty', 'totalQtyPU', 'totalConsumedQty',
  'quantityReceived', 'quantityPU', 'purchaseQty', 'receivedQty',
  'purchaseUnitConversion', 'tradeUomConversion', 'conversion',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'minPU', 'maxPU', 'currentPU', 'purchaseUnitQty',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'quantity', 'delta', 'theoreticalQty', 'countedQty', 'actualQty', 'varianceQty',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'quantity', 'purchaseUnitQty', 'conversion', 'inventoryQty',
  'purchaseUnitQty', 'parsedTotal', 'total', 'inventoryTotal',
  'totalQty', 'totalQtyPU', 'totalConsumedQty',
  'totalQty', 'totalQtyPU', 'totalConsumedQty',
  'totalQty', 'totalQtyPU', 'totalConsumedQty',
  'quantity', 'totalQty', 'totalQtyPU', 'totalConsumedQty',
  'purchaseUnitConversion', 'tradeUomConversion', 'conversion',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'minPU', 'maxPU', 'currentPU', 'purchaseUnitQty',
  'quantity', 'delta', 'theoreticalQty', 'countedQty', 'actualQty', 'varianceQty',
  'minStockLevel', 'maxStockLevel', 'reorderPoint', 'leadTimeDays',
  'quantity', 'purchaseUnitQty', 'conversion', 'inventoryQty',
  'purchaseUnitQty', 'parsedTotal', 'total', 'inventoryTotal',
  'totalQty', 'totalQtyPU', 'totalConsumedQty',
]);

const UNIQUE_MONEY = [...new Set(MONEY_FIELDS)];
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
  
  for (const key of UNIQUE_MONEY) {
    if (QUANTITY_FIELDS.has(key)) continue;
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