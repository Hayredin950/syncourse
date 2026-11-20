-- Tikur Pay checkout sessions.
--
-- Additive only: this file creates a table and never touches existing rows, so
-- it is safe to run on the live database after a deploy. `prisma db push` is not
-- used on this project — the schema model and this DDL are kept in step by hand.
--
-- The uniques are the fraud defences, not decorations:
--   subscriptionId — one live session per order, so retrying a receipt reuses
--                    the session instead of spending another gateway credit;
--   paymentNumber  — a gateway session cannot be attached to a second order;
--   reference      — a bank receipt can only ever settle one subscription,
--                    even if two requests claim it in the same millisecond.
CREATE TABLE IF NOT EXISTS "TikurPayment" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "paymentNumber"  TEXT NOT NULL,
  "checkoutUrl"    TEXT,
  "amount"         DOUBLE PRECISION NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'ETB',
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "reference"      TEXT,
  "payerName"      TEXT,
  "bankCode"       TEXT,
  "verificationId" TEXT,
  "expiresAt"      TIMESTAMP(3),
  "verifiedAt"     TIMESTAMP(3),
  "raw"            JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TikurPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TikurPayment_subscriptionId_key" UNIQUE ("subscriptionId"),
  CONSTRAINT "TikurPayment_paymentNumber_key" UNIQUE ("paymentNumber"),
  CONSTRAINT "TikurPayment_reference_key" UNIQUE ("reference"),
  CONSTRAINT "TikurPayment_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
