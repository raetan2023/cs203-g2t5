import { expect, it } from 'vitest';
import type { CurrentRecommendation, PlanAnalysis, PurchasePlan, RecommendationEvidence } from '../purchase-plan/types';
import type { Column } from './TimingComparison';
import { buildRecommendationReport, reportFilename } from './recommendationReport';
import type { ReportBlock } from './reportPdf';

const plan: PurchasePlan = { plan_id: '3f1c9a2e-77b1-4c1e-9d53-1a2b3c4d5e6f', status: 'draft', quantity_mt: 888,
  purchase_deadline: '2026-12-10', scenario_as_of_date: '2026-11-06', days_remaining: 34 };
const forecastColumn = (id: 7 | 14 | 30, date: string, low: number, mid: number, high: number, late = false): Column => ({
  id, label: `${id} days`, date, low, mid, high, observed: false, late, past: false,
  forecast: { forecast: mid, low, high, target_date: date } as Column['forecast'] });
const columns: Column[] = [
  { id: 'today', label: 'Today', date: '2026-11-06', low: 690, mid: 690, high: 690, quote: '2026-11-05', observed: true, late: false, past: false },
  forecastColumn(7, '2026-11-13', 671.4, 677.1, 683.9),
  forecastColumn(14, '2026-11-20', 662.2, 680.5, 699.8),
  forecastColumn(30, '2026-12-06', 640, 671, 712.3),
];
const evidence: RecommendationEvidence = {
  policy_version: 'v3', urgency: 'NORMAL', direction: 'DOWN', interval_width_fraction: 0.06, buy_now_cost_usd: 612720,
  alternative_cost_usd: 596500, alternative_minus_now_usd: -16220, reference_age_days: 1, supported_target_date: '2026-12-06',
  horizon_description: null, reasons: [], allocations: [],
  limitations: [
    'Forecast savings are estimates, not guaranteed. Obtain a current supplier quote before buying.',
    'The blend is a timing signal, not a forecast for the recommended date or a split purchase schedule.',
    'Weighted uncertainty bounds are a descriptive signal, not a calibrated confidence interval.',
    'A caveat the report has no rewording for.',
  ],
  signal_price: 671.7, signal_low: 641.6, signal_high: 711.4,
  signal_inputs: [{ target_date: '2026-12-06', weight: 0.8, price: 671 }, { target_date: '2026-11-20', weight: 0.2, price: 680.5 }],
};
const guidance: CurrentRecommendation = { recommendation_id: 'rec-1', action: 'WAIT', explanation: 'Buy in 30 days.', evidence };
const analysis = { source: 'api', provenance: 'model',
  reference: { status: 'ready', value: { price: 690, observation_date: '2026-11-05', basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' } } },
  forecast: { status: 'unavailable' }, cost_impact: { status: 'unavailable' }, recommendation: { status: 'ready', value: guidance },
} as unknown as PlanAnalysis;

const report = buildRecommendationReport({ plan, guidance, analysis, columns, buyNow: 612720, demo: false });
const list = (heading: string) => {
  const at = report.blocks.findIndex(b => b.kind === 'section' && b.heading === heading);
  return (report.blocks[at + 1] as Extract<ReportBlock, { kind: 'list' }>).items;
};
const text = JSON.stringify(report);

it('names the forecasts that actually drove the decision, with their weights, and the ones left out', () => {
  const reasons = list('Why this recommendation');
  expect(reasons).toContain('The decision combines two forecasts: the 30-day forecast (Sun 06 Dec) at 80% weight and 14-day forecast (Fri 20 Nov) at 20% weight. These are the two closest to your deadline, and the closer one counts more.');
  expect(reasons).toContain('The 7-day forecast (Fri 13 Nov) was not used, because only the two forecasts closest to your deadline count.');
  expect(reasons).toContain('So we suggest waiting and buying on Sun 06 Dec 2026, before your deadline.');
  const table = report.blocks.find(b => b.kind === 'table' && b.columns) as Extract<ReportBlock, { kind: 'table' }>;
  expect(JSON.stringify(table.rows[1][0])).toContain('Not used in the decision');
  expect(JSON.stringify(table.rows[2][0])).toContain('Used, weighted 20%');
  expect(JSON.stringify(table.rows[3][0])).toContain('"Recommended"');
});

it('describes the central figure as a model estimate, not the most likely price', () => {
  expect(text).not.toMatch(/most likely/i);
  expect(list('Why this recommendation')).toContain('The model estimates a price of about USD 671.70 per MT, with a rough range of USD 641.60 to USD 711.40.');
});

it('merges run-specific caveats into plain bullets without repeating the generic ones', () => {
  const caveats = list('Things to keep in mind');
  expect(caveats).toContain('The price range is a rough guide, not a calibrated range, so prices can fall outside it. The combined estimate guides timing; it is not a forecast for the exact buying date.');
  expect(caveats).toContain('A caveat the report has no rewording for.');
  expect(caveats.join(' ')).not.toContain('Obtain a current supplier quote');
  expect(caveats).toHaveLength(4);
});

it('names the file after the plan reference', () => {
  expect(reportFilename(plan)).toBe('recommendation-BB-3F1C9A2E.pdf');
});

it('shows the Wait cost card with the saving against today', () => {
  const metrics = report.blocks.find(b => b.kind === 'metrics') as Extract<ReportBlock, { kind: 'metrics' }>;
  expect(metrics.items[3]).toMatchObject({ label: 'Est. cost on 06 Dec', value: 'USD 596,500', note: 'About USD 16,220 less than today' });
});

it('uses the buy date’s own forecast cost when the page supplies it, so the report and hero agree', () => {
  const agreed = buildRecommendationReport({ plan, guidance, analysis, columns, buyNow: 612720, waitCost: 595848, demo: false });
  const metrics = agreed.blocks.find(b => b.kind === 'metrics') as Extract<ReportBlock, { kind: 'metrics' }>;
  expect(metrics.items[3]).toMatchObject({ value: 'USD 595,848', note: 'About USD 16,872 less than today' });
});

it('explains that a forecast on the deadline is used on its own', () => {
  const onDeadline = buildRecommendationReport({ plan: { ...plan, purchase_deadline: '2026-11-20', days_remaining: 14 }, analysis, buyNow: 612720, demo: false,
    columns: columns.map(c => c.id === 30 ? { ...c, late: true } : c),
    guidance: { ...guidance, evidence: { ...evidence, supported_target_date: '2026-11-20', signal_inputs: [{ target_date: '2026-11-20', weight: 1, price: 680.5 }] } } });
  const at = onDeadline.blocks.findIndex(b => b.kind === 'section' && b.heading === 'Why this recommendation');
  const reasons = (onDeadline.blocks[at + 1] as Extract<ReportBlock, { kind: 'list' }>).items;
  expect(reasons).toContain('The decision is based on the 14-day forecast (Fri 20 Nov), which lands on your deadline.');
  expect(reasons).toContain('The 7-day forecast (Fri 13 Nov) was not used, because a forecast lands exactly on your deadline, and that forecast is used on its own.');
  expect(reasons.join(' ')).not.toContain('two forecasts closest');
  expect(reasons).toContain('So we suggest waiting and buying on Fri 20 Nov 2026, on your deadline.');
});

it('says a stale price once, tied to the timing caveat', () => {
  const stale = buildRecommendationReport({ plan, columns, buyNow: 612720, demo: false,
    analysis: { ...analysis, reference: { status: 'ready', value: { price: 690, observation_date: '2026-10-26', basis: { commodity: 'Singapore Marine Gas Oil (MGO)', currency: 'USD', unit: 'MT' } } } } as PlanAnalysis,
    guidance: { ...guidance, evidence: { ...evidence, reference_age_days: 11, limitations: [...evidence.limitations,
      'Timing uses the news-aware Ridge central estimate, including when the reference is dated. Wide ranges and quote age remain limitations, not automatic Monitor overrides.',
      'The reference observation is 11 days old. Check a current supplier quote.'] } } });
  const at = stale.blocks.findIndex(b => b.kind === 'section' && b.heading === 'Things to keep in mind');
  const caveats = (stale.blocks[at + 1] as Extract<ReportBlock, { kind: 'list' }>).items;
  expect(caveats.filter(c => c.includes('11 days old'))).toEqual(['The latest market price is 11 days old, and the timing advice still relies on it. Get a current supplier quote before deciding.']);
});

it('adds the full method, data sources and the system’s calculation record', () => {
  const withNotes = buildRecommendationReport({ plan, guidance: { ...guidance, evidence: { ...evidence, reasons: ['34 calendar days remain until the saved deadline 2026-12-10.'] } }, columns, buyNow: 612720, demo: false,
    analysis: { ...analysis, forecast: { status: 'ready', value: { target_date: '2026-12-06', central_estimate: 671, prices: { lower: 640, upper: 712.3 }, model_version: 'ridge-decision-gdelt-v1-sha256-f9e80931764b2c1d',
      basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' }, range_description: 'Chronological central-price evaluation: 7 rows; MAE 173.514 USD/MT versus persistence 42.142 USD/MT.' } } } as unknown as PlanAnalysis });
  const headings = withNotes.blocks.filter(b => b.kind === 'section').map(b => (b as { heading: string }).heading);
  expect(headings.slice(-3)).toEqual(['How the recommendation is made', 'Data sources and model', 'Calculation record']);
  const all = JSON.stringify(withNotes);
  expect(all).toContain('SHA-256 f9e80931764b…');
  expect(all).toContain('Average error USD 173.51/MT, against USD 42.14/MT for simply using the last price');
  expect(all).toContain('34 calendar days remain until the saved deadline 10 Dec 2026.');
  expect(all).toContain('Technical model notes: Chronological central-price evaluation');
});
