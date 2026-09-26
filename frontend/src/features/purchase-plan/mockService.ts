import { calendarDays } from './dates';
import { DEMO_SCENARIO_DATE } from './fixtures';
import { PlanError, type PlanInput, type PurchasePlan, type PurchasePlanService } from './types';
import { validateDraft } from './validation';

type Operation = 'read' | 'create' | 'update' | 'delete';
interface MockOptions {
  initialPlan?: PurchasePlan | null;
  scenarioDate?: string;
  delayMs?: number;
  failOnce?: Partial<Record<Operation, boolean>>;
}

/** Isolated in-memory store. Recreating the service/refreshing resets the demo. */
export function createMockPlanService(options: MockOptions = {}): PurchasePlanService {
  let plan = options.initialPlan ? { ...options.initialPlan } : null;
  const failures = { ...options.failOnce };
  const scenarioDate = options.scenarioDate ?? DEMO_SCENARIO_DATE;
  const messages: Record<Operation, string> = {
    read: "We couldn't load your purchase plan. Please try again.",
    create: "We couldn't save your plan. Your inputs are still here—try again.",
    update: "We couldn't save your changes. Your inputs are still here—try again.",
    delete: "We couldn't delete your purchase plan. Please try again.",
  };
  async function wait(operation: Operation) {
    await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 700));
    if (failures[operation]) {
      failures[operation] = false;
      throw new PlanError(messages[operation]);
    }
  }
  function save(input: PlanInput) {
    const errors = validateDraft({ quantity: String(input.quantity_mt), deadline: input.purchase_deadline }, scenarioDate);
    if (Object.keys(errors).length) throw new PlanError('Please check your inputs.', errors, 422);
    plan = {
      plan_id: plan?.plan_id ?? crypto.randomUUID(),
      ...input,
      scenario_as_of_date: scenarioDate,
      days_remaining: calendarDays(scenarioDate, input.purchase_deadline),
    };
    return { plan: { ...plan } };
  }
  return {
    async read() { await wait('read'); return { plan: plan ? { ...plan } : null }; },
    async create(input) {
      await wait('create');
      if (plan) throw new PlanError('You already have a saved plan. Edit or delete it first.', {}, 409);
      return save(input);
    },
    async update(input) {
      await wait('update');
      if (!plan) throw new PlanError('No saved purchase plan was found.', {}, 404);
      return save(input);
    },
    async delete() {
      await wait('delete');
      if (!plan) throw new PlanError('No saved purchase plan was found.', {}, 404);
      plan = null;
    },
  };
}
