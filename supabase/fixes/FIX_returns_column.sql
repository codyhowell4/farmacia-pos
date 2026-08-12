-- Fix: Check return_items table structure and fix the SQL function
-- Run this in Supabase SQL Editor

-- First, let's check what columns exist in return_items
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'return_items'
ORDER BY ordinal_position;
