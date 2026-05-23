-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  RLS Policies para bookings                                      ║
-- ║  Ejecutar en Supabase SQL Editor cuando estés listo              ║
-- ║  NOTA: Esto requiere que admin.html y mechanic.html              ║
-- ║  usen service_role key o estén autenticados correctamente        ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- IMPORTANTE: NO ejecutar todavía — admin.html usa anon key sin auth
-- Cuando tengamos auth en admin/mechanic, activar esto:

-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Clientes: solo sus propios bookings
-- CREATE POLICY bookings_select_own ON bookings
--   FOR SELECT USING (auth.uid() = client_id);

-- CREATE POLICY bookings_insert_own ON bookings
--   FOR INSERT WITH CHECK (auth.uid() = client_id);

-- CREATE POLICY bookings_update_own ON bookings
--   FOR UPDATE USING (auth.uid() = client_id);

-- CREATE POLICY bookings_delete_own ON bookings
--   FOR DELETE USING (auth.uid() = client_id);

-- Service role (admin/mechanic server-side) bypasa RLS automáticamente
