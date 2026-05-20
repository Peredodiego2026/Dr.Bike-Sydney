-- Migration: Prevenir double-booking del mismo slot
-- Crea constraint UNIQUE en bookings: misma van + misma fecha + misma hora no puede repetirse
-- Excluye bookings cancelled para permitir re-booking del mismo slot después de cancelación

-- Crear índice único parcial (PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_slot
ON public.bookings (van_number, scheduled_date, scheduled_time)
WHERE status NOT IN ('cancelled');

-- Verificar que el índice se creó
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'bookings'
AND indexname = 'bookings_unique_slot';
