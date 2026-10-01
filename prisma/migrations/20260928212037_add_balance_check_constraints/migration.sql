-- Defense in depth: the application already enforces these invariants
-- (row lock + check before insert in TransactionsService), but a raw SQL
-- statement, a bug, or a future direct-DB script should not be able to
-- violate them either.

-- A user's materialized balance can never go negative.
ALTER TABLE "users"
  ADD CONSTRAINT "users_balance_non_negative" CHECK ("balance" >= 0);

-- A ledger entry that doesn't move any money shouldn't exist.
ALTER TABLE "transaction_history"
  ADD CONSTRAINT "transaction_history_amount_not_zero" CHECK ("amount" <> 0);
