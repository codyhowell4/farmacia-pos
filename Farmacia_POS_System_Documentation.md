# Farmacia POS — Complete System Documentation

**Version:** 1.0  
**Date:** 2026-06-16  
**Prepared for:** Cody (New Owner)  
**System:** Farmacia Apollo — Pharmacy Management System  
**Stack:** React 18 + Vite + Tailwind CSS + Supabase (PostgreSQL) + shadcn/ui

---

## SECTION 1 — SYSTEM OVERVIEW

### Architecture Overview

Farmacia POS is a multi-tenant pharmacy management system built as a single-page React application backed by Supabase. It serves four distinct user roles through three portals plus a customer-facing mobile web app.

```
┌─────────────────────────────────────────────────────────────────┐
│                        FARMACIA POS                             │
├─────────────────────────────────────────────────────────────────┤
│  Admin Portal      POS Terminal    Doctor Portal   Customer     │
│  (React)           (React)         (React)         Portal      │
│  /admin/*          /pos            /doctor/*       /customer-app│
│                    /inventory                                    │
├─────────────────────────────────────────────────────────────────┤
│  React 18 + Vite + Tailwind + shadcn/ui + Framer Motion       │
├─────────────────────────────────────────────────────────────────┤
│  Supabase Client (JS)                                           │
├─────────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL)                                          │
│  • Row Level Security (RLS) on all tables                       │
│  • Multi-tenant via org_id                                      │
│  • Auth via Supabase Auth (JWT)                                 │
│  • Storage for prescription files                               │
│  • Realtime subscriptions (notifications)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Four Portals

| Portal | URL | Technology | Users |
|--------|-----|------------|-------|
| **Admin Portal** | `/admin/*` | React + React Router | Admin |
| **POS Terminal** | `/pos`, `/inventory` | React | Cashier, Inventory Staff |
| **Doctor Portal** | `/doctor/*` | React + React Router | Doctor |
| **Customer Portal** | `/customer-app/` | Vanilla JS SPA | Customer |

### Supabase Project

- **URL:** `https://ieinjhonepkudxxpmuly.supabase.co`
- **Auth:** Email/password with role-based access
- **RLS:** Comprehensive — every business table has RLS policies
- **Storage:** `customer-documents` bucket for prescription uploads
- **Multi-tenant:** All data scoped by `org_id`

---

## SECTION 2 — USER ROLES

### Role Matrix

| Role | Portal Access | Create | Read | Update | Delete |
|------|--------------|--------|------|--------|--------|
| **Admin** | All portals | All | All | All | All |
| **POS (Cashier)** | POS only | Sales, Customers | Inventory (read), Sales | None | None |
| **Inventory** | `/inventory` | Inventory, POs | Inventory, Suppliers | Inventory, POs | Inventory |
| **Doctor** | `/doctor/*` | Appointments, Notes, Preorders | Patients, Inventory (read) | Appointments, Notes, Preorder status | Appointments, Notes |
| **Customer** | `/customer-app/` | Orders, Appointments, Prescription uploads | Own data only | Own profile | None |

### Admin

- **Full system access** — all 20 admin pages
- Can create/manage users of any role
- Can view all sales, inventory, audit logs
- Can approve/reject prescription uploads
- Can manage suppliers and purchase orders
- Can configure tax (IVA) and bank accounts
- Can close any open shift

### POS (Cashier)

- **POS Terminal** (`/pos`)
- Product search and cart management
- Checkout with cash/card/transfer/insurance
- Apply discount codes
- Create customers at checkout
- Start/close own shift
- **Cannot:** access admin pages, modify inventory, void sales without admin PIN

### Inventory Staff

- **Inventory Dashboard** (`/inventory`)
- Add/edit/delete medications
- Manage stock levels
- Create purchase orders
- Receive purchase orders
- **Cannot:** process sales, access admin reports

### Doctor

- **Doctor Portal** (`/doctor/*`)
- View patient directory (read-only)
- Create/edit/delete appointments
- Create/edit/delete medical notes
- Create preorders (medication reservations)
- **Cannot:** create prescriptions (POS-only), modify patient records, access sales data

### Customer

- **Customer Portal** (`/customer-app/`)
- View shop catalog
- Upload prescriptions
- Book appointments
- Track orders
- Manage health profile (height, weight, vitals)
- View notifications
- **Cannot:** access any admin/pos/doctor functionality

---

## SECTION 3 — ADMIN PORTAL

### Navigation Structure

The admin sidebar has **20 menu items**:

| # | Label | Path | Icon | Description |
|---|-------|------|------|-------------|
| 1 | Resumen | `/admin` | BarChart3 | Dashboard overview |
| 2 | Usuarios | `/admin/users` | Users | User management |
| 3 | Clientes | `/admin/customers` | UserCircle | Customer database |
| 4 | Médicos | `/admin/doctors` | Stethoscope | Doctor profiles |
| 5 | Ventas | `/admin/sales` | ShoppingCart | Sales history |
| 6 | Inventario (Admin) | `/admin/inventory` | Package | Inventory monitoring |
| 7 | Descuentos | `/admin/discounts` | Ticket | Promo codes |
| 8 | Turnos | `/admin/shifts` | Clock | Shift records |
| 9 | Auditoría | `/admin/audit` | Shield | Audit trail |
| 10 | Proveedores | `/admin/suppliers` | Truck | Suppliers & POs |
| 11 | Reportes COFEPRIS | `/admin/reports` | FileText | Regulatory reports |
| 12 | Análisis | `/admin/analytics` | TrendingUp | Analytics & reports |
| 13 | Contabilidad | `/admin/accounting` | BookOpen | Akaunting integration |
| 14 | Configuración | `/admin/settings` | Settings | Tax & bank accounts |
| 15 | Recetas médicas | `/admin/prescriptions` | ClipboardList | Prescription review |
| 16 | Solicitudes de recarga | `/admin/preorders` | Pill | Preorder management |
| 17 | Citas | `/admin/appointments` | CalendarDays | Appointment mgmt |
| 18 | Pedidos | `/admin/orders` | ShoppingCart | Order workflow |
| 19 | Reporte de reorden | `/admin/reorder-report` | AlertTriangle | Low-stock report |
| 20 | Portal Cliente | `/customer-app/` (external) | Smartphone | Opens customer portal |

---

### PAGE: Resumen (Overview)

**Purpose:** Admin landing dashboard with 10 stat cards and 3 quick actions.

**Stat Cards (clickable → navigate to respective page):**
- Ingresos totales → Ventas
- Total de ventas → Ventas
- Artículos en inventario → Inventario
- Usuarios totales → Usuarios
- Stock bajo → Inventario
- Sin existencias → Inventario
- Recetas pendientes → Recetas médicas
- Recargas pendientes → Solicitudes de recarga
- Citas hoy → Citas
- Pedidos pendientes → Pedidos

**Quick Actions:**
- Gestionar usuarios → /admin/users
- Ver ventas → /admin/sales
- Monitorear inventario → /admin/inventory

**Tables:** `sales`, `inventory`, `profiles`, `customer_documents`, `preorders`, `appointments`

---

### PAGE: Usuarios (Users)

**Purpose:** Manage all system users.

**Buttons:**

| Button | Flow |
|--------|------|
| **Agregar usuario** | Opens dialog → Form (name, email, password, role, location, PIN) → `createUser()` → Supabase Auth + `profiles` row created via trigger |
| **Edit** (per row) | Opens dialog with user data → `updateProfile()` → `profiles` updated |
| **Delete** (Trash2) | Confirm → `deleteProfile()` → `profiles` deleted |

**Tables:** `profiles`, `locations`

---

### PAGE: Clientes (Customers)

**Purpose:** Customer database for sales and appointments.

**Buttons:**

| Button | Flow |
|--------|------|
| **Agregar cliente** | Dialog → full_name, phone, email, CURP, address, DOB, notes → `createCustomer()` → `customers` |
| **View profile** (Eye) | Navigate to `/admin/customers/:customerId` |
| **Edit** | Dialog → `updateCustomer()` |
| **Delete** | Confirm → `deleteCustomer()` |

**Tables:** `customers`

---

### PAGE: Médicos (Doctors)

**Purpose:** Manage doctor professional profiles.

**Buttons:**

| Button | Flow |
|--------|------|
| **Editar perfil / Completar perfil** | Dialog → license_number, specialty, phone, is_active → `upsertDoctorProfile()` → `doctor_profiles` |

**Tables:** `profiles`, `doctor_profiles`

---

### PAGE: Ventas (Sales)

**Purpose:** Full sales history with details, export, and Akaunting sync.

**Buttons:**

| Button | Flow |
|--------|------|
| **Imprimir PDF** | `printReport()` → opens print dialog |
| **Exportar CSV** | `exportSalesCSV()` → downloads CSV |
| **Show Voided / Hide Voided** | Toggle filter |
| **Retry sync** (RotateCcw) | `syncSaleById()` → Akaunting sync |
| **Expand row** (chevron) | Shows sale items, payments, customer |

**Tables:** `sales`, `sale_items`, `customers`

---

### PAGE: Inventario (Admin)

**Purpose:** Inventory monitoring dashboard.

**Content:**
- Stock levels, expiry tracking, sales velocity
- Low-stock alerts
- Out-of-stock alerts

**Buttons:** None (read-only monitoring)

**Tables:** `inventory`, `sales` (with `sale_items`)

---

### PAGE: Descuentos (Discounts)

**Purpose:** Create and manage discount codes.

**Buttons:**

| Button | Flow |
|--------|------|
| **Agregar descuento** | Dialog → code, value (%) → `createDiscount()` → `discounts` |
| **Edit** | Inline edit → `createDiscount()` (upsert) |
| **Delete** | Confirm → `deleteDiscount()` |

**Tables:** `discounts`

---

### PAGE: Turnos (Shifts)

**Purpose:** Shift history and cash reconciliation.

**Buttons:**

| Button | Flow |
|--------|------|
| **Imprimir PDF** | Print shift report |
| **Exportar CSV** | Download shifts CSV |
| **Expand row** | Shows sales during shift, variance |

**Tables:** `shifts`, `locations`

---

### PAGE: Recetas médicas (Prescriptions)

**Purpose:** Review customer-uploaded prescription documents.

**Status Workflow:** `pending` → `reviewed` → `approved` → `dispensed`  
Or: `pending`/`reviewed` → `rejected`

**Buttons:**

| Button | Flow |
|--------|------|
| **Revisar** | `pending` → `reviewed` → `updateCustomerDocumentStatus()` + `createNotification()` |
| **Rechazar** | → `rejected` → `updateCustomerDocumentStatus()` |
| **Aprobar** | `reviewed` → `approved` → `updateCustomerDocumentStatus()` + `createNotification()` |
| **Marcar surtida** | `approved` → `dispensed` → `updateCustomerDocumentStatus()` |
| **Ver archivo** | Opens `file_url` in new tab (Supabase Storage) |

**Tables:** `customer_documents`, `customers`, `notifications`

---

### PAGE: Solicitudes de recarga (Preorders)

**Purpose:** Manage medication preorders from customers/doctors.

**Status Workflow:** `pending` → `approved` → `ready` → `delivered` → `completed`  
Or: `pending` → `cancelled`

**Buttons:**

| Button | Flow |
|--------|------|
| Status buttons per row | `updatePreorderStatus()` → `preorders` + `createNotification()` |
| **Limpiar** | Clear date filter |

**Tables:** `preorders`, `customers`, `inventory`, `notifications`

---

### PAGE: Citas (Appointments)

**Purpose:** Manage patient appointments.

**Status Workflow:** `pending` → `confirmed` → `completed`  
Or: `pending`/`confirmed` → `cancelled`

**Buttons:**

| Button | Flow |
|--------|------|
| **Confirmar** | `pending` → `confirmed` → `updateAppointment()` + `createNotification()` |
| **Completar** | `confirmed` → `completed` → `updateAppointment()` + `createNotification()` |
| **Cancelar** | → `cancelled` → `updateAppointment()` + `createNotification()` |

**Tables:** `appointments`, `customers`, `profiles`, `notifications`

---

### PAGE: Pedidos (Orders)

**Purpose:** Manage customer orders (sales with status workflow).

**Status Workflow:** `processing` → `ready` → `shipped` → `delivered` → `completed`  
Or: any → `cancelled`

**Buttons:**

| Button | Flow |
|--------|------|
| Status buttons | `updateSaleStatus()` → `sales` |
| **Completed** | Also calls `decrementInventoryItem()` → `inventory` reduced |
| **Cancelled** | Also calls `incrementInventory()` → `inventory` restored |
| **Expand row** | Shows items, customer, payments |

**Tables:** `sales`, `sale_items`, `customers`, `inventory`, `notifications`

---

### PAGE: Perfil de Cliente (Customer Profile)

**Path:** `/admin/customers/:customerId`

**Purpose:** Detailed customer view with history tabs.

**Tabs:**
- Recetas — `getCustomerPrescriptions()`
- Recargas — `getCustomerPreorders()`
- Citas — `getCustomerAppointments()`
- Pedidos — `getCustomerOrders()`

**Buttons:**

| Button | Flow |
|--------|------|
| **Back arrow** | Navigate to `/admin/customers` |

**Tables:** `customers`, `customer_documents`, `preorders`, `appointments`, `sales`

---

### PAGE: Reporte de reorden (Reorder Report)

**Purpose:** Low-stock report with suggested reorder quantities.

**Buttons:**

| Button | Flow |
|--------|------|
| **Exportar CSV** | Download CSV |

**Tables:** `inventory`, `suppliers`

---

### PAGE: Configuración (Settings)

**Purpose:** Tax (IVA) config and bank accounts.

**Buttons:**

| Button | Flow |
|--------|------|
| **IVA toggle** | Enable/disable IVA |
| **Guardar configuración** | `saveTaxSettingsDb()` → `tax_settings` |
| **Agregar cuenta** | Bank account form → `createBankAccount()` → `bank_accounts` |
| **Edit / Delete** (per account) | `updateBankAccount()` / `deleteBankAccount()` |

**Tables:** `tax_settings`, `bank_accounts`

---

### PAGE: Proveedores (Suppliers)

**Purpose:** Two-tab page — supplier directory and purchase orders.

**Tabs:** Proveedores / Órdenes de compra

**Buttons:**

| Button | Flow |
|--------|------|
| **Nuevo proveedor** | Dialog → name, contact, phone, email, notes → `upsertSupplier()` |
| **Nueva orden** | Dialog → supplier, items → `createPurchaseOrder()` → `purchase_orders` + `purchase_order_items` |
| **Edit** (supplier) | `upsertSupplier()` |
| **Delete** (supplier) | `deleteSupplier()` |
| **Edit / Recibir** (PO) | `updatePurchaseOrder()` / `receivePurchaseOrder()` → inventory incremented |
| **Sugerir reorden** | Auto-fills PO items based on low stock |

**Tables:** `suppliers`, `purchase_orders`, `purchase_order_items`, `inventory`, `inventory_movements`

---

### PAGE: Auditoría (Audit Log)

**Purpose:** Full system activity trail.

**Buttons:**

| Button | Flow |
|--------|------|
| **Actualizar** | Refresh data |
| **Exportar CSV** | Download CSV |
| Action filter | Filter by action type |

**Tables:** `audit_log`

---

### PAGE: Contabilidad (Accounting)

**Purpose:** Akaunting accounting integration.

**Buttons:**

| Button | Flow |
|--------|------|
| **Guardar configuración** | `saveAkauntingSettings()` → `akaunting_settings` |
| **Probar conexión** | Test API connection |
| **Abrir Akaunting** | Opens Akaunting URL |
| **Sincronizar clientes** | `syncAllCustomers()` |
| **Sincronizar productos** | `syncAllItems()` |
| **Sincronizar ventas** | `syncAllSales()` |

**Tables:** `akaunting_settings`, `akaunting_mappings`

---

### PAGE: Análisis (Analytics / Reports)

**Purpose:** Sales analytics, profit reports, product analysis.

**Tabs:** Overview / Sales / Profit / Products / Inventory

**Buttons:**

| Button | Flow |
|--------|------|
| **Cargar Ventas** | Load sales summary |
| **Cargar Ganancias** | Load profit report |
| **Cerrar Todos** | `closeAllOpenShifts()` |
| **Cerrar** (per shift) | `closeShift()` |
| **Exportar** (×5 tabs) | Download CSV per tab |

**Tables:** `sales`, `inventory`, `shifts`

---

## SECTION 4 — POS (POINT OF SALE)

### Access

- **URL:** `/pos`
- **Role:** `pos` or `admin`
- **Shift Requirement:** Must have an open shift to use

### Main Interface (Two Views)

| View | Description |
|------|-------------|
| `main` | Product grid + cart panel |
| `checkout` | Payment screen |

### Top Navigation Bar

| Button | Action |
|--------|--------|
| **Search / Barcode** | Real-time product search. Barcode auto-adds if exact match. |
| **Devolución** | Opens `ReturnModal` — process refund by original sale ID |
| **Anular venta** | Opens void dialog — requires admin PIN |
| **Cerrar turno** | Opens `CloseShiftModal` — count cash, close shift |
| **Admin** | Navigate to `/admin` (admin only) |
| **Logout** | End session |

### Product Grid

- Shows top 10 best-selling items by default
- Cards show: Name, Use, Price, Stock, Expiry status
- `Rx` badge if `requires_prescription === true`
- **Click card** → add to cart (disabled if expired or OOS)

### Cart Panel

| Button | Action |
|--------|--------|
| **➖** | Decrease qty by 1 (removes if 0) |
| **➕** | Increase qty by 1 (capped at stock) |
| **🗑** | Remove item from cart |
| **Price input** | Edit price. >10% discount triggers admin PIN |
| **Rx # input** | Enter prescription number (Rx items only) |
| **Discount code + Ticket** | Apply global discount code |
| **Ir a cobrar** | Proceed to checkout |

### Checkout Flow

```
Cashier clicks "Ir a cobrar"
    │
    ├─ Cart has Rx items? ──► PrescriptionModal opens
    │   │                    (Patient name, CURP, Doctor name,
    │   │                     License, Address, Phone,
    │   │                     Prescription #, Date)
    │   │
    │   └─ "Continuar al pago" → Save Rx data → proceed
    │
    └─ No Rx items ──► Checkout view opens
        │
        ├─ Order summary (items, subtotal, discount, IVA, total)
        ├─ Customer selector (search existing / create new)
        │
        ├─ Payment selection:
        │   • Cash → enter amountGiven → change auto-calculated
        │   • Card → enter authorization number
        │   • Transferencia → select bank + reference number
        │   • Insurance → no extra fields
        │
        ├─ Split payment toggle → add multiple payments
        │   (must sum exactly to finalTotal)
        │
        └─ "Finalizar venta" → completeSale()
            │
            ├─ Revalidate expiry + stock (race condition defense)
            ├─ Validate payments sum correctly
            ├─ createSaleWithPayments(sale, items, payments)
            │   → INSERT sales, sale_items, sale_payments
            │   → UPDATE inventory (decrement qty)
            │   → INSERT inventory_movements
            │   → INSERT prescriptions (if Rx items)
            │   → INSERT audit_log (SALE_COMPLETE)
            │   → Background: sync to Akaunting
            │
            └─ ReceiptModal opens automatically
                ├─ Header: pharmacy name, timestamp
                ├─ Folio, Cashier, Customer
                ├─ Items with qty × price
                ├─ Subtotal, Discount, IVA, TOTAL
                ├─ Payment details, Change (if cash)
                └─ Footer: "¡Gracias por su compra!"
                    ├─ "Cerrar" → close modal
                    ├─ "Imprimir" → print receipt
                    └─ "Generar Factura" → toast (not implemented)
```

### Discount Application

1. Cashier enters code → clicks Ticket icon
2. `findDiscount(code)` → queries `discounts` table
3. If found: applies `%` discount to subtotal
4. IVA calculated on discounted subtotal
5. `finalTotal = subtotalAfterDisc + ivaAmount`

### Shift Logic

**Start Shift:**
```
No active shift → ShiftGate blocks POS
    │
    ├─ Cashier enters starting cash
    ├─ "Open Shift" → createShift()
    │   → INSERT shifts (status='open')
    │   → INSERT audit_log (SHIFT_OPEN)
    │
    └─ POS becomes accessible
```

**End Shift:**
```
"Cerrar turno" → CloseShiftModal
    │
    ├─ Step 1: Enter closing cash + notes
    ├─ "Ver resumen" → Step 2
    │   → Calculates variance = closingCash - expectedCash
    │   → Color-coded: green (balanced), red (short), yellow (over)
    │
    └─ "Confirmar cierre" → closeShift()
        → UPDATE shifts (status='closed', totals)
        → INSERT audit_log (SHIFT_CLOSE)
        → POS blocked again
```

---

## SECTION 5 — DOCTOR PORTAL

### Access

- **URL:** `/doctor/*`
- **Role:** `doctor`
- **Navigation:** Sidebar with 6 tabs

### Pages

| Route | Label | Description |
|-------|-------|-------------|
| `/doctor` | Resumen | Dashboard with stats and today's appointments |
| `/doctor/appointments` | Citas | Appointment management |
| `/doctor/customers` | Pacientes | Patient directory (read-only) |
| `/doctor/preorders` | Preórdenes | Medication preorders |
| `/doctor/medical-notes` | Notas médicas | Medical notes |
| `/doctor/profile` | Mi perfil | Doctor's professional profile (read-only) |

### Resumen (Overview)

- 4 stat cards: Citas hoy, Preórdenes pendientes, Pacientes, Notas médicas
- List of today's appointments
- **No actions** — read-only dashboard

### Citas (Appointments)

**Buttons:**

| Button | Flow |
|--------|------|
| **Nueva cita** | Dialog → patient, date/time, status, notes → `createAppointment()` → `appointments` |
| **Confirmar** | `pending` → `confirmed` → `updateAppointment()` |
| **Completar** | `confirmed` → `completed` → `updateAppointment()` |
| **Cancelar** | → `cancelled` → `updateAppointment()` |
| **Editar** | Opens edit dialog |
| **Eliminar** | Confirm → `deleteAppointment()` |

**Tables:** `appointments`, `customers`

### Pacientes (Patients)

- Search by name, phone, CURP, email
- Click row → detail dialog
- Shows: phone, email, address, DOB, medical note count, purchase history
- **Read-only** — no edit/delete

**Tables:** `customers`, `sales`, `sale_items`

### Preórdenes (Preorders)

**Buttons:**

| Button | Flow |
|--------|------|
| **Nueva preórden** | Dialog → patient, medication (dropdown with stock), qty, notes → `createPreorder()` → `preorders` |
| **Listo** | `pending` → `ready` → `updatePreorderStatus()` |
| **Entregado** | `ready` → `picked_up` → `updatePreorderStatus()` |
| **Cancelar** | `pending` → `cancelled` → `updatePreorderStatus()` |

**Tables:** `preorders`, `customers`, `inventory`

### Notas médicas (Medical Notes)

**Buttons:**

| Button | Flow |
|--------|------|
| **Nueva nota** | Dialog → patient, note content → `createMedicalNote()` → `medical_notes` |
| **Ver más / Ver menos** | Expand/collapse long notes |
| **Editar** | Opens edit dialog → `updateMedicalNote()` |
| **Eliminar** | Confirm → `deleteMedicalNote()` |

**Tables:** `medical_notes`, `customers`

### Important Notes

- **Doctors do NOT create prescriptions** — prescriptions are created at POS checkout when controlled medications are sold
- Doctors see `requires_prescription` flag in preorder inventory dropdown
- Doctor profile is managed by admin, read-only for doctor

---

## SECTION 6 — CUSTOMER PORTAL

### Access

- **URL:** `/customer-app/`
- **Technology:** Vanilla JS SPA (not React)
- **Auth:** Supabase Auth (email/password)
- **Device:** Mobile-first (max-width 430px)

### Bottom Navigation (5 Tabs)

| Tab | Data-page | Description |
|-----|-----------|-------------|
| 🏠 Hoy | `home` | Daily progress dashboard |
| ✏️ Cuerpo | `body` | Body metrics (weight, BMI, vitals) |
| 🏥 Salud | `health` | Health tracking (meds, vitals, water, exercise) |
| 💬 Consulta | `consulta` | Appointments (in-person + video) |
| 🛒 Shop | `shop` | Product catalog |

### Additional Menu Items (Hamburger)

| Item | Page |
|------|------|
| 📋 Mis Prescripciones | Prescription upload + history |
| 📦 Mis Pedidos | Order tracking |
| 🎯 Metas | Goals & rewards |
| 🏅 Logros | Achievements |
| 👨‍⚕️ Cuidador | Family profiles |
| 📚 Guías | Health guides |
| ⚙️ Configuración | Settings |

---

### HOME (Hoy) — Daily Progress Dashboard

**Displays:**
- Date header
- Circular progress ring (composite of steps, water, calories, exercise, protein)
- Streak card (🔥 12 días)
- Quick action buttons: +Agua, +Pasos, +Calorías, +Ejercicio
- Today's medications
- Upcoming appointments
- Recent activity

**Buttons:**

| Button | Flow |
|--------|------|
| **+Agua** | `Store.addWater(1)` → progress updates |
| **+Pasos** | `Store.addSteps(500)` → progress updates |
| **+Calorías** | Food log modal → `Store.addFoodLog()` |
| **+Ejercicio** | Exercise modal → `Store.addExercise()` |
| **💊 Med reminder** | Mark dose taken/skipped |

---

### BODY (Cuerpo) — Body Metrics

**Displays:**
- Weight tracker
- BMI card (requires height)
- Body fat %, Lean mass, Ideal weight
- Water intake progress
- Macronutrients
- Heart rate zones
- Quick actions: Registrar peso, Medir presión, Glucosa, Registrar frecuencia cardíaca

**Buttons:**

| Button | Flow |
|--------|------|
| **📏 Configurar altura** | `showHeightModal()` → enter height → `Store.updateProfile({ height })` |
| **Registrar peso** | Weight modal → `Store.addWeightLog()` |
| **Medir presión** | BP modal → `Store.addVitalEntry()` |
| **Glucosa** | Glucose modal → `Store.addVitalEntry()` |
| **Frecuencia cardíaca** | HR modal → `Store.addVitalEntry()` |

---

### HEALTH (Salud) — Health Tracking

**Displays:**
- Medication schedules
- Vitals log (blood pressure, heart rate, glucose, weight)
- Water tracker (14 segments)
- Exercise log
- Food diary
- Sleep tracker
- Fasting tracker
- Check-in

**Buttons:**

| Button | Flow |
|--------|------|
| **+ Medicamento** | Medication modal → `Store.addMedicine()` |
| **+ Recordatorio** | Schedule modal → `Store.addMedicineSchedule()` |
| **Registrar signo vital** | Vital modal → `Store.addVitalEntry()` |
| **+ Vasos** | `Store.addWater(1)` |
| **+ Ejercicio** | Exercise modal → `Store.addExercise()` |
| **+ Comida** | Food modal → `Store.addFoodLog()` |

---

### SHOP (Tienda) — Product Catalog

**Displays:**
- Search bar
- Category tabs: Todos, Con Prescripción, Sin Prescripción, Vitaminas
- Product grid with name, brand, price, stock, Rx badge
- Cart button (top right)

**Buttons:**

| Button | Flow |
|--------|------|
| **Category tab** | Filter by `inventory.category` |
| **Product card** | Opens product detail modal |
| **Agregar al carrito** | `Store.addToCart()` → `updateCartBadge()` |
| **🛒 Cart** | Opens cart modal → checkout |
| **📤 Subir Prescripción** | Opens prescription upload |

**Checkout Flow:**
```
Cart modal → "Ir a pagar"
    │
    ├─ Checkout modal → patient info, payment method
    ├─ "Confirmar pedido" → `FarmaciaAPI.placeOrder(cartItems, checkoutData)`
    │   → INSERT sales (status='processing')
    │   → INSERT sale_items
    │   → `decrement_inventory` RPC (reduce stock)
    │   → `createNotification()` (admin notified)
    │
    └─ Order confirmation → "Seguir comprando"
```

---

### CONSULTA (Appointments)

**Displays:**
- Two sections: Presencial (in-person) and Video

**In-Person Flow:**
```
"Agendar cita presencial" → showInPersonConsulta()
    │
    ├─ Shows available locations with wait times
    ├─ Click location → showLocationBooking(locationId)
    │   → Estimated time calculated from current wait
    │   → Form: name, reason, notes
    │   → "Unirme a la lista" → confirmInPersonBooking()
    │       → `FarmaciaAPI.createAppointment()` → `appointments`
    │
    └─ Back button returns to location list
```

**Video Flow:**
```
"Agendar video consulta" → showVideoConsulta()
    │
    ├─ Shows available doctors
    ├─ Click doctor → showVideoBooking(doctorId)
    │   → Date picker + time slots
    │   → "Confirmar" → confirmVideoBooking()
    │       → `FarmaciaAPI.createAppointment()` → `appointments`
    │
    └─ Back button returns to doctor list
```

---

### PRESCRIPTIONS (Mis Prescripciones)

**Displays:**
- Active prescriptions count
- Prescription cards (local + Supabase)
- Refill request button
- Upload new prescription button

**Buttons:**

| Button | Flow |
|--------|------|
| **Subir Prescripción** | `showUploadPrescriptionModal()` → camera or file upload → `FarmaciaAPI.uploadPrescription(file)` → Storage bucket + `customer_documents` |
| **Solicitar recarga** | Refill modal → select pharmacy → `FarmaciaAPI.requestRefill()` |
| **Ver detalle** | Prescription detail modal |

**Upload Flow:**
```
Customer selects file
    │
    ├─ File uploaded to Supabase Storage (customer-documents bucket)
    ├─ Public URL generated
    ├─ `FarmaciaAPI.uploadPrescription()` → INSERT customer_documents
    │   (document_type='receta', status='pending', file_url=publicUrl)
    │
    └─ Admin sees in Admin → Recetas médicas
        → Admin reviews → approves/rejects
        → Customer sees status update
```

---

### ORDERS (Mis Pedidos)

**Displays:**
- Order history from Supabase + localStorage fallback
- Status badges: processing, ready, shipped, delivered, completed, cancelled

**Data Source:**
- Primary: `FarmaciaAPI.getCustomerOrders()` → `sales` table (customer-scoped)
- Fallback: `localStorage` (`apollo_orders`)

---

### NOTIFICATIONS

**Access:** Bell icon in header

**Flow:**
```
Click bell → showNotificationModal()
    │
    ├─ `FarmaciaAPI.getNotifications()` → `notifications` table
    ├─ Displays list with icon, title, message, time
    ├─ Unread items highlighted
    │
    ├─ Click item → markCustomerNotificationRead(id)
    │   → `FarmaciaAPI.markNotificationRead()` → UPDATE notifications
    │   → Badge count decrements
    │
    └─ "Marcar todas" → markAllCustomerNotificationsRead()
        → `FarmaciaAPI.markAllNotificationsRead()`
```

**Polling:** Badge count polls every 30 seconds via `pollNotificationCount()`

---

## SECTION 7 — DATABASE MAP

### Complete Table Directory

| # | Table | Purpose | Portals |
|---|-------|---------|---------|
| 1 | `organizations` | Top-level pharmacy business | All |
| 2 | `locations` | Branches / sucursales | All |
| 3 | `profiles` | User accounts (extends auth.users) | All |
| 4 | `customers` | Customer directory | All |
| 5 | `inventory` | Product catalog & live stock | All |
| 6 | `inventory_movements` | Stock change audit log | Admin, POS |
| 7 | `inventory_batches` | FEFO/FIFO lot tracking | Admin, POS |
| 8 | `stock_adjustments` | Manual inventory corrections | Admin, POS |
| 9 | `sales` | Transaction headers | Admin, POS, Customer |
| 10 | `sale_items` | Transaction line items | Admin, POS, Customer |
| 11 | `sale_payments` | Split payment records | Admin, POS |
| 12 | `returns` | Return headers | Admin, POS |
| 13 | `return_items` | Return line items | Admin, POS |
| 14 | `discounts` | Promo codes | Admin, POS |
| 15 | `shifts` | Cashier shift tracking | Admin, POS |
| 16 | `tax_settings` | Per-org IVA config | Admin |
| 17 | `bank_accounts` | Bank details for transfers | Admin, POS |
| 18 | `suppliers` | Vendor directory | Admin |
| 19 | `purchase_orders` | PO headers | Admin |
| 20 | `purchase_order_items` | PO line items | Admin |
| 21 | `supplier_products` | Supplier ↔ inventory links | Admin |
| 22 | `prescriptions` | COFEPRIS prescription records | Admin, POS, Doctor, Customer |
| 23 | `customer_documents` | Uploaded patient files | Admin, Customer |
| 24 | `doctor_profiles` | Extended doctor data | Admin, Doctor |
| 25 | `appointments` | Doctor-patient scheduling | Admin, Doctor, Customer |
| 26 | `preorders` | Medication reservations | Admin, POS, Doctor, Customer |
| 27 | `medical_notes` | Clinical notes | Admin, Doctor, Customer (read) |
| 28 | `notifications` | In-app alerts | Admin, Customer |
| 29 | `audit_log` | System activity trail | Admin |
| 30 | `akaunting_settings` | Accounting integration config | Admin |
| 31 | `akaunting_mappings` | ID sync registry | Admin |

### Entity Relationships

```
organizations
  ├── locations
  ├── profiles (extends auth.users)
  │   ├── doctor_profiles
  │   └── customers (linked via customers.profile_id)
  ├── inventory
  │   ├── inventory_batches
  │   ├── inventory_movements
  │   ├── stock_adjustments
  │   └── supplier_products
  ├── discounts
  ├── shifts
  ├── sales
  │   ├── sale_items
  │   ├── sale_payments
  │   └── prescriptions (1:1 via sale_id)
  ├── returns
  │   └── return_items
  ├── suppliers
  │   ├── purchase_orders
  │   │   └── purchase_order_items
  │   └── supplier_products
  ├── appointments
  ├── preorders
  ├── medical_notes
  ├── customer_documents
  ├── notifications
  ├── audit_log
  ├── tax_settings
  ├── bank_accounts
  ├── akaunting_settings
  └── akaunting_mappings
```

### Key Database Functions (RPC)

| Function | Purpose |
|----------|---------|
| `decrement_inventory(p_id, p_qty)` | Atomically reduce stock + increment sales_count |
| `handle_new_user()` | Trigger: auto-create profiles row on signup |
| `get_my_org_id()` | Returns current user's org_id |
| `is_admin()` | True if role = 'admin' |
| `is_org_staff()` | True if role is admin/pos/inventory/doctor |

---

## SECTION 8 — STORAGE

### Bucket: `customer-documents`

**Purpose:** Store customer-uploaded prescription images and documents.

**Created by:** `MIGRATION_create_storage_bucket_customer_documents.sql`

**RLS Policies:**
- Authenticated users can upload (`INSERT`)
- Authenticated users can read (`SELECT`)

**Upload Flow:**
```
Customer selects file in portal
    │
    ├─ `sb.storage.from('customer-documents').upload(filePath, file)`
    │   → filePath = `recetas/{orgId}/{customerId}/{timestamp}_{filename}`
    │
    ├─ `sb.storage.from('customer-documents').getPublicUrl(filePath)`
    │   → Returns public URL
    │
    └─ `customer_documents` row created with file_url
```

**Admin Access:**
- Admin views document list in Recetas médicas page
- Clicks "Ver archivo" → opens public URL in new tab
- File is served directly from Supabase CDN

**Security:**
- Bucket is `public = true` (files accessible by URL)
- Path includes org_id and customer_id for implicit scoping
- No org-level isolation at bucket level — relies on app-level filtering

---

## SECTION 9 — NOTIFICATIONS

### Notification System

**Table:** `notifications`

**Who Creates:**
- Admin actions (prescription review, preorder status change, appointment status change, order status change)
- System events

**Who Receives:**
- Customers: own notifications via `profile_id` or `customer_id`
- Admins: all org notifications

**Where They Appear:**
- **Customer Portal:** Bell icon in header → modal panel
- **Admin Portal:** Not integrated into UI (notifications are customer-facing)

**Notification Types:**
| Type | Icon | Trigger |
|------|------|---------|
| `prescription` | 📄 | Prescription status change |
| `refill` | 💊 | Refill request update |
| `appointment` | 📅 | Appointment status change |
| `order` | 📦 | Order status change |
| `default` | 🔔 | General notification |

**Flow:**
```
Admin changes status (e.g., approves prescription)
    │
    ├─ `updateCustomerDocumentStatus(id, 'approved')`
    ├─ `createNotification({
    │       customer_id: doc.customer_id,
    │       type: 'prescription',
    │       title: 'Prescripción aprobada',
    │       message: '...'
    │   })`
    │
    └─ Customer sees:
        • Badge count increments
        • Notification appears in modal
        • Polling updates every 30s
```

---

## SECTION 10 — COMPLETE USER JOURNEYS

### A. Customer Journey

```
1. SIGNUP
   Customer opens /customer-app/
   → Clicks "Crear cuenta"
   → Enters name, email, password
   → FarmaciaAPI.signUp() → Supabase Auth
   → handle_new_user() trigger → creates profiles + customers rows
   → showToast("Cuenta creada")

2. PROFILE SETUP
   → Onboarding modal appears
   → Enters height (required for BMI)
   → Optional: birthdate, gender
   → completeOnboarding() → Store.updateProfile()
   → Height saved to localStorage (userProfile key)

3. PRESCRIPTION UPLOAD
   → Navigates to Mis Prescripciones
   → Clicks "Subir Prescripción"
   → Takes photo or selects file
   → File uploaded to Storage bucket
   → customer_documents row created (status='pending')
   → Admin notified

4. ADMIN REVIEW
   → Admin sees in Recetas médicas (status=pending)
   → Clicks "Revisar" → status='reviewed'
   → Clicks "Aprobar" → status='approved'
   → createNotification() → customer notified

5. SHOP
   → Customer browses shop
   → Adds items to cart
   → Items with requires_prescription need approved prescription
   → Proceeds to checkout
   → Enters patient info, selects payment
   → placeOrder() → sales + sale_items created

6. ORDER TRACKING
   → Customer sees order in Mis Pedidos
   → Status updates: processing → ready → shipped → delivered
   → Notifications sent at each status change

7. APPOINTMENT
   → Navigates to Consulta
   → Selects in-person or video
   → Fills form → createAppointment()
   → Sees appointment in list
   → Admin confirms → customer notified
```

### B. Doctor Journey

```
1. LOGIN
   → Doctor logs in at /login
   → role='doctor' → redirected to /doctor

2. VIEW PATIENTS
   → Navigates to Pacientes
   → Searches patient
   → Clicks row → sees details + purchase history
   → Read-only — cannot edit

3. CREATE APPOINTMENT
   → Citas → "Nueva cita"
   → Selects patient, date/time
   → createAppointment() → appointments
   → Patient can see in customer portal

4. CREATE PREORDER
   → Preórdenes → "Nueva preórden"
   → Selects patient, medication, quantity
   → createPreorder() → preorders (status='pending')
   → Admin sees in Solicitudes de recarga
   → Admin marks "ready" → doctor marks "delivered"

5. MEDICAL NOTES
   → Notas médicas → "Nueva nota"
   → Selects patient, writes note
   → createMedicalNote() → medical_notes
   → Patient can read (via customer portal)
```

### C. Admin Journey

```
1. INVENTORY MANAGEMENT
   → Admin → Inventario (Admin)
   → Monitors stock levels, expiry dates
   → Low stock → goes to Proveedores
   → "Nueva orden" → creates purchase order
   → Items received → inventory incremented

2. PRESCRIPTION REVIEW
   → Admin → Recetas médicas
   → Sees uploaded prescriptions (pending)
   → Reviews document → "Aprobar" or "Rechazar"
   → Customer notified automatically

3. ORDER PROCESSING
   → Admin → Pedidos
   → Sees customer orders (processing)
   → Picks and packs → "Ready"
   → Ships → "Shipped"
   → Delivered → "Completed" (inventory decremented)
   → Cancelled → "Cancelled" (inventory restored)

4. SALES REPORTING
   → Admin → Análisis
   → Sets date range → "Cargar Ventas"
   → Views sales summary, top products, profit
   → Exports CSV

5. USER MANAGEMENT
   → Admin → Usuarios
   → "Agregar usuario" → creates cashier/doctor/inventory staff
   → Sets role, location, PIN
   → User can immediately log in
```

### D. Cashier (POS) Journey

```
1. START SHIFT
   → Cashier logs in → redirected to /pos
   → No active shift → ShiftGate appears
   → Enters starting cash → "Open Shift"
   → POS becomes accessible

2. PROCESS SALE
   → Searches product (or scans barcode)
   → Product added to cart
   → Adjusts quantities if needed
   → Applies discount code if customer has one
   → Selects customer (search/create)
   → Clicks "Ir a cobrar"
   → If Rx items: enters prescription data
   → Selects payment method (cash/card/transfer/insurance)
   → "Finalizar venta"
   → Receipt prints automatically

3. END SHIFT
   → "Cerrar turno"
   → Counts cash → enters closing amount
   → Views variance (short/over/balanced)
   → "Confirmar cierre"
   → POS blocked until next shift
```

---

## SECTION 11 — BUTTON INVENTORY

### Admin Portal Buttons

| Page | Button | Action | Next Page | Tables |
|------|--------|--------|-----------|--------|
| Overview | Stat card (10x) | Navigate | Respective page | — |
| Overview | Quick action (3x) | Navigate | Users/Sales/Inventory | — |
| Users | Agregar usuario | Open dialog | — | profiles |
| Users | Edit | Open dialog | — | profiles |
| Users | Delete | Confirm delete | — | profiles |
| Customers | Agregar cliente | Open dialog | — | customers |
| Customers | View profile | Navigate | CustomerProfile | — |
| Customers | Edit | Open dialog | — | customers |
| Customers | Delete | Confirm delete | — | customers |
| Doctors | Editar perfil | Open dialog | — | doctor_profiles |
| Sales | Imprimir PDF | Print | — | sales |
| Sales | Exportar CSV | Download | — | sales |
| Sales | Retry sync | Sync | — | sales |
| Discounts | Agregar descuento | Open dialog | — | discounts |
| Discounts | Edit | Inline edit | — | discounts |
| Discounts | Delete | Confirm delete | — | discounts |
| Prescriptions | Revisar | Status → reviewed | — | customer_documents |
| Prescriptions | Rechazar | Status → rejected | — | customer_documents |
| Prescriptions | Aprobar | Status → approved | — | customer_documents |
| Prescriptions | Marcar surtida | Status → dispensed | — | customer_documents |
| Preorders | Status buttons | Status transition | — | preorders |
| Appointments | Confirmar | Status → confirmed | — | appointments |
| Appointments | Completar | Status → completed | — | appointments |
| Appointments | Cancelar | Status → cancelled | — | appointments |
| Orders | Status buttons | Status transition | — | sales |
| Suppliers | Nuevo proveedor | Open dialog | — | suppliers |
| Suppliers | Nueva orden | Open dialog | — | purchase_orders |
| Suppliers | Recibir | Receive PO | — | purchase_orders, inventory |
| Audit | Actualizar | Refresh | — | audit_log |
| Audit | Exportar CSV | Download | — | audit_log |
| Settings | Guardar config | Save tax | — | tax_settings |
| Settings | Agregar cuenta | Add bank | — | bank_accounts |
| Accounting | Guardar config | Save Akaunting | — | akaunting_settings |
| Accounting | Sincronizar | Sync data | — | akaunting_mappings |
| Reports | Cargar Ventas | Load | — | sales |
| Reports | Cerrar Todos | Close shifts | — | shifts |
| Reports | Exportar | Download CSV | — | Various |

### POS Buttons

| Location | Button | Action | Tables |
|----------|--------|--------|--------|
| Top nav | Devolución | Open return modal | returns, return_items, inventory |
| Top nav | Anular venta | Void sale (PIN required) | sales, inventory |
| Top nav | Cerrar turno | Close shift | shifts |
| Product grid | Product card | Add to cart | — |
| Cart | ➖ | Decrease qty | — |
| Cart | ➕ | Increase qty | — |
| Cart | 🗑 | Remove item | — |
| Cart | Price input | Override price (PIN if >10%) | sales |
| Cart | Ticket icon | Apply discount | discounts |
| Cart | Ir a cobrar | Go to checkout | — |
| Checkout | Payment method | Select payment | sale_payments |
| Checkout | Pago dividido toggle | Enable split pay | sale_payments |
| Checkout | Finalizar venta | Complete sale | sales, sale_items, inventory |
| Receipt | Imprimir | Print receipt | — |

### Doctor Portal Buttons

| Page | Button | Action | Tables |
|------|--------|--------|--------|
| Appointments | Nueva cita | Create appointment | appointments |
| Appointments | Confirmar | Status → confirmed | appointments |
| Appointments | Completar | Status → completed | appointments |
| Appointments | Cancelar | Status → cancelled | appointments |
| Appointments | Editar | Edit dialog | appointments |
| Appointments | Eliminar | Delete | appointments |
| Preorders | Nueva preórden | Create preorder | preorders |
| Preorders | Listo | Status → ready | preorders |
| Preorders | Entregado | Status → picked_up | preorders |
| Preorders | Cancelar | Status → cancelled | preorders |
| Medical Notes | Nueva nota | Create note | medical_notes |
| Medical Notes | Editar | Edit note | medical_notes |
| Medical Notes | Eliminar | Delete note | medical_notes |

### Customer Portal Buttons

| Page | Button | Action | Tables |
|------|--------|--------|--------|
| Home | +Agua | Add water | localStorage |
| Home | +Pasos | Add steps | localStorage |
| Home | +Calorías | Log food | localStorage |
| Home | +Ejercicio | Log exercise | localStorage |
| Body | 📏 Configurar altura | Set height | localStorage |
| Body | Registrar peso | Log weight | localStorage |
| Health | +Medicamento | Add medicine | localStorage |
| Health | Registrar vital | Log vital | localStorage |
| Shop | Category tab | Filter products | inventory |
| Shop | Agregar al carrito | Add to cart | localStorage |
| Shop | Ir a pagar | Checkout | sales, sale_items |
| Consulta | Unirme a la lista | Book in-person | appointments |
| Consulta | Confirmar (video) | Book video | appointments |
| Prescriptions | Subir Prescripción | Upload file | customer_documents, Storage |
| Prescriptions | Solicitar recarga | Request refill | preorders |
| Settings | Logout | End session | — |

---

## APPENDIX A — FILE STRUCTURE

```
/Users/admin/Farmacia/farmacia-pos/
├── src/
│   ├── App.jsx                    # Main router
│   ├── main.jsx                   # Entry point
│   ├── pages/
│   │   ├── AdminDashboard.jsx     # Admin shell + sidebar
│   │   ├── PoSDashboard.jsx       # POS terminal
│   │   ├── InventoryDashboard.jsx # Inventory module
│   │   ├── DoctorDashboard.jsx    # Doctor portal shell
│   │   ├── LoginPage.jsx          # Auth login
│   │   ├── ReportsPage.jsx        # Analytics
│   │   └── ...
│   ├── components/
│   │   ├── admin/                 # 19 admin components
│   │   ├── pos/                   # POS components
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── ReceiptModal.jsx
│   │   ├── CloseShiftModal.jsx
│   │   ├── ShiftGate.jsx
│   │   └── ...
│   ├── contexts/
│   │   ├── AuthContext.jsx        # Auth state
│   │   └── ShiftContext.jsx       # Shift state
│   ├── lib/
│   │   ├── db.js                  # All Supabase operations (~1700 lines)
│   │   ├── supabase.js            # Supabase client init
│   │   └── auditLog.js            # Audit constants
│   └── ...
├── public/
│   └── customer-app/              # Customer portal (vanilla JS)
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js             # Main SPA (~9500 lines)
│           ├── api.js             # Supabase API layer
│           ├── store.js           # localStorage data layer
│           ├── data.js            # Constants & keys
│           ├── calculations.js    # Health calculations
│           ├── tracking.js        # Sleep/fasting/check-in
│           ├── notifications.js   # Push notification manager
│           ├── voiceAI.js         # Voice assistant
│           └── components.js      # Shared components
├── supabase_schema_fixed.sql      # Base schema
├── MIGRATION_*.sql                # Various migrations
└── .env / .env.local              # Supabase credentials
```

## APPENDIX B — SECURITY NOTES

### Authentication
- Supabase Auth with email/password
- JWT tokens with role claim
- Role checked at route level (ProtectedRoute)
- Admin PIN required for price overrides and voids

### Authorization (RLS)
- Every business table has RLS enabled
- `org_id` isolation on all tables
- Staff policies: `org_id = get_my_org_id()`
- Customer policies: `profile_id = auth.uid()` or via `customers` subquery
- `SECURITY DEFINER` helper functions for role checks

### Known Issues (Fixed/Planned)
- ✅ C1: showToast undefined → Fixed
- ✅ C2: render functions not on window → Fixed
- ✅ C3: anon access to inventory RPC → Migration ready
- ✅ C4: inventory RPC no org check → Migration ready
- ✅ C5: .env tracked → .gitignore fixed, .env untracked
- ✅ C6: hardcoded org_id → Migration ready
- ✅ C7: store.js no try/catch → Fixed
- 🟡 C5b: Credentials in git history → Requires key rotation + history rewrite

---

*End of Documentation*
