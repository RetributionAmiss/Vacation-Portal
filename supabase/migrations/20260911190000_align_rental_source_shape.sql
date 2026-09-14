-- The Google Sheets Cabins source stores `Fees and Taxes` as descriptive text
-- (for example, "Our prices include all fees. No hidden fees."), not as a
-- monetary amount. Preserve that source fidelity without destructively
-- removing the original cents column yet; the legacy numeric column remains
-- available for a future audited migration if a real numeric source emerges.
alter table public.rentals
  add column if not exists fees_and_taxes text;

comment on column public.rentals.fees_and_taxes is
  'Descriptive Fees and Taxes text mirrored from the legacy Cabins source.';
