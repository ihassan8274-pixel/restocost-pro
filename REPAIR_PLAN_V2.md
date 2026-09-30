# RestoCost ERP Pro — Comprehensive Repair & Refactoring Plan v2.0

**Last Updated**: 2025-09-27  
**Status**: Active Development  
**Build Status**: ✅ Passing (lint + build)

---

## 📊 Executive Summary

| Metric | Current | Target |
|--------|---------|--------|
| **AppContext Size** | 3,901 lines | < 500 lines (decompose) |
| **Components Migrated** | 6/100+ | 100% |
| **Domain Stores** | 10/10 | 100% |
| **Bundle Size (gz)** | ~2.5 MB | < 500 KB initial |
| **Test Coverage** | ~5% | > 70% critical paths |
| **TypeScript Errors** | 0 | 0 |

---

## 🎯 Current State Assessment

### ✅ **Completed (P0 + P1.1 + P1.2 + P1.3.1-1.3.6)**

| Phase | Task | Status |
|-------|------|--------|
| **P0** | Critical security & stability fixes | ✅ |
| **P1.1** | 4 Core Domain Stores (Inventory, Procurement, Recipes, Settings) | ✅ |
| **P1.2** | 6 Additional Domain Stores (Financial, HR, Reports, Sync, UI, Auth) | ✅ **10 total** |
| **P1.3.1** | `InventoryViewMigrated` | ✅ |
| **P1.3.2** | `PurchaseOrdersViewMigrated` | ✅ |
| **P1.3.3** | `RecipesViewMigrated` | ✅ |
| **P1.3.4** | `AccountingViewMigrated` | ✅ |
| **P1.3.5** | `LaborViewMigrated` | ✅ |
| **P1.3.6** | `InvoicesViewMigrated` | ✅ |

### 🔄 **In Progress (P1.3.7+)**

| Priority | Component | Domain Stores Needed | Est. Effort |
|----------|-----------|---------------------|-------------|
| 🔴 **Critical** | `DashboardView` | Multiple (selective) | 1-2 days |
| 🔴 **Critical** | `POSView` | Financial + Procurement | 2-3 days |
| 🔴 **Critical** | `POSView` (edit/delete) | Financial + Inventory | 1-2 days |
| 🟠 **High** | `SuppliersView` | Procurement | 1 day |
| 🟠 **High** | `ReportsCenterView` / `ReportsHubView` | Reports | 2-3 days |
| 🟠 **High** | `SystemSettingsView` | Multiple | 2-3 days |
| 🟢 **Medium** | `EmployeesView` / `LaborView` (complete) | HR | 1 day |
| 🟢 **Medium** | `POSView` (complete tabs) | Financial + Procurement | 1-2 days |

---

## 🏗️ Architecture Overview

### Frontend (React 19 + TypeScript + Vite + TailwindCSS 4)
```
src/
├── App.tsx                          # Root (uses AppProvider)
├── context/
│   ├── AppContext.tsx               # 3,901 lines - GOD CONTEXT (needs decompose)
│   ├── AppProvider                  # Thin wrapper
│   ├── DomainProvider.tsx           # Connects domain stores
│   └── domains/                     # 10 Domain Stores (Zustand)
│       ├── inventory.ts             # useInventory, useInventoryActions
│       ├── procurement.ts           # useSuppliers, usePurchaseOrders
│       ├── recipes.ts               # useRecipes, useRecipesActions
│       ├── settings.ts              # useBranches, useCurrencies, useSettingsActions
│       ├── financial.ts             # useAccounts, useInvoices, useFinancialActions
│       ├── hr.ts                    # useEmployees, useShifts, useHRActions
│       ├── reports.ts               # useAuditLogs, useReportsActions
│       ├── sync.ts                  # useOffline, useSyncActions
│       ├── ui.ts                    # useTheme, useToast, useUIActions
│       └── auth.ts                  # useCurrentUser, useAuthActions
├── components/                      # 100+ components (6 migrated)
└── types/                           # 13 type files
```

### Backend (Node.js ESM + Express + Prisma + PostgreSQL)
```
server/
├── index.js                         # Express entry (288 lines)
├── store.mjs                        # Data layer (PostgreSQL + SQLite fallback)
├── core.mjs                         # Shared helpers
├── repository.mjs                   # DB queries
├── repository.mjs                   # DB queries
├── intake*.mjs                      # Telegram/WhatsApp intake
├── pdf*.mjs                         # PDF generation
├── telegram.mjs                     # Bot integration
├── webhooks.mjs                     # External webhooks
├── routes/                          # 6 route modules
└── lib/prisma.ts                    # Prisma singleton
```

### Database (Prisma + PostgreSQL)
- **KV Store Pattern**: `model Kv { key String @id, value Json }` - backward compat
- **Relational Models**: Users, Sessions, AuditLog, Branches, Suppliers, RawMaterials, Recipes, Inventory, etc.
- **CDC**: ChangeLog table for incremental sync

---

## 🔍 Critical Issues Found

### 🔴 **Critical (P0 - Must Fix Immediately)**

| # | Issue | Location | Risk | Fix |
|---|-------|----------|------|-----|
| 1 | **AppContext is 3,901 lines** - God Context | `src/context/AppContext.tsx` | Re-renders entire app on any state change; memory leaks; untestable | Decompose into DomainProvider + selectors (started) |
| 2 | **No conflict resolution in Sync** | `server/store.mjs` + `useSyncCore` | Silent data loss on concurrent edits | Implement vector clocks + conflict UI |
| 3 | **KV Store anti-pattern** | `prisma/schema.prisma` + `store.mjs` | No ACID, no FK, no queries, migration hell | Migrate to relational (Strangler Fig) |
| 4 | **Memory leaks in AppContext** | `AppContext.tsx:862-864` | `appliedRefsRef` Map grows unbounded | Add cleanup intervals |
| 5 | **Prisma connection pool exhaustion** | `server/store.mjs:406-408` | New PrismaClient per request | Singleton pattern (✅ fixed in lib/prisma.ts) |

### 🟠 **High Priority (P1)**

| # | Issue | Location | Risk |
|---|-------|----------|------|
| 6 | **Bundle size 2.5MB gzipped** | `vite build` | Slow 3G/mobile; exceljs 271KB, jspdf 113KB, recharts 78KB |
| 7 | **No API versioning** | `/api/*` | Breaking changes = broken clients |
| 8 | **No pagination on collections** | `/api/bootstrap`, `/api/collections` | OOM on large datasets |
| 9 | **No test coverage** | < 5% | Regressions undetected |
| 10 | **No observability** | No metrics/logging | Blind in production |
| 11 | **POSReturn/POSOrder status types** | `src/types/pos.ts` | Type errors in components |
| 11 | **Memory leak in sync** | `useSyncCore` | `pendingSaves` Map unbounded |

### 🟡 **Medium Priority (P2)**

| # | Issue | Location |
|---|-------|----------|
| 12 | No E2E tests | Playwright not configured |
| 13 | No CI/CD pipeline | Manual deploy |
| 14 | No API documentation | OpenAPI exists but not published |
| 15 | Docker not configured | Manual server setup |
| 15 | Secrets in .env files | JWT_SECRET in repo |

---

## 📋 Detailed Repair Plan

### Phase P0: Critical Fixes (Week 1-2) ✅ **COMPLETED**

| Task | Status | Details |
|------|--------|---------|
| P0.1 Rotate JWT secrets | ✅ | New secrets generated |
| P0.2 Prisma singleton | ✅ | `server/lib/prisma.ts` |
| P0.3 Connection pool config | ✅ | `connection_limit=20` in DATABASE_URL |
| P0.4 Auth hardening | ✅ | `mustChangePassword` on ALL endpoints |
| P0.5 Rate limiting on login | ✅ | IP + account tracking |
| P0.6 Memory leak prevention | ✅ | Cleanup intervals in AppContext |
| P0.7 Backup strategy | ✅ | `scripts/backup-cron.sh/.bat` |

---

### Phase P1: Architecture Refactoring (Week 3-10)

#### P1.1: Domain Stores ✅ **COMPLETED** (10 stores)
| Store | File | Key Selectors |
|-------|------|---------------|
| Inventory | `domains/inventory.ts` | `useInventory`, `useInventoryActions` |
| Procurement | `domains/procurement.ts` | `useSuppliers`, `usePurchaseOrders` |
| Recipes | `domains/recipes.ts` | `useRecipes`, `useRecipesActions` |
| Settings | `domains/settings.ts` | `useBranches`, `useCurrencies`, `useSettingsActions` |
| Financial | `domains/financial.ts` | `useAccounts`, `useInvoices`, `useFinancialActions` |
| HR | `domains/hr.ts` | `useEmployees`, `useShifts`, `useHRActions` |
| Reports | `domains/reports.ts` | `useAuditLogs`, `useReportsActions` |
| Sync | `domains/sync.ts` | `useOffline`, `useSyncActions` |
| UI | `domains/ui.ts` | `useTheme`, `useToast`, `useUIActions` |
| Auth | `domains/auth.ts` | `useCurrentUser`, `useAuthActions` |

#### P1.2: Component Migration (6/100+ done)

| Component | Status | Domain Stores Used |
|-----------|--------|-------------------|
| `InventoryViewMigrated` | ✅ | `useInventory`, `useSettingsStore`, `useProcurementStore`, `useAuthStore`, `useUIStore` |
| `PurchaseOrdersViewMigrated` | ✅ | `useProcurementStore`, `useSettingsStore`, `useAuthStore`, `useFinancialStore` |
| `RecipesViewMigrated` | ✅ | `useRecipesStore`, `useSettingsStore`, `useAuthStore`, `useFinancialStore`, `useUIStore` |
| `AccountingViewMigrated` | ✅ | `useFinancialStore`, `useSettingsStore`, `useAuthStore`, `useUIStore` |
| `LaborViewMigrated` | ✅ | `useHRStore`, `useSettingsStore`, `useAuthStore`, `useUIStore` |
| `InvoicesViewMigrated` | ✅ | `useFinancialStore`, `useSettingsStore`, `useAuthStore`, `useProcurementStore` |

#### P1.3: Remaining Component Migration (Priority Order)

| Week | Component | Domain Stores | Effort |
|------|-----------|---------------|--------|
| 1 | `DashboardView` | Multiple (selective) | 1-2 days |
| 1 | `POSView` (migrate) | Financial + Procurement | 2-3 days |
| 2 | `SuppliersView` | Procurement | 1 day |
| 2 | `ReportsCenterView` / `ReportsHubView` | Reports | 2-3 days |
| 3 | `SystemSettingsView` | Multiple | 2-3 days |
| 3 | `EmployeesView` | HR | 1 day |
| 3 | `POSView` (complete) | Financial + Procurement | 1-2 days |

**Migration Pattern:**
```tsx
// BEFORE (useApp - full re-render)
const { invoices, customers, branches, getBranchName, addInvoice, ... } = useApp();

// AFTER (domain selectors - isolated re-renders)
const invoices = useFinancialStore(s => s.invoices);
const customers = useFinancialStore(s => s.customers);
const branches = useSettingsStore(s => s.branches);
const getBranchName = useSettingsStore(s => s.getBranchName);
const { addInvoice, updateInvoice, deleteInvoice } = useFinancialStore(s => ({
  addInvoice: s.addInvoice,
  updateInvoice: s.updateInvoice,
  deleteInvoice: s.deleteInvoice,
}));
```

#### P1.4: Sync Engine v2 (Week 7-8)
- **Vector Clocks** for conflict detection
- **Conflict Resolution UI** in SyncStrip
- **Pagination** on all collection endpoints
- **API Versioning** via `Accept-Version` header

#### P1.5: API Improvements (Week 9-10)
- Default pagination on all collections > 100 records
- `ETag` / `If-None-Match` for conditional requests
- OpenAPI spec published via Swagger UI

---

### Phase P2: Database Migration (Week 11-18)

**Strategy: Strangler Fig Pattern** - Migrate one domain at a time

| Phase | Domain | Tables | Effort |
|-------|--------|--------|--------|
| 1 | Inventory + POS Orders | `inventory_records`, `pos_orders` | 2 weeks |
| 2 | Recipes + Recipe Inventory | `recipes`, `recipe_inventory` | 2 weeks |
| 3 | Procurement | suppliers, purchase_orders, grn | 2 weeks |
| 4 | Financial | accounts, journal_entries, pl_summaries | 2 weeks |
| 5 | HR | employees, shifts, attendance, payroll | 2 weeks |
| 6 | Reports | custom_reports, scheduled_reports | 1 week |

**Migration Pattern per Domain:**
1. Add Prisma models to `schema.prisma`
2. Create service layer (`server/services/*.service.ts`)
3. Dual-write period (2 weeks) - write to both KV + relational
4. Frontend migration to new API endpoints
3. Cutover - remove KV keys, add FKs

---

### Phase P3: Performance & Bundle (Week 19-22)

| Task | Technique | Target |
|------|-----------|--------|
| Lazy load heavy libs | Dynamic imports | exceljs, jspdf, recharts, xlsx only on demand |
| Virtualized lists | `@tanstack/react-virtual` | Tables > 100 rows |
| Memoization | `React.memo`, `useMemo`, `useCallback` | Prevent re-renders |
| DB indexes | Prisma `@@index` | Query < 50ms |
| Redis caching | Sessions + query cache | < 10ms p95 |
| React Query | Server state management | Replace manual fetch |

**Bundle Targets:**
| Metric | Current | Target |
|--------|---------|--------|
| Initial JS (gz) | 2.5 MB | < 500 KB |
| Largest chunk | 940 KB (exceljs) | < 100 KB (lazy) |
| Time to Interactive | ~5s | < 2s |

---

### Phase P4: Testing & Observability (Week 23-28)

| Layer | Tool | Target Coverage |
|-------|------|-----------------|
| Unit | Vitest | 80% business logic |
| Integration | Vitest + Testcontainers | 60% API routes |
| E2E | Playwright | 100% critical paths |
| Contract | Pact | API contracts |

**Observability Stack:**
- **Metrics**: Prometheus + Grafana (HTTP latency, sync queue, DB queries)
- **Logs**: Pino + Loki (structured JSON)
- **Traces**: OpenTelemetry (distributed tracing)
- **Alerts**: PagerDuty / Slack

**Critical E2E Paths:**
1. Login → POS Sale → Sync → Logout
2. Purchase Request → PO → GRN → Inventory Update
3. Recipe Cost Calculation → Menu Engineering Report
4. Monthly Inventory Count → Close → PL Rebuild
5. Offline Mode → Make Changes → Reconnect → Sync

---

### Phase P5: Developer Experience (Week 29-32)

| Task | Deliverable |
|------|-------------|
| Docker Compose dev env | `docker-compose.yml` (PostgreSQL, Redis, Backend, Frontend) |
| CI/CD Pipeline | GitHub Actions (lint, test, build, e2e) |
| Architecture Docs | `ARCHITECTURE.md`, `SYNC_PROTOCOL.md` |
| API Reference | OpenAPI/Swagger UI |
| Deployment Guide | `DEPLOYMENT_GUIDE.md` |
| Contributing Guide | `CONTRIBUTING.md` |

---

## 📅 Timeline Summary

| Week | Phase | Focus |
|------|-------|-------|
| 1-2 | P0 | ✅ Security & Stability |
| 3-6 | P1.1-P1.2 | ✅ Domain Stores + 6 Components |
| 7-8 | P1.3 | Component Migration (Dashboard, POS, Suppliers) |
| 9-10 | P1.4-P1.5 | Sync Engine v2 + API Versioning |
| 11-18 | P2 | Database Migration (KV → Relational) |
| 19-22 | P3 | Performance & Bundle Optimization |
| 23-28 | P4 | Testing + Observability |
| 29-32 | P5 | DX + Documentation |

---

## 🎯 Success Criteria (Definition of Done)

| Criterion | Measurement |
|-----------|-------------|
| **Zero critical security findings** | `npm audit` + manual review |
| **Bundle < 500 KB gzipped initial** | `vite build && gzip-size dist/assets/index-*.js` |
| **Sync conflicts < 1/month** | Telemetry metric |
| **API p95 < 200ms** | Prometheus histogram |
| **Zero data loss incidents** | Audit log reconciliation |
| **Test coverage > 70%** | `npm run test:repo -- --coverage` |
| **Deploy frequency > 1/week** | CI/CD pipeline success rate |
| **MTTR < 30 min** | Incident logs |

---

## 👥 Team Assignments (Suggested)

| Role | Focus Areas |
|------|-------------|
| **Tech Lead** | Architecture decisions, P1.3, P1.4, code reviews |
| **Backend Dev 1** | P0, P1.3, P2 (migrations), P3.4, P4.2 |
| **Backend Dev 2** | P1.2 (server sync), P3.5 (Redis), P5.1-5.2 |
| **Frontend Dev 1** | P1.1 (context split), P3.1-3.3, P4.1 (unit) |
| **Frontend Dev 2** | P1.2 (conflict UI), P1.4, P3.2, P5.3 |
| **QA/DevOps** | P4 (all), P5.1-5.2, monitoring setup |

---

## 🚨 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| P1.1 breaks existing features | High | High | Feature flags, incremental rollout, extensive tests |
| P2 migration data mismatch | Medium | Critical | Dual-write period, automated comparison scripts |
| Sync v2 complexity delays | High | Medium | Time-box spikes, fallback to current sync |
| Bundle optimization regressions | Medium | Medium | Visual regression tests, bundle size CI gate |
| Team capacity insufficient | High | High | Prioritize P0+P1 only, defer P3-P5 if needed |

---

## 📝 Notes & Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-26 | Start with P0 security fixes | Immediate risk mitigation |
| 2026-09-26 | Zustand over Redux for domain stores | Simpler, smaller, React 19 compatible |
| 2026-09-26 | Strangler Fig for DB migration | Zero-downtime, rollback safety |
| 2026-09-26 | Vector clocks for sync conflicts | Proven pattern (DynamoDB, Riak) |
| 2026-09-26 | Playwright over Cypress | Better multi-tab/offline testing |

---

## 🚨 Next Immediate Actions

1. **This Week**: Start `DashboardView` migration (highest user impact)
2. **This Week**: Complete `POSView` migration (revenue critical)
3. **This Week**: Begin Sync Engine v2 spike (vector clocks)
4. **Next Week**: Start `SuppliersView` + `ReportsCenterView` migration

---

**Document Owner**: Tech Lead  
**Review Cadence**: Weekly (Monday standup)  
**Next Review**: 2025-10-03