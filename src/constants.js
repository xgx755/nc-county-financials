// Shared category constants — source of truth for both interactive and print views.
// Using Object.freeze() since these are never mutated.

export const REV_CATS = Object.freeze([
  "Property Taxes", "Other Taxes", "Sales Tax",
  "Sales & Services", "Intergovernmental", "Debt Proceeds", "Other Misc",
]);

export const EXP_CATS = Object.freeze([
  "Education", "Debt Service", "Human Services",
  "General Government", "Public Safety", "Other",
]);
