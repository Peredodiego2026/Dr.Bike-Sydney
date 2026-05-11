-- Run in Supabase SQL Editor

-- 1. Parts inventory table
CREATE TABLE IF NOT EXISTS parts_inventory (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  category    text DEFAULT 'General',
  stock       integer DEFAULT 0,
  min_stock   integer DEFAULT 5,
  cost_price  numeric(10,2) DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE parts_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for inventory" ON parts_inventory FOR ALL USING (true);

-- 2. Push subscription column on profiles (for client push notifications)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_subscription jsonb DEFAULT NULL;

-- 3. Seed some common bike parts (optional)
INSERT INTO parts_inventory (name, category, stock, min_stock, cost_price) VALUES
  ('Brake pads — Shimano B01S', 'Brakes', 20, 5, 8.50),
  ('Brake cable set', 'Cables', 15, 5, 6.00),
  ('Gear cable set', 'Cables', 15, 5, 5.50),
  ('Chain — KMC X11', 'Drivetrain', 10, 3, 22.00),
  ('Tyre tube 700c', 'Tyres', 12, 4, 7.00),
  ('Tyre tube 26"', 'Tyres', 10, 4, 6.50),
  ('Chain lube (dry)', 'Lubrication', 8, 3, 12.00),
  ('Degreaser 500ml', 'Lubrication', 6, 2, 9.00),
  ('Bar tape', 'General', 8, 3, 11.00),
  ('Cable end caps (pack 100)', 'Cables', 3, 1, 4.00)
ON CONFLICT DO NOTHING;
