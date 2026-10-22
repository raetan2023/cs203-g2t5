import { calendarDays } from './dates';
import { DEMO_SCENARIO_DATE } from './fixtures';
import { PlanError, type PlanInput, type PurchasePlan, type PurchasePlanService } from './types';
import { validateDraft } from './validation';

type Operation = 'read' | 'create' | 'update' | 'delete';
interface MockOptions {
  initialPlans?: PurchasePlan[];
  initialPlan?: PurchasePlan | null;
  scenarioDate?: string;
  /** Preview-owned active historical date; does not change the real API contract. */
  getScenarioDate?: () => string;
  delayMs?: number;
  failOnce?: Partial<Record<Operation, boolean>>;
}

/** Isolated in-memory store. Recreating the service/refreshing resets the demo. */
export function createMockPlanService(options: MockOptions = {}): PurchasePlanService {
  let plans = (options.initialPlans ?? (options.initialPlan ? [options.initialPlan] : [])).map(plan => ({ ...plan }));
  const failures = { ...options.failOnce };
  const getScenarioDate = options.getScenarioDate ?? (() => options.scenarioDate ?? DEMO_SCENARIO_DATE);
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
  function save(input: PlanInput, planId: string = crypto.randomUUID()) {
    const scenarioDate = getScenarioDate();
    const errors = validateDraft({ quantity: String(input.quantity_mt), deadline: input.purchase_deadline }, scenarioDate);
    if (Object.keys(errors).length) throw new PlanError('Please check your inputs.', errors, 422);
    const plan = {
      plan_id: planId,
      ...input,
      scenario_as_of_date: scenarioDate,
      days_remaining: calendarDays(scenarioDate, input.purchase_deadline),
    };
    plans = [...plans.filter(saved => saved.plan_id !== planId), plan];
    return { plan: { ...plan } };
  }
  return {
    async list() {
      await wait('read');
      return { plans: plans.map(active).sort((a, b) => a.purchase_deadline.localeCompare(b.purchase_deadline) || a.plan_id.localeCompare(b.plan_id)) };
    },
    async read(planId) {
      await wait('read');
      const plan = plans.find(plan => plan.plan_id === planId);
      return { plan: plan ? active(plan) : null };
    },
    async create(input) {
      await wait('create');
      return save(input);
    },
    async update(planId, input) {
      await wait('update');
      if (!plans.some(plan => plan.plan_id === planId)) throw new PlanError('No saved purchase plan was found.', {}, 404);
      return save(input, planId);
    },
    async delete(planId) {
      await wait('delete');
      if (!plans.some(plan => plan.plan_id === planId)) throw new PlanError('No saved purchase plan was found.', {}, 404);
      plans = plans.filter(plan => plan.plan_id !== planId);
    },
  };
  function active(plan: PurchasePlan): PurchasePlan {
    const scenarioDate = getScenarioDate();
    return { ...plan, scenario_as_of_date: scenarioDate, days_remaining: calendarDays(scenarioDate, plan.purchase_deadline) };
  }
}
