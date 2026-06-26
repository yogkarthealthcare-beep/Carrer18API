DO $$
BEGIN
  ALTER TYPE payment_gateway ADD VALUE IF NOT EXISTS 'payu';
END $$;
