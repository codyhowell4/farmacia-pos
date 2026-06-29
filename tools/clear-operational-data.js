#!/usr/bin/env node
/**
 * Clear all operational / transaction history from the database.
 *
 * Preserves:
 *   - users (auth.users + profiles)
 *   - organizations, locations
 *   - inventory (current stock levels are kept)
 *   - suppliers, tax_settings, bank_accounts, discounts
 *   - akaunting_settings / akaunting_mappings / inventory_settings
 *
 * Deletes:
 *   sales, sale_items, sale_payments, returns, return_items,
 *   inventory_movements, stock_adjustments, inventory_batches,
 *   supplier_products, purchase_orders, purchase_order_items,
 *   prescriptions, customer_documents, customers, medical_notes,
 *   preorders, appointments, doctor_profiles, shifts, notifications,
 *   audit_log.
 *
 * Also resets inventory.sales_count to 0.
 *
 * Required env vars (or .env file):
 *   SUPABASE_URL=https://your-project-ref.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *
 * Usage:
 *   node tools/clear-operational-data.js
 */

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

try {
  const { config } = await import('dotenv');
  config();
} catch {
  // optional
}

const TABLES_IN_ORDER = [
  'sale_payments',
  'sale_items',
  'return_items',
  'returns',
  'sales',
  'customer_documents',
  'prescriptions',
  'medical_notes',
  'preorders',
  'appointments',
  'inventory_movements',
  'stock_adjustments',
  'inventory_batches',
  'supplier_products',
  'purchase_order_items',
  'purchase_orders',
  'customers',
  'doctor_profiles',
  'shifts',
  'notifications',
  'audit_log',
];

async function confirm(message) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${message} (s/N): `);
  rl.close();
  return /^s[ií]?$/i.test(answer.trim());
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Error: Debes definir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  console.log('\n⚠️  ESTO BORRARÁ TODO EL HISTORIAL OPERATIVO:');
  TABLES_IN_ORDER.forEach((t) => console.log(`   - ${t}`));
  console.log('\n✅ Se conservarán: usuarios, organizaciones, ubicaciones, inventario, proveedores, configuración.');
  console.log('\n🛑 Asegúrate de tener un respaldo de tu base de datos antes de continuar.\n');

  const ok = await confirm('¿Estás seguro de que deseas borrar todo el historial?');
  if (!ok) {
    console.log('Operación cancelada.');
    process.exit(0);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = [];

  for (const table of TABLES_IN_ORDER) {
    process.stdout.write(`Eliminando ${table}... `);
    try {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.log(`ERROR: ${error.message}`);
        results.push({ table, status: 'error', message: error.message });
      } else {
        console.log('OK');
        results.push({ table, status: 'ok' });
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ table, status: 'error', message: err.message });
    }
  }

  process.stdout.write('Reiniciando inventory.sales_count... ');
  try {
    const { error } = await supabase.from('inventory').update({ sales_count: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`ERROR: ${error.message}`);
      results.push({ table: 'inventory.sales_count reset', status: 'error', message: error.message });
    } else {
      console.log('OK');
      results.push({ table: 'inventory.sales_count reset', status: 'ok' });
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    results.push({ table: 'inventory.sales_count reset', status: 'error', message: err.message });
  }

  const errors = results.filter((r) => r.status === 'error');
  console.log(`\n✅ Limpieza finalizada. ${errors.length} errores.`);
  if (errors.length > 0) {
    console.log('\nErrores:');
    errors.forEach((e) => console.log(`  - ${e.table}: ${e.message}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
