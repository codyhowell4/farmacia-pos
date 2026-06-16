# FARMACIA POS — FEEDBACK IMPLEMENTATION PHASE 2
## Comprehensive Audit Report & Implementation Plan

**Date:** 2026-06-17  
**Prepared for:** Cody (New Owner)  
**Status:** AUDIT COMPLETE — AWAITING APPROVAL BEFORE CODING

---

# SECTION 1 — AUDIT REPORT

## 1.1 Doctor Portal Audit

### Current State
| Attribute | Finding |
|-----------|---------|
| **Pages** | 6 routes: `/doctor`, `/doctor/appointments`, `/doctor/customers`, `/doctor/preorders`, `/doctor/medical-notes`, `/doctor/profile` |
| **Sidebar** | 6 flat items: Resumen, Citas, Pacientes, Preórdenes, Notas médicas, Mi Perfil |
| **Patient List** | Searchable by name/phone/email/CURP; click opens **modal dialog** (not route) with purchase history + note count |
| **Patient Detail** | Read-only dialog: phone, email, address, DOB, note count, last 20 purchases |
| **Appointments** | Full CRUD: create, edit, delete, status change (pending→confirmed→completed→cancelled) |
| **Preorders** | Create + status change only (no edit/delete). Status: pending→ready→picked_up→cancelled |
| **Medical Notes** | Full CRUD: create, edit, delete. Expand/collapse for long notes. |
| **Profile** | Read-only. Shows license, specialty, phone, active status. |
| **Patient Creation** | ❌ **NOT POSSIBLE** — doctors can only view existing customers |
| **Prescription Creation** | ❌ **NOT POSSIBLE** — doctors have no prescription functionality |

### Key Files
- `src/pages/DoctorDashboard.jsx` — sidebar nav + routing (lines 41-73, 147-154)
- `src/components/doctor/DoctorCustomers.jsx` — patient list + detail modal (lines 1-212)
- `src/components/doctor/DoctorAppointments.jsx` — appointments CRUD
- `src/components/doctor/DoctorPreorders.jsx` — preorders management
- `src/components/doctor/DoctorMedicalNotes.jsx` — medical notes CRUD
- `src/components/doctor/DoctorProfile.jsx` — read-only profile
- `src/components/doctor/DoctorOverview.jsx` — dashboard stats

---

## 1.2 Admin Portal Audit

### Current State
| Attribute | Finding |
|-----------|---------|
| **Sidebar** | 20 flat items. **No submenus or collapsible navigation.** |
| **Configuración** | Tax (IVA) toggle + rate + Bank Accounts CRUD. **NO user/doctor/customer/appointment/audit links.** |
| **Recetas Médicas** | Shows `customer_documents` table (uploaded files), NOT doctor prescriptions. Status workflow: pending→reviewed→approved→dispensed/rejected. |
| **Análisis** | 5 tabs: Overview, Sales, Profit, Products, Inventory. Uses `dashboardReportsService.js`. |
| **Reports (COFEPRIS)** | Separate page at `/admin/reports`. Controlled substances, movement, expiry. |
| **Reorder Report** | Separate page at `/admin/reorder-report`. |
| **Inventory (Admin)** | Read-only. No create/edit. Editing happens at `/inventory` route. |
| **Portal Cliente** | Item #20, external link to `/customer-app/`. Opens in new tab. |
| **Suppliers** | Two tabs: Proveedores + Órdenes de compra. No supplier field in medication form. |

### Navigation Items (Current)
```
1.  Resumen              11. Reportes COFEPRIS
2.  Usuarios             12. Análisis
3.  Clientes             13. Contabilidad
4.  Médicos              14. Configuración
5.  Ventas               15. Recetas médicas
6.  Inventario           16. Solicitudes de recarga
7.  Descuentos           17. Citas
8.  Turnos               18. Pedidos
9.  Auditoría            19. Reporte de reorden
10. Proveedores          20. Portal Cliente
```

### Key Files
- `src/pages/AdminDashboard.jsx` — sidebar + routing (20 items, flat)
- `src/components/admin/AdminPrescriptions.jsx` — shows customer_documents
- `src/components/admin/AdminReports.jsx` — analytics dashboard
- `src/pages/AdminSettings.jsx` — tax + bank accounts
- `src/components/admin/AdminSuppliers.jsx` — suppliers + POs
- `src/components/admin/AdminInventory.jsx` — read-only inventory

---

## 1.3 POS Prescription Flow Audit

### Current State
| Attribute | Finding |
|-----------|---------|
| **Rx-required items** | Blue "Rx" badge on product grid and cart. No block at add-to-cart. |
| **PrescriptionModal** | Opens when cashier clicks "Ir a cobrar" if cart has Rx items. |
| **Fields collected** | Patient name*, CURP; Doctor name*, License*, Address, Phone; Prescription #*, Date* |
| **Auto-fill** | ❌ **NONE** — cashier re-enters everything manually even if customer is selected |
| **Prescription number** | Manual entry. Single global number for all Rx items in cart. |
| **Customer search** | Real-time search by name. Creates new customer inline if not found. |
| **Sale completion** | `createSaleWithPayments()` then `createPrescription()`. Prescription failure is **non-blocking**. |
| **Receipt** | Shows `[Rx]` suffix and Rx number per item. |

### Prescription Data Flow
```
PrescriptionModal (manual entry)
    ↓
prescriptionData state (PoSDashboard.jsx:280-289)
    ↓
completeSale() → createSaleWithPayments() → createPrescription()
    ↓
prescriptions table (1:1 with sales via UNIQUE(sale_id))
```

### Key Files
- `src/pages/PoSDashboard.jsx` — cart, checkout, completeSale (lines 71-76, 132-165, 264-586)
- `src/components/PrescriptionModal.jsx` — COFEPRIS prescription form (lines 9-254)
- `src/components/ReceiptModal.jsx` — receipt with Rx display
- `src/lib/db.js` — `createPrescription()` (lines 855-869), `createSaleWithPayments()` (lines 821-851)

---

## 1.4 Customer Portal Audit

### Current State
| Attribute | Finding |
|-----------|---------|
| **Location** | `public/customer-app/` — served as static files |
| **Technology** | Vanilla JS SPA (not React) |
| **Entry** | `public/customer-app/index.html` |
| **Navigation** | 5 bottom tabs: Hoy, Cuerpo, Salud, Consulta, Shop + hamburger menu |
| **Registration** | Built into portal. Fields: name, email, password. No phone number collected. |
| **Public registration page** | ❌ **DOES NOT EXIST** — no `/customer-register` route in React app |
| **Auth** | Supabase Auth with auto-customer creation via `ensureCustomerProfile()` |

### Key Files
- `public/customer-app/index.html` — shell
- `public/customer-app/js/app.js` — main SPA (~9,500 lines)
- `public/customer-app/js/api.js` — Supabase abstraction
- `src/App.jsx` — React app does NOT reference customer-app directly

---

## 1.5 Database Schema Audit

### prescriptions Table (Current)
```sql
CREATE TABLE prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,  -- UNIQUE constraint (1:1 with sales)
  org_id uuid REFERENCES organizations(id),
  patient_name text NOT NULL,
  patient_curp text,
  doctor_name text NOT NULL,           -- TEXT, not FK
  doctor_license_number text NOT NULL, -- TEXT, not FK
  doctor_office_address text,
  doctor_phone text,
  prescription_number text NOT NULL,   -- Manual entry
  prescription_date date NOT NULL,
  is_voided boolean DEFAULT false,
  voided_at timestamptz,
  voided_by uuid REFERENCES profiles(id),
  voided_reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE(sale_id)
);
```
**Key observation:** This table is COFEPRIS-compliance focused. It stores ONE prescription per sale. It has **no medication, dosage, frequency, or duration fields**. It is **not suitable** for doctor-created clinical prescriptions without extension.

### inventory Table (Current — relevant fields)
```sql
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  "use" text,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  requires_prescription boolean NOT NULL DEFAULT false,
  supplier_id uuid REFERENCES suppliers(id),   -- EXISTS but not used in UI
  category text DEFAULT 'otc' CHECK (category IN ('otc','prescription','vitamins')),
  ...
);
```
**Key observation:** `supplier_id` already exists in schema but is **not exposed** in any create/edit medication form.

### customers Table (Current)
```sql
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  curp text,
  address text,
  date_of_birth date,
  notes text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### customer_documents Table (Current)
```sql
CREATE TABLE customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'receta' CHECK (document_type IN ('receta','nota_doctor','laboratorio')),
  file_url text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','dispensed','rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
**Key observation:** This stores UPLOADED FILES (images/PDFs) from the customer portal. It is **NOT** for doctor-created prescriptions.

### sale_items Table (Current — relevant)
```sql
CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity integer NOT NULL,
  price numeric(10,2) NOT NULL,
  requires_prescription boolean DEFAULT false,
  rx_number text,
  prescription_id uuid REFERENCES prescriptions(id),  -- EXISTS but unused in app
  ...
);
```

---

# SECTION 2 — ARCHITECTURE FINDINGS

## Finding 1: Two Different "Prescription" Concepts Exist

| Aspect | COFEPRIS Prescription (Existing) | Clinical Prescription (Required) |
|--------|----------------------------------|----------------------------------|
| **Purpose** | Regulatory compliance per sale | Doctor prescribes medication to patient |
| **Created by** | POS cashier during checkout | Doctor in Doctor Portal |
| **Tied to sale** | Yes (1:1 via `sale_id` UNIQUE) | No (created before sale) |
| **Fields** | Patient name/CURP, Doctor name/license/address/phone, Rx #, Date | Medication, Dosage, Frequency, Duration, Notes |
| **Immutable** | Yes (void-only) | No (status can change: active→expired→fulfilled) |
| **Table** | `prescriptions` | Needs new or extended table |

## Finding 2: Admin Prescriptions Page Shows Wrong Data

The current `AdminPrescriptions.jsx` queries `customer_documents` (uploaded files from customer portal). The desired behavior is to show **doctor-created prescriptions**. These are fundamentally different entities.

## Finding 3: prescriptions Table Is COFEPRIS-Only

The existing `prescriptions` table has:
- `UNIQUE(sale_id)` — prevents prescriptions without a sale
- No medication/dosage/frequency/duration fields
- `prescription_number` is manual text entry
- No `status` field for lifecycle (active/expired/fulfilled)
- No `customer_id` FK (only `patient_name` text)
- No `doctor_id` FK (only `doctor_name` text)

## Finding 4: Supplier Field Exists in Schema But Not in UI

The `inventory` table already has `supplier_id uuid REFERENCES suppliers(id)`. However, no medication creation or editing form exposes this field. The `upsertInventoryItem()` function in `db.js` does not include `supplier_id`.

## Finding 5: No Public Registration Page Exists

The React app has `LoginPage.jsx` and `ForgotPasswordPage.jsx` but **no public customer registration page**. Customer registration only exists inside the vanilla JS customer portal (`public/customer-app/`). A `/customer-register` route in the React app is needed for QR-code self-registration.

## Finding 6: Admin Sidebar Is Flat (20 Items)

No collapsible submenus exist. The sidebar is becoming unwieldy. shadcn/ui `Collapsible` component exists in `src/components/ui/collapsible.jsx` but is unused.

## Finding 7: Customer Portal Is External to React App

The customer portal lives in `public/customer-app/` and is served as static files. It is not part of the React build. The admin sidebar links to it with `external: true`.

## Finding 8: Reports Are Fragmented Across Multiple Routes

| Report | Route | Current Parent |
|--------|-------|---------------|
| COFEPRIS | `/admin/reports` | Standalone |
| Reorder | `/admin/reorder-report` | Standalone |
| Sales | `/admin/analytics` (tab) | Under Análisis |
| Inventory | `/admin/analytics` (tab) | Under Análisis |
| Ventas | `/admin/sales` | Standalone |

The user wants these consolidated under Análisis.

---

# SECTION 3 — AFFECTED FILES

## 3.1 Doctor Portal (8 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/DoctorDashboard.jsx` | MODIFY | Remove Preórdenes + Notas médicas from navItems array and Routes |
| `src/components/doctor/DoctorCustomers.jsx` | MAJOR REWRITE | Add "+ Nuevo Paciente" button; replace detail modal with tabbed workspace (Resumen, Recetas, Citas, Compras, Notas) |
| `src/components/doctor/DoctorAppointments.jsx` | MODIFY | Minor — may reference new patient workspace |
| `src/components/doctor/DoctorOverview.jsx` | MODIFY | Remove preorders/notes stats from dashboard |
| `src/components/doctor/DoctorPreorders.jsx` | REMOVE FROM NAV | File stays but no longer routed |
| `src/components/doctor/DoctorMedicalNotes.jsx` | REMOVE FROM NAV | File stays but no longer routed |
| `src/components/doctor/DoctorProfile.jsx` | NO CHANGE | Read-only profile stays |
| `src/components/doctor/DoctorOverview.jsx` | MODIFY | Update stats to remove preorders/notes counts |

## 3.2 New Doctor Portal Files (3 files)

| File | Purpose |
|------|---------|
| `src/components/doctor/PatientWorkspace.jsx` | Tabbed patient detail view (Resumen, Recetas, Citas, Compras, Notas) |
| `src/components/doctor/DoctorPrescriptionForm.jsx` | Create prescription form (medication, dosage, frequency, duration, notes) |
| `src/components/doctor/DoctorPrescriptionList.jsx` | List patient prescriptions with status filters |

## 3.3 Admin Portal (8 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/AdminDashboard.jsx` | MAJOR REWRITE | Add collapsible submenu for Configuración; reorganize nav; move Portal Cliente |
| `src/components/admin/AdminPrescriptions.jsx` | MAJOR REWRITE | Query `prescriptions` table (doctor-created), not `customer_documents` |
| `src/components/admin/AdminReports.jsx` | MODIFY | Add submenu navigation for Reporte COFEPRIS, Reorden, Ventas, Inventario |
| `src/components/admin/AdminInventory.jsx` | MODIFY | Add supplier column to table |
| `src/pages/AdminSettings.jsx` | MODIFY | No change needed (Configuración stays as settings page; submenu items navigate elsewhere) |
| `src/components/admin/AdminUsers.jsx` | NO CHANGE | Kept but accessed via Configuración submenu |
| `src/components/admin/AdminDoctors.jsx` | NO CHANGE | Kept but accessed via Configuración submenu |
| `src/components/admin/AdminCustomers.jsx` | NO CHANGE | Kept but accessed via Configuración submenu |

## 3.4 POS (3 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/PoSDashboard.jsx` | MODIFY | Auto-fill customer info into PrescriptionModal; add prescription search/ linking |
| `src/components/PrescriptionModal.jsx` | MAJOR REWRITE | Add prescription search by patient; auto-fill from selected prescription; make only patient name required |
| `src/lib/db.js` | MODIFY | Add `searchPrescriptions()` function; add `linkPrescriptionToSale()` function |

## 3.5 Inventory (2 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/pages/InventoryDashboard.jsx` | MODIFY | Add supplier dropdown to create/edit medication form |
| `src/lib/db.js` | MODIFY | Add `supplier_id` to `upsertInventoryItem()` |

## 3.6 Customer Self-Registration (2 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/App.jsx` | MODIFY | Add `/customer-register` route (public, no auth required) |
| `src/pages/CustomerRegisterPage.jsx` | **NEW** | Mobile-first public registration page |

## 3.7 Database Layer (1 file)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/db.js` | MODIFY | Add doctor prescription CRUD functions; add customer creation for doctors; add prescription search; add supplier to inventory functions |

## 3.8 Summary: Total Files

| Category | Modify | New | Remove from Nav |
|----------|--------|-----|-----------------|
| Doctor Portal | 3 | 3 | 2 |
| Admin Portal | 4 | 0 | 0 |
| POS | 2 | 0 | 0 |
| Inventory | 2 | 0 | 0 |
| Customer Registration | 1 | 1 | 0 |
| DB Layer | 1 | 0 | 0 |
| **TOTAL** | **13** | **4** | **2** |

---

# SECTION 4 — AFFECTED TABLES

## 4.1 Schema Changes Required

| Table | Change | Description |
|-------|--------|-------------|
| `prescriptions` | ADD COLUMNS | `medication`, `dosage`, `frequency`, `duration`, `notes`, `status`, `doctor_id`, `customer_id`, `expires_at` |
| `prescriptions` | MODIFY | Change `prescription_number` to auto-generated format `RX-YYYYMMDD-XXXXX` |
| `prescriptions` | ADD INDEX | `idx_prescriptions_number` for searchability |
| `prescriptions` | ADD INDEX | `idx_prescriptions_customer` for patient lookups |
| `prescriptions` | ADD INDEX | `idx_prescriptions_status` for filtering |
| `inventory` | NO SCHEMA CHANGE | `supplier_id` already exists |
| `customers` | NO SCHEMA CHANGE | Already has all required fields |
| `profiles` | NO SCHEMA CHANGE | Already has `role` enum with 'customer' |

## 4.2 New Database Functions (RPC)

| Function | Purpose |
|----------|---------|
| `generate_prescription_number()` | Trigger to auto-generate `RX-YYYYMMDD-XXXXX` on INSERT |
| `update_prescription_status()` | Update status and handle expiry logic |

---

# SECTION 5 — REQUIRED MIGRATIONS

## Migration 1: Extend prescriptions Table for Doctor Prescriptions

```sql
-- Add clinical prescription fields
ALTER TABLE prescriptions 
  ADD COLUMN IF NOT EXISTS medication text,
  ADD COLUMN IF NOT EXISTS dosage text,
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' 
    CHECK (status IN ('active','expired','fulfilled','cancelled')),
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS expires_at date;

-- Drop UNIQUE on sale_id (allow multiple prescriptions without sales)
-- Note: PostgreSQL allows multiple NULLs in UNIQUE, but we may need 
-- prescriptions without sales, so we use a partial unique index instead:
DROP INDEX IF EXISTS idx_prescriptions_sale_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_sale_unique 
  ON prescriptions(sale_id) WHERE sale_id IS NOT NULL;

-- Add searchable indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_number ON prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);

-- Add RLS policy for doctors to create prescriptions
CREATE POLICY IF NOT EXISTS "doctor_prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );

CREATE POLICY IF NOT EXISTS "doctor_prescriptions_update_own" ON prescriptions
  FOR UPDATE USING (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );
```

## Migration 2: Auto-Generate Prescription Number

```sql
-- Function to generate RX-YYYYMMDD-XXXXX format
CREATE OR REPLACE FUNCTION generate_rx_number()
RETURNS TRIGGER AS $$
DECLARE
  v_date text;
  v_seq integer;
  v_number text;
BEGIN
  v_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get next sequence number for today
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(prescription_number FROM 'RX-[0-9]{8}-([0-9]+)') AS integer)
  ), 0) + 1
  INTO v_seq
  FROM prescriptions
  WHERE prescription_number LIKE 'RX-' || v_date || '-%';
  
  v_number := 'RX-' || v_date || '-' || LPAD(v_seq::text, 5, '0');
  NEW.prescription_number := v_number;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger only when prescription_number is not manually set
-- OR for doctor-created prescriptions (sale_id IS NULL)
CREATE TRIGGER trg_generate_rx_number
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  WHEN (NEW.prescription_number IS NULL OR NEW.prescription_number = '') 
  EXECUTE FUNCTION generate_rx_number();
```

## Migration 3: Add supplier_id Support to Inventory Upsert

```sql
-- No schema change needed (supplier_id already exists)
-- But verify the column exists:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE inventory ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
END $$;
```

## Migration 4: Backfill expires_at for Doctor Prescriptions

```sql
-- Set expires_at based on duration for future prescriptions
-- (No backfill needed for existing records — they are COFEPRIS records with sales)
```

---

# SECTION 6 — RISKS

## Risk 1: prescriptions Table Dual-Purpose
**Risk:** Extending the existing `prescriptions` table to hold both COFEPRIS and clinical prescriptions creates conceptual overlap.  
**Mitigation:** Use `sale_id IS NOT NULL` to distinguish COFEPRIS records from doctor-created ones. Admin queries filter accordingly. Document the distinction clearly.

## Risk 2: UNIQUE(sale_id) Migration
**Risk:** Dropping the `UNIQUE(sale_id)` constraint could allow duplicate COFEPRIS prescriptions per sale.  
**Mitigation:** Replace with a partial unique index `WHERE sale_id IS NOT NULL`. This preserves the 1:1 COFEPRIS constraint while allowing doctor prescriptions without sales.

## Risk 3: Prescription Number Collision
**Risk:** The auto-generation trigger uses MAX() + 1 which could race under concurrent inserts.  
**Mitigation:** Use an advisory lock or a separate sequence. For a pharmacy with moderate concurrency, the race risk is low. Alternative: use a true sequence `prescription_number_seq`.

## Risk 4: POS Prescription Linking Complexity
**Risk:** Linking doctor prescriptions at POS requires the cashier to search by RX number or patient name, adding UI complexity.  
**Mitigation:** Implement a simple search dropdown in PrescriptionModal. Auto-populate all COFEPRIS fields from the linked prescription. Fall back to manual entry if not found.

## Risk 5: Customer Self-Registration Security
**Risk:** Public registration could allow spam accounts or wrong org assignment.  
**Mitigation:** Registration creates `role='customer'` only. Use the default org ID from env. Consider email verification (Supabase handles this). No admin privileges granted.

## Risk 6: Admin Menu Restructure User Confusion
**Risk:** Moving nav items into Configuración submenu changes muscle memory for existing users.  
**Mitigation:** Keep Configuración as a distinct page (tax/bank settings) AND as a collapsible menu group. The submenu items are navigation shortcuts, not replacing the pages.

## Risk 7: Medical Notes Migration to Patient Workspace
**Risk:** Medical notes currently exist as a standalone doctor page. Moving them into patient workspace changes the UX.  
**Mitigation:** Keep the existing `medical_notes` table and CRUD. The patient workspace's Notas tab reuses the same db functions but scoped to the selected patient.

## Risk 8: Build Size / Performance
**Risk:** Adding new components increases bundle size.  
**Mitigation:** Use lazy loading for new routes (`React.lazy()`). The new components are moderate in size.

---

# SECTION 7 — IMPLEMENTATION PLAN

## Phase A: Database & Foundation (1-2 hours)

### Task A1: Run Migration — Extend prescriptions Table
- File: `MIGRATION_P2_extend_prescriptions.sql`
- Add 9 new columns to `prescriptions`
- Replace `UNIQUE(sale_id)` with partial unique index
- Add indexes for search/filter
- Add doctor RLS policies

### Task A2: Run Migration — Auto-Generate RX Number
- File: `MIGRATION_P2_rx_number_trigger.sql`
- Create `generate_rx_number()` trigger function
- Attach trigger to `prescriptions` table

### Task A3: Update db.js — Prescription Functions
- Add `createDoctorPrescription(payload)` — for doctor portal
- Add `getDoctorPrescriptions(customerId)` — for patient workspace
- Add `getPrescriptionByNumber(number)` — for POS search
- Add `linkPrescriptionToSale(prescriptionId, saleId)` — for POS
- Add `updatePrescriptionStatus(id, status)` — for lifecycle
- Add `searchPrescriptions(query)` — for admin + POS

### Task A4: Update db.js — Inventory Supplier Support
- Add `supplier_id` to `upsertInventoryItem()`
- Add `supplier_id` to `getInventory()` select

## Phase B: Doctor Portal Restructure (3-4 hours)

### Task B1: Remove Preórdenes & Notas médicas from Navigation
- File: `src/pages/DoctorDashboard.jsx`
- Remove 2 items from `navItems` array
- Remove 2 routes from `<Routes>`
- Update `DoctorOverview` stats (remove preorders/notes counts)

### Task B2: Create PatientWorkspace Component
- File: `src/components/doctor/PatientWorkspace.jsx`
- Tabbed layout: Resumen, Recetas, Citas, Compras, Notas
- Uses `<Tabs>` from shadcn/ui
- Route: `/doctor/customers/:customerId`

### Task B3: PatientWorkspace — Resumen Tab
- Patient info card (name, email, phone, registration date)
- Stats cards: Total Prescriptions, Total Appointments, Total Purchases
- Uses `getCustomerStats()` or individual count queries

### Task B4: PatientWorkspace — Recetas Tab
- File: `src/components/doctor/DoctorPrescriptionList.jsx`
- List doctor prescriptions for patient
- Status badges: active, expired, fulfilled, cancelled
- "Nueva Receta" button → `DoctorPrescriptionForm`

### Task B5: Create DoctorPrescriptionForm
- File: `src/components/doctor/DoctorPrescriptionForm.jsx`
- Fields: Medication (dropdown from inventory OR free text), Dosage, Frequency, Duration, Notes
- Option A/B toggle: "From Inventory" / "Custom Medication"
- Auto-generates prescription_number via trigger
- Saves to `prescriptions` table with `doctor_id`, `customer_id`, `status='active'`

### Task B6: PatientWorkspace — Citas Tab
- List upcoming + previous appointments
- "Nueva Cita" button → reuse appointment creation dialog
- Uses existing `createAppointment()` function

### Task B7: PatientWorkspace — Compras Tab
- Purchase history table
- Columns: Date, Products, Total, Receipt Number (folio)
- Uses `getCustomerPurchaseHistory()`

### Task B8: PatientWorkspace — Notas Tab
- Medical notes list (scoped to patient)
- Create/Edit/Delete notes
- Reuses existing `createMedicalNote()`, `updateMedicalNote()`, `deleteMedicalNote()`

### Task B9: Add "+ Nuevo Paciente" to DoctorCustomers
- File: `src/components/doctor/DoctorCustomers.jsx`
- Add Dialog with form: Nombre*, Teléfono, Email, Fecha de nacimiento, Notas
- Calls `createCustomer()` from db.js
- After creation, patient appears in list immediately

### Task B10: Update DoctorCustomers Routing
- Change click behavior: navigate to `/doctor/customers/:customerId` instead of opening modal
- Pass customerId to PatientWorkspace

## Phase C: Admin Portal Cleanup (2-3 hours)

### Task C1: Add Collapsible Submenu to Admin Sidebar
- File: `src/pages/AdminDashboard.jsx`
- Import `Collapsible` from shadcn/ui
- Group under "Configuración": Usuarios, Médicos, Clientes, Citas, Auditoría
- Each item navigates to its existing route
- Configuración page itself (tax + banks) remains accessible

### Task C2: Add Analytics Submenu
- Group under "Análisis": Reporte COFEPRIS, Reporte Reorden, Ventas, Inventario
- Reporte COFEPRIS → `/admin/reports`
- Reporte Reorden → `/admin/reorder-report`
- Ventas → `/admin/analytics` (sales tab)
- Inventario → `/admin/analytics` (inventory tab)
- Remove standalone routes from top level (or keep as shortcuts)

### Task C3: Reposition Portal Cliente
- **Recommendation:** Move to top of sidebar as a prominent button/card (not buried at #20)
- Alternative: Keep as last item but make it a distinct styled button
- Decision needed from Cody (see recommendation below)

### Task C4: Rewrite AdminPrescriptions
- File: `src/components/admin/AdminPrescriptions.jsx`
- Query `prescriptions` table WHERE `medication IS NOT NULL` (doctor-created)
- Join with `customers` and `profiles` for patient/doctor names
- Columns: RX Number, Patient, Doctor, Medication, Status, Date, Actions
- Actions: View details, Cancel (if active)
- **DO NOT** query `customer_documents`

### Task C5: Add Supplier to Inventory Table
- File: `src/components/admin/AdminInventory.jsx`
- Add "Proveedor" column to table
- Show supplier name from `suppliers` join

## Phase D: POS Prescription Improvements (2-3 hours)

### Task D1: Auto-Fill Customer Info in PrescriptionModal
- File: `src/components/PrescriptionModal.jsx`
- If `selectedCustomer` exists, pre-fill `patientName` and `patientCurp`
- Only `patientName` remains required; all others optional

### Task D2: Add Prescription Search to PrescriptionModal
- Add search input: "Buscar receta existente por número o paciente"
- Calls `searchPrescriptions(query)`
- Results dropdown shows: RX Number, Patient, Medication, Date
- On select: auto-fill ALL fields (patient, doctor, license, medication, etc.)
- Mark prescription as `status='fulfilled'` on sale completion

### Task D3: Update completeSale Flow
- File: `src/pages/PoSDashboard.jsx`
- If linked prescription exists: update `prescriptions.sale_id` and `status='fulfilled'`
- If no linked prescription: create new COFEPRIS record as before
- Make prescription failure blocking (currently non-blocking)

## Phase E: Customer Self-Registration (1-2 hours)

### Task E1: Create CustomerRegisterPage
- File: `src/pages/CustomerRegisterPage.jsx`
- Mobile-first design (max-width, centered card)
- Fields: Full Name*, Email*, Phone Number*
- Submit → `supabase.auth.signUp()` with `role='customer'` in metadata
- Success message + QR code URL display
- Link to customer portal login

### Task E2: Add Route to App.jsx
- Route: `/customer-register` (public, no ProtectedRoute)
- Add to `src/App.jsx` routing

### Task E3: Verify Trigger Creates Customer Record
- The existing `handle_new_user()` trigger already creates `customers` row for role='customer'
- May need to ensure phone number is passed through metadata and saved

## Phase F: Supplier Management (1 hour)

### Task F1: Add Supplier Dropdown to Inventory Form
- File: `src/pages/InventoryDashboard.jsx`
- Fetch suppliers via `getSuppliers()`
- Add `<Select>` for supplier in create/edit medication dialog
- Save `supplier_id` via updated `upsertInventoryItem()`

### Task F2: Display Supplier in Inventory Table
- File: `src/pages/InventoryDashboard.jsx`
- Add supplier name column

---

# SECTION 8 — ARCHITECTURE RECOMMENDATION: PRESCRIPTIONS

## Problem
The existing `prescriptions` table is COFEPRIS-compliance focused (immutable, sale-linked). The new requirement is for doctor-created clinical prescriptions (medication/dosage/frequency/duration, patient-linked, lifecycle status).

## Option A: Extend Existing Table (RECOMMENDED)
Add clinical fields to `prescriptions`. Use `sale_id IS NULL` to distinguish doctor-created prescriptions from COFEPRIS sale-linked ones.

**Pros:**
- Single table for all prescriptions
- RX number generation works for both
- POS linking is straightforward (update sale_id)
- Less migration complexity

**Cons:**
- Conceptual mixing of two different prescription types
- COFEPRIS prescriptions don't need medication/dosage/frequency fields (they're at sale_item level)

## Option B: Create New Table
Create `doctor_prescriptions` table for clinical prescriptions. Keep `prescriptions` for COFEPRIS only.

**Pros:**
- Clean separation of concerns
- No risk of breaking existing COFEPRIS flow

**Cons:**
- Two prescription systems to maintain
- POS linking requires cross-table lookup
- Admin page needs to query two tables
- More complex data model

## Recommendation: Option A (Extend Existing)
Given the tight coupling desired (POS links to doctor prescriptions), extending the existing table is the pragmatic choice. The `sale_id` field cleanly separates the two use cases:
- `sale_id IS NOT NULL` → COFEPRIS compliance record (immutable)
- `sale_id IS NULL` → Doctor-created clinical prescription (mutable until fulfilled)

When a doctor creates a prescription: `sale_id=NULL, status='active'`
When POS links it: `sale_id=xxx, status='fulfilled'` + COFEPRIS fields populated

---

# SECTION 9 — CUSTOMER PORTAL ACCESS RECOMMENDATION

## Current State
Portal Cliente is item #20 in a flat 20-item sidebar. It opens `/customer-app/` in a new tab.

## Options

### Option A: Keep at Bottom (Current)
- Pro: No disruption to existing workflow
- Con: Buried and hard to find

### Option B: Move to Top as Prominent Button
- Pro: Easy access for admin to open customer view
- Con: Takes prime real estate for an external link

### Option C: Add as Floating Action Button (FAB)
- Pro: Always visible, distinct from nav items
- Con: May clutter UI

### Option D: Remove from Sidebar, Add to Admin Overview
- Pro: Contextual access from dashboard
- Con: Two clicks instead of one

## Recommendation: Option B — Move to Top
Place "Portal Cliente" as the first or second item in the sidebar, styled differently (e.g., outlined button with smartphone icon). Admin users frequently need to check the customer portal, and it deserves prominence. The 20-item flat list is overwhelming; reducing it via submenus (Phase C) makes the portal link more visible.

**Proposed sidebar order after restructure:**
```
1. Portal Cliente     [distinct style, external]
2. Resumen            [dashboard]
3. ───────────────    [divider]
4. Ventas
5. Pedidos
6. Inventario
7. Proveedores
8. ───────────────    [divider]
9. Configuración ▼    [collapsible]
   ├─ Usuarios
   ├─ Médicos
   ├─ Clientes
   ├─ Citas
   └─ Auditoría
10. Recetas médicas
11. Análisis ▼        [collapsible]
    ├─ Reporte COFEPRIS
    ├─ Reporte Reorden
    ├─ Ventas
    └─ Inventario
12. ───────────────   [divider]
13. Descuentos
14. Turnos
15. Contabilidad
```
(8 items reduced from 20, with 2 collapsible groups)

---

# SECTION 10 — SUMMARY & NEXT STEPS

## What Has Been Audited
✅ Doctor Portal (6 pages, sidebar, routing, DB functions)  
✅ Admin Portal (20 nav items, settings, prescriptions, analytics, suppliers)  
✅ POS Prescription Flow (modal, checkout, sale completion, receipt)  
✅ Customer Portal (navigation, registration, auth, file structure)  
✅ Database Schema (11 tables, indexes, RLS, views, functions)  
✅ File Structure (90+ JSX files, 6 lib files, 4 services)  

## What Is Proposed
| Feature | Effort | Files | Migration |
|---------|--------|-------|-----------|
| Doctor nav cleanup | Small | 2 | None |
| Patient workspace + tabs | Large | 4 new, 2 mod | None |
| Doctor prescription system | Large | 2 new, 3 mod | Migration 1+2 |
| Unique RX numbers | Small | 0 | Migration 2 |
| POS prescription linking | Medium | 2 mod | None |
| Customer self-registration | Medium | 1 new, 1 mod | None |
| Admin menu cleanup | Medium | 1 mod | None |
| Analytics submenu | Small | 1 mod | None |
| Supplier field in inventory | Small | 2 mod | Migration 3 |
| Admin prescriptions rewrite | Medium | 1 mod | None |

**Total Estimated Effort:** 12-16 hours  
**Migrations Required:** 3 SQL files  
**New Files:** 4 JSX components + 1 page  
**Modified Files:** 13 existing files  

## Approval Required
Before proceeding with coding, confirm:
1. ✅ **Architecture:** Extend existing `prescriptions` table (Option A)
2. ✅ **Customer Portal placement:** Move to top of sidebar (Option B)
3. ✅ **Scope:** All features in this document
4. ✅ **Out of scope:** Inventory forecasting, dynamic reorder, 60-day algorithms

---

*End of Audit Report*
