import type { ForecastService, ReadyForecast } from '../forecast/apiService';
import type { PlanAnalysis, PlanResultContext } from '../purchase-plan/types';
import { addCalendarDays, calendarDays } from '../purchase-plan/dates';
import type { RecommendationService } from './service';

const horizons = [7, 14, 30] as const;
const authFailure = (error: unknown) => /sign in|session|unauthoriz|forbidden/i.test(String(error))
  || [401, 403, 409].includes((error as { status?: number })?.status ?? 0);
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Service timed out')), 10000); })]); }
  finally { clearTimeout(timer!); }
}

/** Explicit illustrative estimates, scoped to this signed-in session and planning date. */
export function createPurchaseFallback(source: ForecastService, analysis: RecommendationService | undefined, today: string) {
  let pending: Promise<ReadyForecast[]> | undefined;
  let latest: ReadyForecast[] | undefined;
  async function snapshot() {
    if (pending) return pending;
    pending = (async () => {
      const results = await Promise.allSettled(horizons.map(h => bounded(source.read(h))));
      for (const result of results) if (result.status === 'rejected' && authFailure(result.reason)) throw result.reason;
      const ready = results.flatMap(r => r.status === 'fulfilled' && r.value.status === 'ready' ? [r.value] : []);
      const anchor = ready[0];
      const price = anchor?.anchor_price ?? 1351.5;
      const quote = anchor?.anchor_quote_date ?? today;
      const history = anchor?.history ?? [];
      const last = history.at(-1), previous = history.at(-2);
      const days = last && previous ? calendarDays(previous.date, last.date) : 0;
      const observedTrend = days > 0 && previous!.price > 0 ? (last!.price / previous!.price - 1) / days : 0;
      // A flat/missing trend uses an explicitly mock mild decline so the demo remains usable.
      const trend = observedTrend === 0 ? -0.001 : Math.max(-0.002, Math.min(0.002, observedTrend));
      const run = `illustrative-${today}-${price}-${quote}-${trend}`;
      latest = horizons.map((h, i) => {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value.status === 'ready' && result.value.target_date === addCalendarDays(today, h)) return result.value;
        const central = price * (1 + trend) ** h, spread = .08 * Math.sqrt(h / 7);
        return { status: 'ready', run_id: run, forecast_origin_date: today, target_date: addCalendarDays(today, h),
          anchor_quote_date: quote, anchor_price: price, forecast: central, low: central * (1 - spread), high: central * (1 + spread),
          unit: 'USD/metric tonne', horizon_days: h, synthetic: true, model_version: 'illustrative-trend-fallback-v1',
          published_at: `${today}T00:00:00Z`, news_window_start: `${addCalendarDays(today, -1)}T00:00:00Z`, news_window_end: `${today}T00:00:00Z`,
          source_dates: anchor ? { mgo: quote } : {}, history, top_drivers: [], evidence: 'unevaluated', mae_skill_vs_persistence: null,
          interval: { method: 'illustrative_fallback', nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0,
            baseline_coverage: null, baseline_mean_width: null, mean_width: null, evaluation_scope: 'Not evaluated',
            limitations: anchor ? 'Illustrative trend estimate from a dated quote; not Ridge output. Flat trends use a mock decline. Ranges are illustrative.'
              : 'Mock baseline USD 1,351.50/MT: no observed quote could be loaded. Prices and ranges are illustrative.' } } satisfies ReadyForecast;
      });
      // One comparison identity for a group containing fallback estimates.
      if (latest.some(f => f.model_version === 'illustrative-trend-fallback-v1')) latest = latest.map(f => ({ ...f, run_id: run }));
      return latest;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  const forecasts: ForecastService = { read: async h => (await snapshot()).find(f => f.horizon_days === h)! };
  async function read(context: PlanResultContext, h: number = 7, runId?: string, impact = false): Promise<PlanAnalysis> {
    const group = latest ?? await snapshot();
    if (!group.some(f => f.model_version === 'illustrative-trend-fallback-v1')) {
      try {
        const operation = impact ? analysis?.readImpact : analysis?.read;
        if (operation) {
          const result = await bounded(operation.call(analysis, context, h, runId));
          if (result.forecast.status === 'ready' && result.forecast.value.target_date === addCalendarDays(today, h)
            && (impact ? result.cost_impact.status === 'ready' : result.recommendation.status === 'ready')) return result;
        }
      } catch (error) { if (authFailure(error)) throw error; }
    }
    const f = group.find(f => f.horizon_days === h) ?? group[0];
    const eligible = group.filter(x => x.target_date <= context.purchase_deadline);
    const best = eligible.reduce<ReadyForecast | undefined>((a, b) => !a || b.forecast < a.forecast ? b : a, undefined);
    const overdue = context.purchase_deadline < today;
    const wait = !overdue && context.urgency !== 'HIGH' && best && best.forecast < f.anchor_price * .995;
    const action = overdue ? 'MONITOR' : wait ? 'WAIT' : 'BUY_NOW';
    const basis = { commodity: 'Singapore MGO', currency: 'USD', unit: 'MT' }, q = context.quantity_mt;
    return { source: 'mock', provenance: 'fixture', context,
      reference: { status: 'ready', value: { price: f.anchor_price, observation_date: f.anchor_quote_date, basis } },
      forecast: { status: 'ready', value: { run_id: f.run_id, model_version: 'illustrative-fallback-v1', target_date: f.target_date,
        central_estimate: f.forecast, prices: { lower: f.low, upper: f.high }, basis, range_description: 'Illustrative fallback range; no measured coverage.' } },
      cost_impact: f.target_date > context.purchase_deadline ? { status: 'unavailable', reason: 'unsupported_horizon', message: 'This target is after your deadline.' }
        : { status: 'ready', value: { currency: 'USD', target_date: f.target_date, reference_total: f.anchor_price * q,
          forecast_total: { lower: f.low * q, upper: f.high * q }, difference_total: { lower: (f.low - f.anchor_price) * q, upper: (f.high - f.anchor_price) * q }, central_total: f.forecast * q } },
      recommendation: { status: 'ready', value: { recommendation_id: `fallback-${context.plan_id}-${today}-${context.purchase_deadline}-${context.urgency}-${action}`, action,
        explanation: overdue ? 'Illustrative fallback: your deadline has passed. Update the plan.' : wait
          ? `Illustrative fallback suggests waiting until ${best!.target_date} using the estimated price trend. This is not validated buying advice.`
          : 'Illustrative fallback suggests buying today because no cheaper eligible date fits the deadline or urgency requires buying now.',
        evidence: { policy_version: 'illustrative-fallback-v1', urgency: context.urgency ?? 'NORMAL', direction: wait ? 'DOWN' : 'FLAT',
          interval_width_fraction: null, buy_now_cost_usd: f.anchor_price * q, alternative_cost_usd: wait ? best!.forecast * q : null,
          alternative_minus_now_usd: wait ? (best!.forecast - f.anchor_price) * q : null, reference_age_days: calendarDays(f.anchor_quote_date, today),
          supported_target_date: wait ? best!.target_date : null, horizon_description: 'Illustrative fallback, not Ridge advice',
          reasons: ['The live forecast or recommendation was unavailable, incorrectly dated, or failed.', 'Fallback uses a capped historical trend; a flat/missing trend uses a mock decline.'],
          limitations: ['Illustrative only. Obtain a supplier quote. Synthetic results cannot be submitted as model-backed approvals.'], allocations: [] } } } };
  }
  return { forecasts, recommendations: { read: (c: PlanResultContext, h?: number, r?: string) => read(c, h, r), readImpact: (c: PlanResultContext, h?: number, r?: string) => read(c, h, r, true) } };
}
