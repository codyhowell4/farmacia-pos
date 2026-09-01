-- ============================================================================
-- Add per-batch unit cost to inventory_batches
-- Used by the inventory "restock" (registrar compra) flow: each purchase
-- creates a batch row with its own cost, expiration date and lote.
-- Run in Supabase SQL Editor.
-- ============================================================================

ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS cost numeric(12,2);
