-- Migration: van_inventory table (task 4.2)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS van_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  van_id TEXT NOT NULL DEFAULT 'van_1',  -- 'van_1', 'van_2', etc.
  part_name TEXT NOT NULL,
  category TEXT DEFAULT 'General',       -- 'Tubes', 'Cables', 'Brake Pads', 'Chain', 'Tools', etc.
  quantity INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 2,  -- alert threshold
  unit TEXT DEFAULT 'pcs',               -- 'pcs', 'sets', 'metres', etc.
  cost_aud NUMERIC(10,2),                -- cost price per unit
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE van_inventory ENABLE ROW LEVEL SECURITY;

-- Mechanic can read/update their van inventory
CREATE POLICY "mechanic_read_inventory" ON van_inventory
  FOR SELECT USING (true);

CREATE POLICY "mechanic_update_inventory" ON van_inventory
  FOR UPDATE USING (true);

-- Admin can do everything
CREATE POLICY "admin_all_inventory" ON van_inventory
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger: update updated_at on change
CREATE OR REPLACE FUNCTION update_van_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER van_inventory_updated
  BEFORE UPDATE ON van_inventory
  FOR EACH ROW EXECUTE FUNCTION update_van_inventory_timestamp();

-- Seed: common van inventory items for Van 1
INSERT INTO van_inventory (van_id, part_name, category, quantity, min_quantity, unit, cost_aud) VALUES
  ('van_1', 'Inner tubes 700c 40mm presta', 'Tubes', 6, 3, 'pcs', 4.50),
  ('van_1', 'Inner tubes 26" schrader', 'Tubes', 4, 2, 'pcs', 3.50),
  ('van_1', 'Brake pads rim (pairs)', 'Brake Pads', 4, 2, 'sets', 8.00),
  ('van_1', 'Brake pads disc (pairs)', 'Brake Pads', 3, 2, 'sets', 14.00),
  ('van_1', 'Gear cable inner (1.2mm)', 'Cables', 5, 3, 'pcs', 3.00),
  ('van_1', 'Brake cable inner', 'Cables', 5, 3, 'pcs', 3.00),
  ('van_1', 'Cable housing 5mm (metre)', 'Cables', 3, 2, 'metres', 2.00),
  ('van_1', 'Chain 1x (11 speed)', 'Drivetrain', 2, 1, 'pcs', 28.00),
  ('van_1', 'Chain 2x/3x (10 speed)', 'Drivetrain', 2, 1, 'pcs', 22.00),
  ('van_1', 'Chain lube (wet)', 'Consumables', 2, 1, 'bottle', 12.00),
  ('van_1', 'Chain lube (dry)', 'Consumables', 2, 1, 'bottle', 12.00),
  ('van_1', 'Degreaser 500ml', 'Consumables', 2, 1, 'bottle', 8.00),
  ('van_1', 'Bar tape (pair)', 'Accessories', 3, 2, 'pairs', 9.00),
  ('van_1', 'Quick links 11spd', 'Drivetrain', 4, 2, 'pcs', 3.50),
  ('van_1', 'Patch kit', 'Tubes', 3, 2, 'kit', 3.00)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE van_inventory IS 'Van stock tracking — parts and consumables per van';
