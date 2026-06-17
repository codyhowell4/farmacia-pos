# Phase 3 — Inventory Intelligence & Reorder Automation
## Architecture Plan, Audit Results & Implementation Roadmap

**Date:** 2026-06-05
**Status:** Audit Complete ✅ | Plan Ready

---

## 1. AUDIT RESULTS — Data Availability Confirmation

### 1.1 Required Tables Exist ✅

| Table | Status | Key Columns for Phase 3 |
|-------|--------|------------------------|
| `inventory` | ✅ Exists | `id`, `org_id`, `location_id`, `name`, `quantity`, `cost`, `price`, `low_stock_threshold`, `expiration_date`, `requires_prescription`, `sales_count`, `supplier_id` (added P2) |
| `sales` | ✅ Exists | `id`, `org_id`, `location_id`, `timestamp`, `voided` |
| `sale_items` | ✅ Exists | `id`, `sale_id`, `inventory_id`, `quantity`, `price` |
| `suppliers` | ✅ Exists | `id`, `org_id`, `name`, `contact`, `phone`, `email` |
| `supplier_products` | ✅ Exists | `id`, `supplier_id`, `inventory_id`, `lead_time_days`, `last_cost`, `preferred` |
| `locations` | ✅ Exists | `id`, `org_id`, `name`, `address` |
| `purchase_orders` | ✅ Exists | `id`, `org_id`, `supplier_id`, `status`, `created_at` |
| `purchase_order_items` | ✅ Exists | `id`, `po_id`, `medicine_name`, `quantity`, `unit_cost` |
| `inventory_batches` | ✅ Exists | `id`, `org_id`, `inventory_id`, `batch_number`, `quantity`, `expiration_date`, `received_date`, `po_id` |
| `inventory_movements` | ✅ Exists | `id`, `org_id`, `inventory_id`, `quantity_change`, `type`, `reference_id`, `created_at` |

### 1.2 Sales History Exists ✅

- `sales.timestamp` records every transaction datetime
- `sale_items` records every line item with `inventory_id` and `quantity`
- `sales.voided` boolean allows filtering out cancelled transactions
- `sales.location_id` allows location-scoped analysis
- `sales.org_id` ensures multi-tenant isolation

### 1.3 Supplier Relationships Exist ✅

- `inventory.supplier_id` → `suppliers(id)` (added in P2 migration)
- `supplier_products` junction table with `lead_time_days` per supplier+product
- `purchase_orders.supplier_id` links orders to suppliers
- `getInventoryWithSupplier()` already joins suppliers in db.js

### 1.4 Inventory Movement History Exists ✅

- `inventory_movements` tracks all quantity changes with `type` (sale, return, adjustment, purchase, edit)
- `inventory.sales_count` tracks cumulative sales
- `inventory_batches` tracks per-lot receipts and expiry

### 1.5 Multi-Location Support Exists ✅

| Table | `org_id` | `location_id` |
|-------|----------|---------------|
| `inventory` | NOT NULL | nullable FK |
| `sales` | NOT NULL | nullable FK |
| `shifts` | NOT NULL | nullable FK |
| `audit_log` | nullable | nullable FK |

All sales and inventory queries can be scoped by `location_id`. The existing `getInventoryWithSupplier(locationId)` and `getRecentSales(locationId)` already support location filtering.

### 1.6 Existing Reorder Functionality (Pre-Phase 3)

| Component | What It Does | Gap for P3 |
|-----------|-------------|------------|
| `AdminInventory.jsx` | 30-day velocity, stock days projection, reorder flags, expiring items, total value | No 60/90-day ADS, no fast/slow/top movers, no risk score |
| `AdminReorderReport.jsx` | Low-stock list, CSV export, `suggestedQty = threshold*2 - current` | No formal reorder point formula, no safety stock, no lead time, no supplier grouping |
| `AdminSuppliers.jsx` | `suggestReorder()` with 30-day velocity, 60-day target for POs | Only for PO creation, not a standalone report |
| `getInventoryLowStock()` | Returns inventory where `quantity <= low_stock_threshold` | Client-side filter only, no velocity calculation |

---

## 2. ARCHITECTURE PLAN

### 2.1 Design Principles

1. **Server-side calculations** — All velocity, reorder point, and risk calculations run in PostgreSQL. The frontend is display-only.
2. **Zero impact on existing workflows** — No changes to checkout, inventory deduction, prescription, supplier, or POS code.
3. **Location-aware by default** — All queries accept an optional `location_id` parameter.
4. **Configurable defaults** — Lead time and safety stock defaults are stored per-organization, overridable per-product via `supplier_products`.
5. **Incremental enhancement** — Replace/enhance existing `AdminInventory.jsx` and `AdminReorderReport.jsx` rather than creating entirely new pages.

### 2.2 Database Layer (PostgreSQL)

#### New Table: `inventory_settings`

Stores organization-level defaults for reorder calculations.

```sql
CREATE TABLE inventory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  default_lead_time_days integer NOT NULL DEFAULT 7,
  critical_safety_stock_days integer NOT NULL DEFAULT 7,
  normal_safety_stock_days integer NOT NULL DEFAULT 3,
  reorder_lookback_days integer NOT NULL DEFAULT 30,
  critical_medication_types text[] DEFAULT ARRAY['prescription'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);
```

#### New PostgreSQL Function: `get_inventory_intelligence(p_org_id, p_location_id)`

Returns one row per inventory item with all calculated metrics.

```sql
SELECT
  i.*,
  s.name as supplier_name,
  -- Sales velocity (units sold / days)
  COALESCE(sales_30.total_qty, 0) / 30.0 as avg_daily_sales_30,
  COALESCE(sales_60.total_qty, 0) / 60.0 as avg_daily_sales_60,
  COALESCE(sales_90.total_qty, 0) / 90.0 as avg_daily_sales_90,
  -- Days of inventory remaining
  CASE WHEN COALESCE(sales_30.total_qty, 0) > 0
    THEN i.quantity / (sales_30.total_qty / 30.0)
    ELSE NULL
  END as days_of_inventory,
  -- Lead time (from supplier_products or default)
  COALESCE(sp.lead_time_days, settings.default_lead_time_days, 7) as lead_time_days,
  -- Safety stock
  CASE WHEN i.requires_prescription
    THEN COALESCE(sales_30.total_qty, 0) / 30.0 * COALESCE(settings.critical_safety_stock_days, 7)
    ELSE COALESCE(sales_30.total_qty, 0) / 30.0 * COALESCE(settings.normal_safety_stock_days, 3)
  END as safety_stock,
  -- Reorder point
  (COALESCE(sales_30.total_qty, 0) / 30.0 * COALESCE(sp.lead_time_days, settings.default_lead_time_days, 7))
  + (CASE WHEN i.requires_prescription THEN COALESCE(sales_30.total_qty, 0) / 30.0 * 7 ELSE COALESCE(sales_30.total_qty, 0) / 30.0 * 3 END)
  as reorder_point,
  -- Recommended reorder quantity
  GREATEST(0,
    (COALESCE(sales_30.total_qty, 0) + safety_stock) - i.quantity
  ) as recommended_qty,
  -- Stockout risk score (0-100)
  CASE
    WHEN i.quantity = 0 THEN 100
    WHEN days_of_inventory IS NULL THEN 0
    WHEN days_of_inventory <= 7 THEN 80 + (7 - days_of_inventory) * 3
    WHEN days_of_inventory <= 14 THEN 50 + (14 - days_of_inventory) * 4
    WHEN days_of_inventory <= 30 THEN 20 + (30 - days_of_inventory)
    ELSE 0
  END as stockout_risk_score,
  -- Inventory value
  i.quantity * i.cost as inventory_value,
  -- Turnover (90-day)
  CASE WHEN i.quantity > 0 THEN COALESCE(sales_90.total_qty, 0) / i.quantity ELSE 0 END as turnover_90d
FROM inventory i
LEFT JOIN suppliers s ON s.id = i.supplier_id
LEFT JOIN supplier_products sp ON sp.inventory_id = i.id AND sp.preferred = true
LEFT JOIN inventory_settings settings ON settings.org_id = i.org_id
-- 30-day sales
LEFT JOIN (
  SELECT si.inventory_id, SUM(si.quantity) as total_qty
  FROM sale_items si
  JOIN sales sa ON sa.id = si.sale_id
  WHERE sa.timestamp >= NOW() - INTERVAL '30 days'
    AND sa.voided = false
    AND sa.org_id = p_org_id
  GROUP BY si.inventory_id
) sales_30 ON sales_30.inventory_id = i.id
-- 60-day sales
LEFT JOIN (
  SELECT si.inventory_id, SUM(si.quantity) as total_qty
  FROM sale_items si
  JOIN sales sa ON sa.id = si.sale_id
  WHERE sa.timestamp >= NOW() - INTERVAL '60 days'
    AND sa.voided = false
    AND sa.org_id = p_org_id
  GROUP BY si.inventory_id
) sales_60 ON sales_60.inventory_id = i.id
-- 90-day sales
LEFT JOIN (
  SELECT si.inventory_id, SUM(si.quantity) as total_qty
  FROM sale_items si
  JOIN sales sa ON sa.id = si.sale_id
  WHERE sa.timestamp >= NOW() - INTERVAL '90 days'
    AND sa.voided = false
    AND sa.org_id = p_org_id
  GROUP BY si.inventory_id
) sales_90 ON sales_90.inventory_id = i.id
WHERE i.org_id = p_org_id
  AND (p_location_id IS NULL OR i.location_id = p_location_id);
```

#### New PostgreSQL Function: `get_reorder_recommendations(p_org_id, p_location_id)`

Wrapper around `get_inventory_intelligence` that filters to items needing reorder.

```sql
SELECT * FROM get_inventory_intelligence(p_org_id, p_location_id)
WHERE recommended_qty > 0 OR quantity = 0 OR days_of_inventory <= 30
ORDER BY stockout_risk_score DESC, days_of_inventory ASC;
```

#### Index Recommendations

```sql
-- For sales date-range queries (critical for velocity calculations)
CREATE INDEX IF NOT EXISTS idx_sales_timestamp_voided_org ON sales(timestamp, voided, org_id);

-- For location-scoped sales
CREATE INDEX IF NOT EXISTS idx_sales_timestamp_location ON sales(timestamp, voided, org_id, location_id);

-- For sale_items aggregation by inventory
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory_sale ON sale_items(inventory_id, sale_id, quantity);
```

### 2.3 Data Layer (db.js)

#### New Functions

| Function | Purpose |
|----------|---------|
| `getInventorySettings()` | Fetch org's inventory_settings row (create defaults if missing) |
| `upsertInventorySettings(settings)` | Update org-level defaults |
| `getInventoryIntelligence(locationId?)` | Call RPC `get_inventory_intelligence` |
| `getReorderRecommendations(locationId?)` | Call RPC `get_reorder_recommendations` |

#### Modified Functions (read-only changes)

| Function | Change |
|----------|--------|
| `getInventoryLowStock()` | No change — still works as-is |

### 2.4 Frontend Layer

#### Enhanced Component: `AdminInventory.jsx`

**Current:** 5 summary cards (total items, total value, low stock, reorder, expiring) + table with 30-day velocity

**Enhanced:** 6 summary cards + 6 filterable category views

**New Summary Cards:**
1. Total de artículos (existing)
2. Valor total del inventario (existing, enhanced with currency)
3. Stock bajo / Agotado (existing)
4. Reorden sugerido (existing, now uses formal calculation)
5. Próximos a vencer (existing)
6. **Riesgo de desabasto** (NEW — avg stockout risk score)

**New Category Tabs (filter the table):**
- **Todos** — All items
- **Stock bajo** — quantity <= low_stock_threshold
- **Agotados** — quantity = 0
- **Más vendidos** — Top 20 by 30-day sales velocity
- **Más lentos** — Bottom 20 by 30-day sales velocity (with >0 sales)
- **Próximos a vencer** — expiration_date within 90 days
- **Reorden recomendada** — recommended_qty > 0

**Enhanced Table Columns:**
- Nombre, Uso, Farmacia, Cantidad, Precio, Vencimiento (existing)
- **Ventas 30d** — units sold in last 30 days
- **Ventas/día** — avg daily sales
- **Días de stock** — days of inventory remaining
- **Punto de reorden** — reorder point
- **Cantidad sugerida** — recommended reorder quantity
- **Riesgo** — stockout risk score with color badge
- Proveedor, Código de barras (existing)

#### Replaced Component: `AdminReorderReport.jsx`

**Current:** Simple low-stock list with CSV export

**New:** Full Reorder Intelligence Report with 3 tabs

**Tab 1: Reorden Recomendada**
- Table: Medicamento | Stock | Mínimo | Ventas/día | Días restantes | Punto de reorden | Stock de seguridad | Cantidad sugerida | Proveedor | Lead time
- Sorted by: stockout_risk_score DESC
- Actions: Export CSV, Print, Create PO (links to supplier)

**Tab 2: Por Proveedor**
- Grouped by supplier name
- Each group shows: Supplier name, Contact, Items to reorder, Total units, Estimated cost
- Per-item: Medicamento | Cantidad sugerida | Costo unitario | Costo total
- Actions: Export CSV per supplier, Create PO for group

**Tab 3: Configuración**
- Form: Lead time default (days) | Safety stock crítico (days) | Safety stock normal (days) | Días de análisis
- Save button → updates `inventory_settings`

**Export Formats:**
- CSV (all tabs)
- Print (styled HTML for printer)

#### New/Enhanced: `AdminReports.jsx` (Analytics tab)

Add "Inventario Inteligente" section with:
- **Inventory Value** card — `SUM(quantity * cost)` with trend
- **Estimated Days Until Stockout** — weighted average across all items
- **Inventory Turnover** — `SUM(90d sales) / AVG(quantity)`
- **Stockout Risk Distribution** — count of items by risk band (0-20, 21-50, 51-80, 81-100)

---

## 3. REQUIRED DATABASE CHANGES

### 3.1 New Table + Function Migration

File: `MIGRATION_P3_inventory_intelligence.sql`

Contains:
1. `inventory_settings` table creation
2. `get_inventory_intelligence()` function
3. `get_reorder_recommendations()` function
4. 3 new indexes on `sales` and `sale_items`
5. RLS policy on `inventory_settings`
6. Verification queries

### 3.2 Schema Impact Assessment

| Change | Impact | Risk |
|--------|--------|------|
| `inventory_settings` table | New table, no existing data affected | Zero |
| `get_inventory_intelligence()` function | New function, read-only | Zero |
| `get_reorder_recommendations()` function | New function, read-only | Zero |
| 3 new indexes | Speed up existing queries too | Very low (CREATE INDEX CONCURRENTLY if possible) |

---

## 4. REQUIRED FRONTEND CHANGES

### 4.1 New Files

| File | Purpose |
|------|---------|
| `src/components/admin/InventoryIntelligenceDashboard.jsx` | Extracted intelligence view (shared between AdminInventory and new routes) |

### 4.2 Modified Files

| File | Changes |
|------|---------|
| `src/lib/db.js` | Add `getInventorySettings()`, `upsertInventorySettings()`, `getInventoryIntelligence()`, `getReorderRecommendations()` |
| `src/components/admin/AdminInventory.jsx` | Add category tabs, enhanced table columns, risk score badges |
| `src/components/admin/AdminReorderReport.jsx` | Complete rewrite: 3 tabs (reorder list, by supplier, settings), CSV export, print |
| `src/components/admin/AdminReports.jsx` | Add inventory analytics cards (value, turnover, risk distribution) |
| `src/pages/AdminDashboard.jsx` | No changes needed — routes already exist |

### 4.3 No Changes To (guaranteed safe)

| File | Why untouched |
|------|---------------|
| `src/pages/PoSDashboard.jsx` | Checkout flow — not related to intelligence |
| `src/pages/InventoryDashboard.jsx` | Stock management CRUD — separate concern |
| `src/components/doctor/PatientWorkspace.jsx` | Doctor prescriptions — unrelated |
| `src/components/PrescriptionModal.jsx` | POS prescription modal — unrelated |
| `src/lib/db.js` — existing functions | All existing functions remain unchanged |
| All authentication code | No auth changes |

---

## 5. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large sales table makes `get_inventory_intelligence()` slow | Medium | High | Add indexes first; function uses indexed date ranges; consider materialized view for very large datasets |
| `supplier_products.lead_time_days` is NULL for most items | High | Medium | Function falls back to `inventory_settings.default_lead_time_days` (7 days) |
| `inventory_settings` row missing for org | Medium | Low | Function uses hardcoded defaults (7/3/30); frontend creates row on first settings save |
| `sale_items` lacks `created_at` — join through `sales.timestamp` adds complexity | Certain | Low | Join pattern is standard and indexed; tested in existing `AdminInventory.jsx` |
| Location filtering returns incomplete data if `sales.location_id` is NULL | Medium | Low | Function treats NULL location_id as "all locations" — consistent with existing behavior |
| Existing `AdminReorderReport.jsx` CSV format changes | Certain | Low | New CSV has more columns; consumers should adapt; old format was simplistic |

---

## 6. PRODUCTION IMPACT

### 6.1 Performance Impact

| Aspect | Before | After | Delta |
|--------|--------|-------|-------|
| Admin Inventory page load | ~200ms (inventory + 30d sales) | ~300ms (inventory + 30/60/90d sales + calculations) | +50% but still sub-second |
| Reorder report generation | ~100ms (low stock filter) | ~300ms (full intelligence function) | +200ms, acceptable for report |
| Sales table query | Full table scan on timestamp | Index scan | Faster |
| Database storage | Baseline | +~1KB per org (settings) | Negligible |

### 6.2 User Impact

| User | Impact |
|------|--------|
| Admin | Sees enhanced inventory dashboard with actionable reorder data; can configure defaults |
| POS staff | Zero impact — no POS changes |
| Doctor | Zero impact — no doctor portal changes |
| Customer | Zero impact — no customer portal changes |

### 6.3 Backwards Compatibility

| Component | Status |
|-----------|--------|
| Existing `getInventoryLowStock()` | ✅ Unchanged, still works |
| Existing `getSalesInRange()` | ✅ Unchanged, still works |
| Existing `suggestReorder()` in AdminSuppliers | ✅ Unchanged, still works |
| Existing `AdminInventory.jsx` summary cards | ✅ Enhanced but same data sources |
| Existing reorder CSV export | ⚠️ New format with more columns |

---

## 7. BUILD PLAN

### Phase 3A — Database (Deploy First)

```
┌─────────────────────────────────────────────────────────────┐
│  1. Run MIGRATION_P3_inventory_intelligence.sql             │
│     in Supabase SQL Editor                                  │
│     • Creates inventory_settings table                      │
│     • Creates 2 PostgreSQL functions                        │
│     • Creates 3 performance indexes                         │
│     • Adds RLS policy                                       │
├─────────────────────────────────────────────────────────────┤
│  2. Verify indexes with EXPLAIN ANALYZE                     │
│     on a sample sales date-range query                      │
├─────────────────────────────────────────────────────────────┤
│  3. Test functions with sample data                         │
│     • SELECT * FROM get_inventory_intelligence(org_id)      │
│     • SELECT * FROM get_reorder_recommendations(org_id)     │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3B — Frontend (Deploy After DB)

```
┌─────────────────────────────────────────────────────────────┐
│  4. Add db.js functions                                     │
│     • getInventorySettings()                                │
│     • upsertInventorySettings()                             │
│     • getInventoryIntelligence()                            │
│     • getReorderRecommendations()                           │
├─────────────────────────────────────────────────────────────┤
│  5. Enhance AdminInventory.jsx                              │
│     • Add category tabs                                     │
│     • Add enhanced table columns                            │
│     • Add stockout risk badges                              │
├─────────────────────────────────────────────────────────────┤
│  6. Rewrite AdminReorderReport.jsx                          │
│     • 3-tab layout                                          │
│     • CSV export                                            │
│     • Print styling                                         │
│     • Supplier grouping                                     │
│     • Settings form                                         │
├─────────────────────────────────────────────────────────────┤
│  7. Enhance AdminReports.jsx                                │
│     • Add inventory analytics cards                         │
├─────────────────────────────────────────────────────────────┤
│  8. Build and test                                          │
│     • npm run build                                         │
│     • Manual verification of all tabs                       │
│     • CSV export verification                               │
│     • Print styling verification                            │
└─────────────────────────────────────────────────────────────┘
```

### Estimated Effort

| Task | Estimated Lines | Complexity |
|------|-----------------|------------|
| SQL migration | ~250 lines | Medium |
| db.js functions | ~80 lines | Low |
| AdminInventory enhancement | ~150 lines | Medium |
| AdminReorderReport rewrite | ~400 lines | High |
| AdminReports enhancement | ~80 lines | Low |
| **Total** | **~960 lines** | **Medium-High** |

---

## 8. VERIFICATION CHECKLIST (Post-Deployment)

### Database
- [ ] `inventory_settings` table exists
- [ ] `get_inventory_intelligence()` returns rows with all calculated columns
- [ ] `get_reorder_recommendations()` filters to items needing reorder
- [ ] Index `idx_sales_timestamp_voided_org` is used in query plan
- [ ] Function handles NULL `location_id` correctly (returns all locations)
- [ ] Function handles org with no settings row (uses defaults)

### Frontend
- [ ] Admin Inventory shows all 7 category tabs
- [ ] Fast movers tab shows top 20 by velocity
- [ ] Slow movers tab shows bottom 20 by velocity
- [ ] Reorden recomendada tab filters correctly
- [ ] Table shows: Ventas 30d, Ventas/día, Días de stock, Punto de reorden, Cantidad sugerida, Riesgo
- [ ] Reorder Report shows 3 tabs
- [ ] Supplier grouping shows correct totals
- [ ] Settings tab saves and loads defaults
- [ ] CSV export contains all columns
- [ ] Print styling is clean
- [ ] Analytics cards show: value, days to stockout, turnover, risk distribution

### Regression
- [ ] POS checkout still works
- [ ] Inventory CRUD still works
- [ ] Existing reorder report CSV still downloads
- [ ] Admin dashboard loads without errors
- [ ] No console errors
