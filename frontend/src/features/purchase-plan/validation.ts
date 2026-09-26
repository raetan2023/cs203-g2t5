import { isValidDate } from './dates';
import type { FieldErrors } from './types';

export interface PlanDraft { quantity: string; deadline: string }

export function validateDraft(draft: PlanDraft, scenarioDate: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.quantity.trim()) errors.quantity_mt = 'Enter a quantity.';
  else if (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0) {
    errors.quantity_mt = 'Quantity must be greater than zero.';
  }
  if (!draft.deadline) errors.purchase_deadline = 'Choose a purchase deadline.';
  else if (!isValidDate(draft.deadline)) errors.purchase_deadline = 'Enter a valid date.';
  else if (draft.deadline < scenarioDate) {
    errors.purchase_deadline = `Purchase deadline cannot be before ${scenarioDate}.`;
  }
  return errors;
}
