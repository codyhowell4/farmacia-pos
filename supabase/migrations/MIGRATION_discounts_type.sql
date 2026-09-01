-- Add discount type: 'percent' (default, % off price) or 'cost_plus' (price = cost + value %)
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'percent';
