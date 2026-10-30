import { calendarDays } from './dates';
import { DEMO_SCENARIO_DATE } from './fixtures';
import { PlanError, type PlanInput, type PurchasePlan, type PurchasePlanService, type SubmissionResponse, type BuyerDecisionNotification } from './types';
import { validateDraft } from './validation';

type Operation = 'read' | 'create' | 'update' | 'delete' | 'withdraw' | 'revise' | 'purchase' | 'seen';
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
  const messages: Partial<Record<Operation, string>> = {
    read: "We couldn't load your purchase plan. Please try again.",
    create: "We couldn't save your plan. Your inputs are still here—try again.",
    update: "We couldn't save your changes. Your inputs are still here—try again.",
    delete: "We couldn't delete your purchase plan. Please try again.",
  };
  const outcomes = new Map<string, SubmissionResponse>();
  const notifications: BuyerDecisionNotification[] = [];
  const instant = () => `${getScenarioDate()}T01:30:00Z`;
  function owned(id: string, state?: string) {
    const plan = plans.find(p => p.plan_id === id);
    if (!plan) throw new PlanError('No saved purchase plan was found.', {}, 404);
    if (state && (plan.status ?? 'draft') !== state) throw new PlanError('The plan changed. Reload before continuing.', {}, 409);
    return plan;
  }
  function replace(plan: PurchasePlan) { plans = plans.map(p => p.plan_id === plan.plan_id ? plan : p); return { plan: active(plan) }; }
  function notify(plan: PurchasePlan, decision: 'approved' | 'rejected', comment: string) {
    const record = { decision_id: crypto.randomUUID(), decision, comment, manager_clerk_user_id: 'user_preview_manager', manager_label: 'Procurement Manager (preview)', decided_at: instant() };
    outcomes.set(plan.plan_id, { ...outcomes.get(plan.plan_id), submission: outcomes.get(plan.plan_id)?.submission ?? null, decision: record });
    notifications.push({ notification_id: crypto.randomUUID(), plan_id: plan.plan_id, decision, created_at: instant(), seen_at: null, quantity_mt: plan.quantity_mt, purchase_deadline: plan.purchase_deadline, manager_label: record.manager_label, comment });
  }
  for (const plan of plans) if (plan.status === 'approved' || plan.status === 'rejected' || plan.status === 'purchased') notify(plan, plan.status === 'rejected' ? 'rejected' : 'approved', 'Synthetic preview decision.');
  async function wait(operation: Operation) {
    await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 700));
    if (failures[operation]) {
      failures[operation] = false;
      throw new PlanError(messages[operation as keyof typeof messages] ?? 'The change could not be saved. Please retry.');
    }
  }
  function save(input: PlanInput, planId: string = crypto.randomUUID()) {
    const scenarioDate = getScenarioDate();
    const errors = validateDraft({ quantity: String(input.quantity_mt), deadline: input.purchase_deadline }, scenarioDate);
    if (Object.keys(errors).length) throw new PlanError('Please check your inputs.', errors, 422);
    const plan: PurchasePlan = {
      ...plans.find(p => p.plan_id === planId),
      status: 'draft',
      plan_id: planId,
      ...input,
      scenario_as_of_date: scenarioDate,
      days_remaining: calendarDays(scenarioDate, input.purchase_deadline),
    };
    plans = [...plans.filter(saved => saved.plan_id !== planId), plan];
    return { plan: { ...plan } };
  }
  return {
    async submit(id) {
      await wait('update'); const plan = owned(id, 'draft');
      if (plan.purchase_deadline < getScenarioDate()) throw new PlanError('Update the deadline before submitting.', {}, 422);
      return replace({ ...plan, status: 'submitted', submitted_at: instant() });
    },
    async decide(id, input) {
      await wait('update'); const plan = owned(id, 'submitted');
      if (input.decision === 'rejected' && !input.comment.trim()) throw new PlanError('Provide a rejection reason.', {}, 422);
      notify(plan, input.decision, input.comment.trim());
      return replace({ ...plan, status: input.decision });
    },
    async readSubmission(id) {
      await wait('read'); owned(id);
      return { ...outcomes.get(id), submission: outcomes.get(id)?.submission ?? null,
        revision_plan_ids: plans.filter(p => p.previous_plan_id === id).map(p => p.plan_id) };
    },
    async withdraw(id, reason = '') {
      await wait('withdraw'); const plan = owned(id, 'submitted');
      if (reason.trim().length > 2000) throw new PlanError('Use at most 2000 characters.', { reason: 'Use at most 2000 characters.' }, 422);
      outcomes.set(id, { ...outcomes.get(id), submission: outcomes.get(id)?.submission ?? null, withdrawal: { reason: reason.trim(), withdrawn_at: instant() } });
      return replace({ ...plan, status: 'withdrawn' });
    },
    async revise(id) {
      await wait('revise'); const plan = owned(id);
      if (plan.status !== 'rejected' && plan.status !== 'withdrawn') throw new PlanError('Only rejected or withdrawn plans can be copied.', {}, 409);
      const copy = active({ ...plan, plan_id: crypto.randomUUID(), previous_plan_id: id, status: 'draft', submitted_at: null });
      plans.push(copy); return { plan: { ...copy } };
    },
    async recordPurchase(id, input) {
      await wait('purchase'); const plan = owned(id, 'approved');
      const approvedOn = outcomes.get(id)?.decision?.decided_at.slice(0, 10) ?? getScenarioDate();
      if (!input.supplier.trim() || input.supplier.trim().length > 200 || !Number.isFinite(input.quantity_mt) || input.quantity_mt <= 0
          || !Number.isFinite(input.price_usd_per_mt) || input.price_usd_per_mt <= 0 || input.purchased_on > getScenarioDate() || input.purchased_on < approvedOn)
        throw new PlanError('Please check the purchase details.', {}, 422);
      outcomes.set(id, { ...outcomes.get(id), submission: outcomes.get(id)?.submission ?? null,
        purchase: { ...input, purchase_id: crypto.randomUUID(), total_usd: input.quantity_mt * input.price_usd_per_mt, recorded_at: instant() } });
      return replace({ ...plan, status: 'purchased' });
    },
    async buyerNotifications() { await wait('read'); return { notifications: [...notifications].reverse().slice(0, 100).map(n => ({ ...n })), unread_count: notifications.filter(n => !n.seen_at).length }; },
    async markNotificationSeen(id) {
      await wait('seen'); const n = notifications.find(n => n.notification_id === id);
      if (!n) throw new PlanError('No notification was found.', {}, 404);
      n.seen_at ??= instant();
    },
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
      owned(planId, 'draft');
      return save(input, planId);
    },
    async delete(planId) {
      await wait('delete');
      owned(planId, 'draft');
      plans = plans.filter(plan => plan.plan_id !== planId);
    },
  };
  function active(plan: PurchasePlan): PurchasePlan {
    const scenarioDate = getScenarioDate();
    return { ...plan, scenario_as_of_date: scenarioDate, days_remaining: calendarDays(scenarioDate, plan.purchase_deadline) };
  }
}
