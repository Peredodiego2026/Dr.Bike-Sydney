-- Records the discount / gift card applied at booking time so the mechanic
-- knows to deduct it from the in-person service payment, and so the invoice
-- reflects it. Without these columns the discount only showed in the client UI.

alter table public.bookings add column if not exists discount_applied numeric(10,2) default 0;
alter table public.bookings add column if not exists discount_code text;
