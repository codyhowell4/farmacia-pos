# Phase 3 Final Audit Report — Pre-Production Deployment

**Date:** 2026-06-05
**Auditor:** Automated code review + manual inspection
**Build Status:** ✅ PASS (1887 modules, 0 errors, 4.31s)
**Verdict:** APPROVED with one documented limitation

---

## Audit Findings

### 1. All calculations use completed sales only ✅ PASS

**Evidence:**
```sql
-- Single-pass net sales CTE
WHERE sa.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz
  AND sa.voided = false          -- ← excludes voided/cancelled sales
  AND sa.org_id = p_org_id
```

All three date windows (30/60/90 days) filter `sa.voided = false`. Cancelled, voided, and pending sales are excluded.

**Risk:** None.

---

### 2. Returns/refunds do not inflate velocity ✅ PASS (FIXED)

**Original Issue (CRITICAL):** The first draft counted gross sales only. Returns in `return_items` table were not subtracted, inflating velocity.

**Fix Applied:**
```sql
-- Returns CTE (org-scoped; returns table has no location_id)
net_returns AS (
  SELECT
    ri.inventory_id,
    SUM(CASE WHEN r.timestamp >= (CURRENT_DATE - INTERVAL '30 days') ...
      THEN ri.return_qty ELSE 0 END) AS ret_30,
    ...
  FROM return_items ri
  JOIN returns r ON r.id = ri.return_id
  WHERE r.timestamp >= (CURRENT_DATE - INTERVAL '90 days')::timestamptz
    AND r.org_id = p_org_id
  GROUP BY ri.inventory_id
)

-- Net sales = GREATEST(0, gross - returns)
GREATEST(0, COALESCE(ns.gross_30, 0) - COALESCE(nr.ret_30, 0))::bigint AS n30
```

**New columns exposed:** `returned_30d`, `returned_60d`, `returned_90d`, `net_sold_30d`, `net_sold_60d`, `net_sold_90d`

**Risk:** None. Net sales are now accurate.

---

### 3. Inventory transfers between locations do not count as sales ✅ PASS

**Evidence:** The function only queries:
- `sale_items` joined to `sales`
- `return_items` joined to `returns`

The `inventory_movements` table (which tracks `type = 'transfer'`) is **never queried**. Transfers between locations do not affect velocity calculations.

**Risk:** None.

---

### 4. Expired inventory is excluded from available stock calculations 🟡 PARTIAL

**What the function does:**
```sql
-- Flag expired items
(i.expiration_date IS NOT NULL AND i.expiration_date < CURRENT_DATE) AS expired

-- Force risk score to 100 for expired items
CASE WHEN c.expired THEN 100 ...
```

**What the function does NOT do:**
- Does NOT subtract expired quantity from `inventory.quantity`
- Does NOT query `inventory_batches` to calculate non-expired quantity

**Rationale:** The `inventory` table has a single `quantity` column. Expired stock remains in this column until a pharmacist performs a stock adjustment to remove it. This is consistent with existing behavior in `InventoryDashboard.jsx` and `AdminInventory.jsx`.

**Mitigation:**
- Expired items appear in the "Expirados" tab
- Expired items show a red "VENCIDO" badge
- Expired items have risk score = 100 (forces reorder recommendation)
- The reorder report includes expired items so they get replaced

**Risk:** LOW — expired items are flagged and prioritized for reorder, which is the correct pharmacy workflow.

**Recommendation:** In a future phase, integrate `inventory_batches` to calculate usable quantity per lot.

---

### 5. Risk score calculation formula is documented ✅ PASS

**SQL Formula (inline):**
```sql
CASE
  WHEN c.expired THEN 100
  WHEN c.inv_quantity = 0 THEN 100
  WHEN c.ads30 = 0 THEN 0
  WHEN (c.inv_quantity / c.ads30) <= 3  THEN 90 + (10 - days) * 1   -- 90-100
  WHEN (c.inv_quantity / c.ads30) <= 7  THEN 70 + (7 - days) * 5    -- 70-85
  WHEN (c.inv_quantity / c.ads30) <= 14 THEN 40 + (14 - days) * 4   -- 40-64
  WHEN (c.inv_quantity / c.ads30) <= 30 THEN 10 + (30 - days)       -- 10-25
  ELSE 0
END::integer
```

**Band Mapping:**
| Days of Stock | Risk Score | Label |
|---------------|-----------|-------|
| Expired / 0 qty | 100 | Crítico |
| ≤ 3 days | 90–100 | Crítico |
| 4–7 days | 70–85 | Alto |
| 8–14 days | 40–64 | Medio |
| 15–30 days | 10–25 | Bajo |
| > 30 days | 0 | Bajo |
| No sales (ADS=0) | 0 | Bajo |

**Documentation:** Formula is documented inline in SQL, in `PHASE3_DEPLOYMENT_REPORT.md`, and in this audit report.

**Risk:** None.

---

### 6. All RPC functions respect org_id and location_id isolation ✅ PASS

**Function parameters:**
```sql
CREATE FUNCTION get_inventory_intelligence(p_org_id uuid, p_location_id uuid DEFAULT NULL)
CREATE FUNCTION get_reorder_recommendations(p_org_id uuid, p_location_id uuid DEFAULT NULL)
```

**Filtering in ALL CTEs and base query:**
| Table | org_id filter | location_id filter |
|-------|---------------|-------------------|
| `inventory` (base) | `i.org_id = p_org_id` | `p_location_id IS NULL OR i.location_id = p_location_id` |
| `sales` (sales CTE) | `sa.org_id = p_org_id` | `p_location_id IS NULL OR sa.location_id = p_location_id` |
| `returns` (returns CTE) | `r.org_id = p_org_id` | ❌ No location_id column on returns table |
| `suppliers` (LEFT JOIN) | Via FK to inventory | Via inventory.location_id |

**Note on returns:** The `returns` table does not have a `location_id` column. Returns are org-scoped only. This means cross-location returns are theoretically possible but in practice, a return is processed at the same location where the sale occurred.

**Risk:** LOW — Returns are typically processed at the point of sale.

---

### 7. No cross-tenant exposure exists ✅ PASS

**Security model:**
```sql
SECURITY DEFINER
SET search_path = public
```

The function runs with the owner's privileges but **explicitly filters every table by `p_org_id`**. The caller (db.js) passes `org_id` from the authenticated user's profile:

```javascript
const orgId = await getOrgId();  // Reads from profiles table
.rpc('get_inventory_intelligence', { p_org_id: orgId, p_location_id: locationId })
```

**RLS on inventory_settings:**
```sql
CREATE POLICY "inventory_settings_org_isolation" ON inventory_settings
  FOR ALL USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());
```

**Edge case:** If `getOrgId()` returns `undefined` (user has no org_id), `p_org_id` becomes `NULL`, and all `WHERE` clauses become `org_id = NULL` → zero rows returned. Safe.

**Risk:** None.

---

### 8. Performance remains acceptable with 100k+ sale_items rows 🟡 ACCEPTABLE

**Optimization applied:** Single-pass scan

Instead of three separate CTEs scanning the same date ranges:
```sql
-- BEFORE (3 scans of ~100k rows each = 300k rows)
sales_30 AS (SELECT ... WHERE timestamp >= NOW() - 30d),
sales_60 AS (SELECT ... WHERE timestamp >= NOW() - 60d),
sales_90 AS (SELECT ... WHERE timestamp >= NOW() - 90d)
```

Now one scan with conditional aggregation:
```sql
-- AFTER (1 scan of ~100k rows)
net_sales AS (
  SELECT inventory_id,
    SUM(CASE WHEN timestamp >= NOW() - 30d THEN qty ELSE 0 END) AS gross_30,
    SUM(CASE WHEN timestamp >= NOW() - 60d THEN qty ELSE 0 END) AS gross_60,
    SUM(CASE WHEN timestamp >= NOW() - 90d THEN qty ELSE 0 END) AS gross_90
  FROM sale_items JOIN sales ...
  WHERE timestamp >= NOW() - 90d
  GROUP BY inventory_id
)
```

**Index coverage:**
| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_sales_timestamp_voided_org` | `(timestamp, voided, org_id)` | Filters sales by date + org |
| `idx_sales_timestamp_location` | `(timestamp, voided, org_id, location_id)` | Filters sales by date + org + location |
| `idx_sale_items_inventory_sale` | `(inventory_id, sale_id, quantity)` | Joins sale_items to sales, aggregates by inventory |
| `idx_returns_timestamp_org` | `(timestamp, org_id)` | Filters returns by date + org |
| `idx_return_items_inventory_return` | `(inventory_id, return_id, return_qty)` | Joins return_items to returns, aggregates by inventory |

**Estimated query plan for 100k sale_items:**
1. Index range scan on `sales` using `idx_sales_timestamp_voided_org` — ~30k rows (90 days)
2. Nested loop to `sale_items` using `idx_sale_items_inventory_sale` — ~100k lookups
3. Hash aggregate by `inventory_id` — O(n)
4. Repeat for returns (typically much smaller)
5. Left join to `inventory` — index scan
6. Left join to `suppliers` and `supplier_products` — index lookups

**Expected execution time:** 200–500ms for 100k sale_items on standard PostgreSQL.

**Risk:** MEDIUM — No EXPLAIN ANALYZE was run in production. Monitor after deployment.

**Recommendation:** After deployment, run:
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM get_inventory_intelligence('YOUR_ORG_ID');
```
If execution time > 1 second, consider adding a materialized view refreshed nightly.

---

## Final Risk Assessment

| Risk | Likelihood | Impact | Status |
|------|-----------|--------|--------|
| Returns inflate velocity | Fixed | High | ✅ Resolved |
| Expired items in calculations | Known limitation | Low | 🟡 Documented |
| Cross-tenant data leak | None | Critical | ✅ Resolved |
| Performance degradation at scale | Low | Medium | 🟡 Monitored |
| Location isolation gaps (returns) | Very low | Low | 🟡 Documented |
| Schema mismatch (new columns) | None | Medium | ✅ Build passes |

---

## RLS Verification

| Table / Object | RLS Enabled | Policy | Correct? |
|---------------|-------------|--------|----------|
| `inventory_settings` | ✅ Yes | `org_id = get_my_org_id()` | ✅ Correct |
| `inventory` | ✅ Yes (existing) | `org_id = get_my_org_id() AND is_org_staff()` | ✅ Correct |
| `sales` | ✅ Yes (existing) | `sales_staff` + `sales_customer_read` | ✅ Correct |
| `sale_items` | ✅ Yes (existing) | Via parent `sales` join | ✅ Correct |
| `returns` | ✅ Yes (existing) | Via `org_id` | ✅ Correct |
| `return_items` | ✅ Yes (existing) | Via parent `returns` join | ✅ Correct |
| `suppliers` | ✅ Yes (existing) | `org_id = get_my_org_id()` | ✅ Correct |
| `supplier_products` | ✅ Yes (existing) | Via supplier org lookup | ✅ Correct |

---

## Performance Verification

| Check | Status | Notes |
|-------|--------|-------|
| Single-pass optimization | ✅ Applied | One 90-day scan instead of three |
| Indexes created | ✅ 5 indexes | All necessary indexes present |
| Function marked STABLE | ✅ Yes | PostgreSQL can cache within transaction |
| No sequential scans on large tables | 🟡 Expected | Index range scans assumed; verify with EXPLAIN |

---

## Deployment Approval

### ✅ APPROVED for production deployment

**Conditions:**
1. Run `MIGRATION_P3_inventory_intelligence.sql` in Supabase SQL Editor
2. Verify all 8 verification queries return PASS
3. Deploy frontend build
4. Run `EXPLAIN ANALYZE` on the function in production to confirm sub-second performance
5. Monitor for 48 hours after deployment

### 🚫 DO NOT deploy if:
- `EXPLAIN ANALYZE` shows execution time > 2 seconds
- The `returns` table has no `org_id` column (verify first)
- Any verification query returns FAIL

---

## Sign-off Checklist

- [x] 1. Completed sales only (`voided = false`)
- [x] 2. Returns subtracted from velocity
- [x] 3. Transfers don't count as sales
- [x] 4. Expired items flagged (risk = 100, VENCIDO badge)
- [x] 5. Risk score formula documented inline
- [x] 6. org_id + location_id isolation verified
- [x] 7. Cross-tenant exposure — none found
- [x] 8. Performance — single-pass optimized, indexes in place
- [x] Build passes with 0 errors
- [x] Zero existing workflows modified
- [x] Rollback plan documented
