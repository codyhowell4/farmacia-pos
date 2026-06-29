#!/usr/bin/env node
/**
 * Bulk import / replace inventory from a CSV file.
 *
 * CSV expected columns:
 *   Producto,Costo,Venta,Existencia,Departamento
 *
 * Usage:
 *   node tools/import-inventory-csv.js <path-to-csv> [options]
 *
 * Required environment variables (or a .env file):
 *   SUPABASE_URL=https://your-project-ref.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *
 * Optional environment variables:
 *   ORG_ID=uuid               # Target organization
 *   LOCATION_ID=uuid          # Optional location
 *
 * Options:
 *   --org-id <uuid>
 *   --location-id <uuid>
 *   --merge-duplicates        # Merge rows with the same product name
 *   --dry-run                 # Parse and validate only, do not write to DB
 *   --skip-confirm            # Skip the destructive-operation confirmation
 *   --help
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// Try to load a local .env file if one exists.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv is optional; env vars can be set externally.
}

function showHelp() {
  console.log(`
Uso: node tools/import-inventory-csv.js <ruta-al-csv> [opciones]

Ejemplo:
  node tools/import-inventory-csv.js "C:/Users/codyh/Downloads/inventario.csv" --org-id 00000000-0000-0000-0000-000000000000 --merge-duplicates --dry-run

Variables de entorno requeridas (o archivo .env):
  SUPABASE_URL=https://tu-proyecto.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

Variables de entorno opcionales:
  ORG_ID=uuid
  LOCATION_ID=uuid

Opciones:
  --org-id <uuid>        Organización objetivo
  --location-id <uuid>   Ubicación objetivo (opcional)
  --merge-duplicates     Combinar filas con el mismo nombre sumando existencias
  --dry-run              Solo analizar, no modificar la base de datos
  --skip-confirm         Omitir confirmación antes de borrar/insertar
  --help                 Mostrar esta ayuda
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    file: null,
    orgId: process.env.ORG_ID || null,
    locationId: process.env.LOCATION_ID || null,
    mergeDuplicates: false,
    dryRun: false,
    skipConfirm: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      case '--org-id':
        result.orgId = args[++i] || null;
        break;
      case '--location-id':
        result.locationId = args[++i] || null;
        break;
      case '--merge-duplicates':
        result.mergeDuplicates = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--skip-confirm':
        result.skipConfirm = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          result.file = arg;
        } else {
          console.warn(`Opción desconocida: ${arg}`);
        }
    }
  }

  return result;
}

function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseMoney(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const cleaned = String(value)
    .replace(/^\$/, '')
    .replace(/,/g, '')
    .trim();
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function parseQuantity(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  const number = parseFloat(cleaned);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function normalizeDepartment(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeName(value) {
  if (!value) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function stripBom(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

async function readCsv(filePath) {
  const fullPath = resolve(filePath);
  const buffer = stripBom(readFileSync(fullPath));
  const text = buffer.toString('utf-8');

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
  });

  return records;
}

function buildInventoryRows(records, orgId, locationId, mergeDuplicates, departmentColumn = 'use_description') {
  const rows = [];
  const errors = [];
  const seen = new Map();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const line = i + 2; // +2 because header is line 1 and arrays are 0-based

    // The CSV uses Spanish headers. Accept common variants.
    const name = normalizeName(
      record.Producto ?? record.producto ?? record.Nombre ?? record.nombre ?? record.NAME ?? record.name
    );
    const cost = parseMoney(record.Costo ?? record.costo ?? record.COSTO ?? record.cost);
    const price = parseMoney(record.Venta ?? record.venta ?? record.VENTA ?? record.price ?? record.precio);
    const quantity = parseQuantity(record.Existencia ?? record.existencia ?? record.EXISTENCIA ?? record.stock ?? record.cantidad);
    const department = normalizeDepartment(
      record.Departamento ?? record.departamento ?? record.DEPARTAMENTO ?? record.category ?? record.categoria
    );

    if (!name) {
      errors.push({ line, reason: 'Falta el nombre del producto', record });
      continue;
    }

    if (cost < 0 || price < 0) {
      errors.push({ line, reason: 'Costo o precio negativo', record });
      continue;
    }

    const row = {
      org_id: orgId,
      location_id: locationId || null,
      name,
      cost,
      price,
      quantity,
      low_stock_threshold: 10,
      barcode: null,
      warehouse_location: null,
      expiration_date: null,
      requires_prescription: false,
      sales_count: 0,
    };
    row[departmentColumn] = department || null;

    if (mergeDuplicates) {
      const existing = seen.get(name.toLowerCase());
      if (existing) {
        existing.quantity += quantity;
        existing.cost = cost; // Keep the last cost
        existing.price = price; // Keep the last price
        if (department) existing[departmentColumn] = department;
      } else {
        seen.set(name.toLowerCase(), row);
        rows.push(row);
      }
    } else {
      rows.push(row);
    }
  }

  return { rows, errors };
}

async function confirm(message) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${message} (s/N): `);
  rl.close();
  return /^s[ií]?$/i.test(answer.trim());
}

async function getDepartmentColumn(supabase) {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'inventory')
      .in('column_name', ['use', 'use_description']);

    if (error) {
      console.warn(`No se pudo detectar la columna de departamento: ${error.message}. Se usará 'use_description'.`);
      return 'use_description';
    }

    const names = data.map((c) => c.column_name);
    if (names.includes('use')) return 'use';
    if (names.includes('use_description')) return 'use_description';
    return 'use_description';
  } catch (err) {
    console.warn(`No se pudo detectar la columna de departamento: ${err.message}. Se usará 'use_description'.`);
    return 'use_description';
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.file) {
    console.error('Error: Debes indicar la ruta al archivo CSV.');
    showHelp();
    process.exit(1);
  }

  if (!args.orgId) {
    console.error('Error: Debes indicar --org-id o definir la variable de entorno ORG_ID.');
    process.exit(1);
  }

  if (!isValidUuid(args.orgId)) {
    console.error('Error: --org-id no es un UUID válido.');
    process.exit(1);
  }

  if (args.locationId && !isValidUuid(args.locationId)) {
    console.error('Error: --location-id no es un UUID válido.');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`\n📄 Archivo CSV: ${resolve(args.file)}`);
  console.log(`🏢 Org ID: ${args.orgId}`);
  if (args.locationId) console.log(`📍 Location ID: ${args.locationId}`);
  console.log(`🧪 Modo dry-run: ${args.dryRun ? 'Sí' : 'No'}`);
  console.log(`🔀 Combinar duplicados: ${args.mergeDuplicates ? 'Sí' : 'No'}`);

  let records;
  try {
    records = await readCsv(args.file);
  } catch (err) {
    console.error(`Error leyendo el CSV: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n📊 Filas leídas del CSV: ${records.length}`);

  let supabase = null;
  let departmentColumn = 'use_description';

  if (!args.dryRun) {
    if (!supabaseUrl || !supabaseKey) {
      console.error('Error: Debes definir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para escribir en la base de datos.');
      console.error('Puedes crear un archivo .env en la raíz del proyecto con estas variables.');
      process.exit(1);
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    departmentColumn = await getDepartmentColumn(supabase);
    console.log(`📋 Columna de departamento detectada: ${departmentColumn}`);
  }

  const { rows, errors } = buildInventoryRows(records, args.orgId, args.locationId, args.mergeDuplicates, departmentColumn);

  console.log(`✅ Filas válidas: ${rows.length}`);
  console.log(`❌ Filas con error: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nPrimeros errores:');
    errors.slice(0, 10).forEach((e) => {
      console.log(`  Línea ${e.line}: ${e.reason} → ${JSON.stringify(e.record)}`);
    });
  }

  if (rows.length === 0) {
    console.error('No hay filas válidas para importar. Abortando.');
    process.exit(1);
  }

  // Show a small sample.
  console.log('\nMuestra de los primeros 5 productos:');
  rows.slice(0, 5).forEach((r) => {
    const dept = r[departmentColumn] || '-';
    console.log(`  - ${r.name} | costo $${r.cost.toFixed(2)} | venta $${r.price.toFixed(2)} | existencia ${r.quantity} | depto ${dept}`);
  });

  if (args.dryRun) {
    console.log('\n🛑 Dry-run finalizado. No se realizaron cambios en la base de datos.');
    process.exit(0);
  }

  // Count existing inventory for the org so we can report what was replaced.
  const { count: existingCount, error: countError } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', args.orgId)
    .is('location_id', args.locationId || null);

  if (countError) {
    console.error(`Error consultando inventario existente: ${countError.message}`);
    process.exit(1);
  }

  console.log(`\n⚠️  Esto reemplazará ${existingCount ?? '?'} productos existentes por ${rows.length} productos del CSV.`);

  if (!args.skipConfirm) {
    const ok = await confirm('¿Estás seguro de que deseas continuar?');
    if (!ok) {
      console.log('Operación cancelada por el usuario.');
      process.exit(0);
    }
  }

  // Delete existing inventory for the org/location.
  console.log('\n🗑️  Borrando inventario existente...');
  let deleteQuery = supabase.from('inventory').delete().eq('org_id', args.orgId);
  if (args.locationId) {
    deleteQuery = deleteQuery.eq('location_id', args.locationId);
  } else {
    deleteQuery = deleteQuery.is('location_id', null);
  }
  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    console.error(`Error borrando inventario: ${deleteError.message}`);
    process.exit(1);
  }

  // Insert new inventory in batches.
  const BATCH_SIZE = 1000;
  let inserted = 0;
  let insertErrors = [];

  console.log('💾 Insertando nuevo inventario...');
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase.from('inventory').insert(batch);

    if (insertError) {
      console.error(`Error insertando lote ${i / BATCH_SIZE + 1}: ${insertError.message}`);
      insertErrors.push({ batchIndex: i / BATCH_SIZE + 1, error: insertError });
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Progreso: ${inserted}/${rows.length}`);
    }
  }

  console.log('\n\n✅ Importación completada.');
  console.log(`   Insertados: ${inserted}`);
  console.log(`   Errores de inserción: ${insertErrors.length}`);

  if (insertErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
