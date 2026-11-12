import { calendarDays } from '../purchase-plan/dates';
import type { CurrentRecommendation, PlanAnalysis, PurchasePlan, SubmittedRecommendation, Urgency } from '../purchase-plan/types';
import type { Column } from './TimingComparison';
import type { Cell, ReportBlock, ReportDocument, Tone } from './reportPdf';
import { actionLabel, amount, change, dayDate, perMt, readableDates, usd } from './format';
import { forecastSource } from './PurchaseImpact';

type ReportColumn = Omit<Column, 'mid'> & { mid?: number; saved?: true };

export interface ReportInput {
  plan: PurchasePlan & { urgency?: Urgency };
  guidance: CurrentRecommendation;
  analysis: PlanAnalysis;
  /** The buying-date comparison the page shows: today plus each forecast horizon. */
  columns: ReportColumn[];
  buyNow?: number;
  /** The buy date's own forecast cost, matching the page. Falls back to the policy's blended signal. */
  waitCost?: number;
  costDetail?: string;
  demo: boolean;
  submitted?: boolean;
  generatedAt?: Date;
}

const TONE: Record<string, Tone> = { BUY_NOW: 'go', WAIT: 'wait', MONITOR: 'watch', SPLIT: 'split' };
const STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', purchased: 'Purchased', closed: 'Closed' };

export const reportReference = (planId: string) => `BB-${planId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
export const reportFilename = (plan: PurchasePlan) => `recommendation-${reportReference(plan.plan_id)}.pdf`;

/** A submission preserves the selected forecast and decision evidence, rather than the full live comparison. */
export function submittedReportInput(plan: PurchasePlan, { horizon_days: horizon, analysis }: SubmittedRecommendation): ReportInput | undefined {
  if (analysis.recommendation.status !== 'ready') return;
  const guidance = analysis.recommendation.value;
  const { quantity_mt, purchase_deadline, scenario_as_of_date, urgency } = analysis.context;
  const reference = analysis.reference.status === 'ready' ? analysis.reference.value : undefined;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const cost = analysis.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const columns: ReportColumn[] = [];
  if (reference) columns.push({ id: 'today', label: 'Today', date: scenario_as_of_date, quote: reference.observation_date,
    low: reference.price, mid: reference.price, high: reference.price, observed: true, late: false, past: false });
  if (forecast) columns.push({ id: horizon, label: `${horizon} days`, date: forecast.target_date, saved: true,
    low: forecast.prices.lower, mid: forecast.central_estimate, high: forecast.prices.upper,
    observed: false, late: forecast.target_date > purchase_deadline, past: forecast.target_date <= scenario_as_of_date });
  const buyNow = guidance.evidence?.buy_now_cost_usd ?? cost?.reference_total ?? (reference && reference.price * quantity_mt);
  const waitCost = forecast?.central_estimate != null && forecast.target_date === guidance.evidence?.supported_target_date
    ? forecast.central_estimate * quantity_mt : undefined;
  return {
    plan: { ...plan, quantity_mt, purchase_deadline, scenario_as_of_date, urgency,
      days_remaining: calendarDays(scenario_as_of_date, purchase_deadline) },
    guidance, analysis, columns, buyNow, waitCost,
    costDetail: cost ? `${horizon}-day forecast${forecast ? ` · ${dayDate(forecast.target_date)}` : ''}` : 'Reference price',
    demo: analysis.source === 'mock' || analysis.provenance === 'fixture',
    submitted: true,
  };
}

const hasEstimate = (column: ReportColumn) => !!(column.forecast || column.saved);

const days = (n: number) => n < 0 ? `${Math.abs(n)} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'Due today' : `${n} day${n === 1 ? '' : 's'} remaining`;
const usdRange = (low: number, high: number) => Math.round(low) === Math.round(high) ? usd(low) : `USD ${amount(low)}–${amount(high)}`;
const signedRange = (low: number, high: number) => {
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${amount(Math.abs(v))}`;
  return Math.round(low) === Math.round(high) ? signed(low) : `${signed(low)} to ${signed(high)}`;
};

function stamp(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' })
    .format(date).replace(',', '');
}

function tagline({ guidance, plan }: ReportInput) {
  const evidence = guidance.evidence, target = evidence?.supported_target_date;
  const quantity = `${amount(plan.quantity_mt)} MT`;
  if (guidance.action === 'BUY_NOW') return `Buy the full ${quantity} today.`;
  if (guidance.action === 'WAIT') return target ? `Hold the ${quantity} purchase and buy on ${dayDate(target, true)}.` : `Hold the ${quantity} purchase for now.`;
  if (guidance.action === 'SPLIT') return `Spread the ${quantity} across the dates in the purchase schedule.`;
  if (guidance.action === 'MONITOR') {
    if (plan.days_remaining < 0) return 'The deadline has passed. Update the plan before deciding.';
    if (evidence?.reference_age_days != null && evidence.reference_age_days > 7) return 'Get a current supplier quote before deciding.';
    return target && target > plan.scenario_as_of_date ? `Keep watching prices and re-check by ${dayDate(target, true)}.` : 'Keep watching prices before committing.';
  }
  return undefined;
}

function metrics({ plan, guidance, analysis, buyNow, waitCost, submitted }: ReportInput): Extract<ReportBlock, { kind: 'metrics' }>['items'] {
  const evidence = guidance.evidence;
  const reference = analysis.reference.status === 'ready' ? analysis.reference.value : undefined;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const items: Extract<ReportBlock, { kind: 'metrics' }>['items'] = [
    { label: 'Quantity', value: `${amount(plan.quantity_mt)} MT`, note: reference?.basis.commodity },
    { label: 'Purchase deadline', value: dayDate(plan.purchase_deadline, true), note: days(plan.days_remaining) },
  ];
  if (buyNow != null) items.push({ label: 'Cost today', value: usd(buyNow), tone: guidance.action === 'BUY_NOW' ? 'go' : undefined,
    note: `USD ${perMt(buyNow / plan.quantity_mt)}/MT${reference ? ` · quote ${dayDate(reference.observation_date)}` : ''}` });
  const target = evidence?.supported_target_date;
  if (guidance.action === 'WAIT' && target && evidence?.alternative_cost_usd != null) {
    const cost = waitCost ?? evidence.alternative_cost_usd;
    const difference = buyNow != null ? cost - buyNow : evidence.alternative_minus_now_usd;
    const note = difference != null ? `About ${change(difference)} than today` : 'Based on the forecast';
    const blended = submitted && waitCost == null && (evidence.signal_inputs?.length ?? 0) > 1;
    items.push({ label: `Est. cost on ${dayDate(target).slice(4)}`, value: usd(cost), tone: 'wait',
      note: blended ? `Blended estimate · ${note}` : note });
  } else if (forecast) {
    items.push({ label: `Forecast · ${dayDate(forecast.target_date)}`, value: usdRange(forecast.prices.lower * plan.quantity_mt, forecast.prices.upper * plan.quantity_mt),
      note: `USD ${perMt(forecast.prices.lower)}–${perMt(forecast.prices.upper)}/MT` });
  }
  return items;
}

/** One row per buying date on the page's comparison, with the recommended date called out. */
function comparisonRows(input: ReportInput): Cell[][] {
  const { columns, plan, guidance } = input;
  const quantity = plan.quantity_mt;
  const used = drivers(input);
  const today = columns.find(c => c.id === 'today');
  const target = guidance.evidence?.supported_target_date;
  const recommendedId = guidance.action === 'BUY_NOW' ? 'today'
    : guidance.action === 'WAIT' && target ? columns.find(c => c.date === target && hasEstimate(c))?.id : undefined;
  return columns.filter(c => !c.past).map(c => {
    const recommended = c.id === recommendedId;
    const tone: Tone | undefined = recommended ? TONE[guidance.action] : undefined;
    const weight = used.length > 1 ? used.find(u => u.date === c.date)?.weight : undefined;
    const option: Cell = { text: c.id === 'today' ? 'Buy today' : `${c.label.replace(' days', '-day')} forecast`, bold: true,
      sub: recommended ? 'Recommended' : c.id === 'today' ? `Latest quote${c.quote ? `, ${dayDate(c.quote)}` : ''}` : c.late ? 'After the deadline; not used' : used.length && hasEstimate(c) && !used.some(u => u.date === c.date) ? 'Not used in the decision'
        : weight != null ? `Used, weighted ${percent(weight)}` : undefined, tone };
    const date = c.date ? dayDate(c.date) : '—';
    if (c.id !== 'today' && !hasEstimate(c)) return [option, date, { text: 'Unavailable', sub: c.message }, '—', '—'];
    const priceCell: Cell = c.low === c.high ? perMt(c.low) : { text: `${perMt(c.low)}–${perMt(c.high)}`, sub: c.mid == null ? undefined : `Estimate ${perMt(c.mid)}` };
    const totalCell: Cell = c.low === c.high ? amount(c.low * quantity) : { text: `${amount(c.low * quantity)}–${amount(c.high * quantity)}`, sub: c.mid == null ? undefined : `Estimate ${amount(c.mid * quantity)}` };
    const versus = c.id === 'today' || !today ? '—' : signedRange((c.low - today.low) * quantity, (c.high - today.low) * quantity);
    return [option, date, priceCell, totalCell, versus];
  });
}

/** Swaps the backend's model terms in the summary for everyday words. */
const plainText = (text: string) => readableDates(text)
  .replace(/\$([\d,]+(?:\.\d+)?)\/mt/gi, 'USD $1 per MT')
  .replace(/weighted uncertainty range/gi, 'model’s rough price range').replace(/point signal/gi, 'model estimate')
  .replace(/(estimated )?(MGO )?price signal/gi, 'model estimate').replace(/eligible forecast signal/gi, 'forecast')
  .replace(/reference price/gi, 'latest market price').replace(/\(([^()]*\d{4})\)/g, 'on $1');

/** One plain sentence on why, under the action; falls back to the backend's wording, simplified. */
function summaryText({ plan, guidance, analysis }: ReportInput) {
  const evidence = guidance.evidence;
  const today = analysis.reference.status === 'ready' ? analysis.reference.value.price : undefined;
  const signal = evidence?.signal_price, low = evidence?.signal_low, high = evidence?.signal_high;
  const age = evidence?.reference_age_days;
  if (guidance.action === 'MONITOR') {
    if (plan.days_remaining < 0) return 'Your purchase deadline has passed, so update the plan and get a current supplier quote.';
    if (today == null) return 'A current market price isn’t available, so refresh prices before choosing when to buy.';
    if (age != null && age > 7) return `The latest market price is ${age} days old, which is too old to time the purchase safely.`;
    if (low != null && high != null && low <= today && today <= high)
      return `Prices could go either way: the model’s rough range (USD ${perMt(low)}–${perMt(high)} per MT) includes today’s price of USD ${perMt(today)}.`;
  }
  if (guidance.action === 'WAIT' && signal != null && today != null)
    return `The model estimates the price will fall to about USD ${perMt(signal)} per MT, around USD ${perMt(today - signal)} per MT less than today’s USD ${perMt(today)}.`;
  if (guidance.action === 'BUY_NOW' && today != null)
    return signal != null ? `The model’s estimate before your deadline is not lower than today (about USD ${perMt(signal)} per MT vs USD ${perMt(today)}), so buying now avoids the risk of prices rising.`
      : 'No forecast falls before your deadline, so buying at today’s price is the safest option.';
  const text = plainText(guidance.explanation);
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, gap: string, c: string) => gap + c.toUpperCase());
}

const percent = (weight: number) => `${Math.round(weight * 100)}%`;

/** The forecasts the backend actually blended (at most two, nearest the deadline), with their weights. */
function drivers({ guidance, columns }: Pick<ReportInput, 'guidance' | 'columns'>) {
  return (guidance.evidence?.signal_inputs ?? []).map(input => {
    const column = columns.find(c => c.id !== 'today' && c.date === input.target_date);
    return { date: input.target_date, weight: input.weight, label: column ? column.label.replace(' days', '-day') : dayDate(input.target_date),
      name: column ? forecastName(column) : `forecast for ${dayDate(input.target_date)}` };
  });
}

const listing = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const forecastName = (c: ReportColumn) => `${c.label.replace(' days', '-day')} forecast (${dayDate(c.date!)})`;

/** "Why this recommendation", written for buyers from the same numbers the backend used. */
export function plainReasons(input: Pick<ReportInput, 'plan' | 'guidance' | 'analysis' | 'columns' | 'submitted'>) {
  const { plan, guidance, analysis, columns, submitted } = input;
  const evidence = guidance.evidence;
  const reference = analysis.reference.status === 'ready' ? analysis.reference.value : undefined;
  const today = reference?.price ?? columns.find(c => c.id === 'today')?.low;
  const reasons: string[] = [];
  const left = plan.days_remaining;
  reasons.push(left < 0 ? `Your deadline (${dayDate(plan.purchase_deadline, true)}) has already passed.`
    : `You have ${left} day${left === 1 ? '' : 's'} until your purchase deadline on ${dayDate(plan.purchase_deadline, true)}.`);
  if (today != null) {
    const age = evidence?.reference_age_days;
    reasons.push(`The latest market price is USD ${perMt(today)} per MT${reference ? `, from ${dayDate(reference.observation_date, true)}` : ''}.`
      + (age != null && age > 7 ? ` That price is ${age} days old, so it may have changed.` : ''));
  }
  const forecasts = columns.filter(c => c.id !== 'today' && hasEstimate(c) && !c.past);
  const late = forecasts.filter(c => c.late);
  const inputs = drivers(input);
  if (inputs.length === 1) {
    const only = inputs[0];
    reasons.push(`The decision is based on the ${only.name}${only.date === plan.purchase_deadline ? ', which lands on your deadline' : ', the only forecast before your deadline'}.`);
  } else if (inputs.length > 1) {
    reasons.push(`The decision combines two forecasts: the ${listing(inputs.map(i => `${i.name} at ${percent(i.weight)} weight`))}. These are the two closest to your deadline, and the closer one counts more.`);
  } else {
    const before = forecasts.filter(c => !c.late);
    if (before.length) reasons.push(`${submitted ? 'Forecast saved at submission' : 'Forecasts available before your deadline'}: ${listing(before.map(forecastName))}.`);
  }
  const unused = inputs.length ? forecasts.filter(c => !c.late && !inputs.some(i => i.date === c.date)) : [];
  const onDeadline = inputs.length === 1 && inputs[0].date === plan.purchase_deadline;
  if (unused.length) reasons.push(`The ${listing(unused.map(forecastName))} ${unused.length === 1 ? 'was' : 'were'} not used, because `
    + (onDeadline ? 'a forecast lands exactly on your deadline, and that forecast is used on its own.' : 'only the two forecasts closest to your deadline count.'));
  if (late.length) reasons.push(`The ${listing(late.map(forecastName))} ${late.length === 1 ? 'falls' : 'fall'} after your deadline, so ${late.length === 1 ? 'it was' : 'they were'} not used.`);
  const signal = evidence?.signal_price, low = evidence?.signal_low, high = evidence?.signal_high;
  if (signal != null && today != null) {
    reasons.push(`The model estimates a price of about USD ${perMt(signal)} per MT`
      + (low != null && high != null ? `, with a rough range of USD ${perMt(low)} to USD ${perMt(high)}.` : '.'));
    const gap = today - signal, saved = evidence?.alternative_minus_now_usd;
    const total = saved != null && Math.sign(saved) === -Math.sign(gap) ? Math.abs(saved) : Math.abs(gap) * plan.quantity_mt;
    reasons.push(gap > 0 ? `That is about USD ${perMt(gap)} per MT below today’s price, or roughly ${usd(total)} less for your ${amount(plan.quantity_mt)} MT, if the estimate holds.`
      : gap < 0 ? `That is about USD ${perMt(-gap)} per MT more than today, so waiting is not expected to save money.`
      : 'That is about the same as today, so waiting is not expected to save money.');
    if (low != null && high != null && low <= today && today <= high && guidance.action === 'MONITOR')
      reasons.push('However, the model’s range includes today’s price, so prices could go either way. That is why we suggest watching prices instead of committing now.');
  } else if (!forecasts.some(c => !c.late) && (!submitted || analysis.cost_impact.status === 'unavailable' && analysis.cost_impact.reason === 'unsupported_horizon')) {
    reasons.push('No price forecast falls before your deadline, so buying at today’s price is the only option we can price.');
  }
  const target = evidence?.supported_target_date;
  if (guidance.action === 'WAIT' && target) reasons.push(`So we suggest waiting and buying on ${dayDate(target, true)}, ${target === plan.purchase_deadline ? 'on' : 'before'} your deadline.`);
  if (guidance.action === 'BUY_NOW') reasons.push('So we suggest buying now at today’s price rather than waiting.');
  return reasons;
}

/** Backend caveats the report already covers in its own bullets below; anything else is shown as written. */
const COVERED_CAVEATS = [/^Forecast savings are estimates/i, /^Reference prices are dated observations/i, /^Only available 7, 14 and 30 day forecasts/i,
  /^The reference observation is \d+ days old/i, /^Weighted uncertainty bounds/i, /^The blend is a timing signal/i,
  /news-aware Ridge central estimate/i, /^No available forecast fits the deadline/i];

/** Plain-language caveats, merged so each point is made once. */
export function plainLimitations({ guidance, analysis }: Pick<ReportInput, 'guidance' | 'analysis'>) {
  const evidence = guidance.evidence;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const backend = evidence?.limitations ?? [];
  const says = (pattern: RegExp) => backend.some(l => pattern.test(l));
  const experimental = !!forecast && (/experimental|not established/i.test(forecast.range_description) || !!forecast.model_version?.startsWith('ridge-decision-gdelt-'));
  const estimateDriven = says(/news-aware Ridge central estimate/i);
  const age = evidence?.reference_age_days;

  const items = [
    experimental ? 'Forecasts are model estimates, not guarantees, and this model is still experimental: it has not yet been shown to beat simply using today’s price.'
      : 'Forecasts are model estimates, not guarantees. Prices can change suddenly, for example after major news.',
    'Prices are market reference prices for the fuel only, not a supplier’s offer, and exclude delivery, fees and taxes. Confirm with your supplier before buying.',
  ];
  const range = [
    ...(says(/^Weighted uncertainty bounds/i) ? ['The price range is a rough guide, not a calibrated range, so prices can fall outside it.'] : []),
    ...(says(/^The blend is a timing signal/i) ? ['The combined estimate guides timing; it is not a forecast for the exact buying date.'] : []),
  ];
  if (range.length) items.push(range.join(' '));
  if (age != null && age > 7) items.push(`The latest market price is ${age} days old${estimateDriven ? ', and the timing advice still relies on it' : ''}. Get a current supplier quote before deciding.`);
  else if (estimateDriven) items.push('Timing follows the model’s central estimate, so a wide price range is a risk to weigh yourself.');
  if (says(/^No available forecast fits the deadline/i)) items.push('No forecast falls before your deadline, so only today’s price could be compared.');
  for (const limitation of backend) if (!COVERED_CAVEATS.some(pattern => pattern.test(limitation))) items.push(readableDates(limitation));
  return items;
}

/** The full method, data sources and system record behind the plain-language sections above. */
function methodBlocks({ guidance, analysis, columns, submitted }: ReportInput): ReportBlock[] {
  const evidence = guidance.evidence;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const reference = analysis.reference.status === 'ready' ? analysis.reference.value : undefined;
  const cost = analysis.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const target = evidence?.supported_target_date ?? forecast?.target_date;
  const forecasts = columns.filter(c => c.id !== 'today' && c.forecast);
  const published = (forecasts.find(c => c.date === target) ?? forecasts.at(-1))?.forecast;
  const source = forecastSource(published?.interval ? published : undefined);
  const newsAware = source.newsAware || !!(submitted && forecast?.model_version?.startsWith('ridge-decision-gdelt-'));
  const label = newsAware ? 'News-aware Ridge regression (executed)' : source.label;
  const notes = forecast?.range_description ?? '';

  const method = [
    'Only forecasts that land on or before your deadline are used.',
    'The two forecasts nearest your deadline are blended, and the closer one counts more. A forecast that lands on the deadline, or the only one before it, is used on its own.',
    'If the blended price is below today’s, the plan waits until that forecast’s date; otherwise it buys today.',
    newsAware ? 'Timing follows the model’s central estimate even when the latest price is dated. Price age and ranges are reported as limitations instead.'
      : 'If the price range overlaps today’s price, or the latest price is more than 7 days old, the advice is to monitor instead.',
    'The plan never waits past your deadline.',
  ];

  const rows: Cell[][] = [];
  if (published?.interval || forecast) rows.push(['Price model', label]);
  const version = published?.model_version ?? forecast?.model_version;
  if (version) {
    const [name, sha] = version.split('-sha256-');
    rows.push(['Model version', { text: name, sub: sha ? `SHA-256 ${sha.slice(0, 12)}…` : undefined }]);
  }
  if (published?.forecast_origin_date) rows.push(['Forecast run', { text: `${published.horizon_days} days from ${dayDate(published.forecast_origin_date, true)}`,
    sub: published.published_at ? `Published ${stamp(new Date(published.published_at))}` : undefined }]);
  else if (submitted && forecast?.run_id) rows.push(['Forecast run', forecast.run_id]);
  if (reference) rows.push(['Market price source', { text: `${reference.basis.commodity} quote, ${dayDate(reference.observation_date, true)}`,
    sub: `${reference.basis.currency} ${perMt(reference.price)} per ${reference.basis.unit}` }]);
  const newsDate = published?.source_dates?.gdelt ?? published?.source_dates?.gdelt_estimated;
  if (newsDate) rows.push(['News data used', { text: `GDELT, ${dayDate(newsDate, true)} (UTC day)`,
    sub: published?.source_dates?.gdelt_estimated || /Estimated GDELT inputs/i.test(notes) ? 'Includes estimated values, not only observed news' : undefined }]);
  if (forecast) {
    rows.push(['Estimate date', dayDate(forecast.target_date, true)]);
    if (forecast.central_estimate != null) rows.push(['Model central estimate', `${forecast.basis.currency} ${perMt(forecast.central_estimate)} per ${forecast.basis.unit}`]);
    rows.push(['Price range', `${forecast.basis.currency} ${perMt(forecast.prices.lower)} to ${perMt(forecast.prices.upper)} per ${forecast.basis.unit}`]);
  }
  if (cost?.forecast_total) rows.push(['Full cost range', `USD ${amount(cost.forecast_total.lower)} to USD ${amount(cost.forecast_total.upper)}`]);
  const tested = /evaluation: (\d+) rows; MAE ([\d.]+) USD\/MT versus persistence ([\d.]+)/i.exec(notes);
  if (tested) rows.push(['Model testing', { text: `Tested on ${tested[1]} past dates`,
    sub: `Average error USD ${perMt(Number(tested[2]))}/MT, against USD ${perMt(Number(tested[3]))}/MT for simply using the last price` }]);
  else if (published?.evidence) rows.push(['Model testing', published.evidence === 'supported' ? 'Shown to beat using the last price' : 'Not yet shown to beat using the last price']);
  if (evidence) rows.push(['Decision rule', { text: evidence.policy_version, sub: evidence.horizon_description ?? undefined }]);

  const record = [...(evidence?.reasons ?? []), ...(evidence?.limitations ?? [])].map(readableDates);
  return [
    { kind: 'section', heading: 'How the recommendation is made' }, { kind: 'list', items: method },
    ...(rows.length ? [{ kind: 'section', heading: 'Data sources and model' } as ReportBlock, { kind: 'table', rows } as ReportBlock] : []),
    ...(record.length ? [{ kind: 'section', heading: 'Calculation record' } as ReportBlock, { kind: 'list', items: record } as ReportBlock] : []),
    ...(notes ? [{ kind: 'paragraph', text: `Technical model notes: ${readableDates(notes)}` } as ReportBlock] : []),
  ];
}

export function buildRecommendationReport(input: ReportInput): ReportDocument {
  const { plan, guidance, analysis, costDetail, demo, submitted } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = guidance.evidence;
  const reference = analysis.reference.status === 'ready' ? analysis.reference.value : undefined;
  const urgency = evidence?.urgency ?? plan.urgency;
  const ref = reportReference(plan.plan_id);
  const status = plan.status ? STATUS[plan.status] ?? plan.status : 'Draft';
  const commodity = reference?.basis.commodity ?? 'MGO';

  const blocks: ReportBlock[] = [];
  if (demo) blocks.push({ kind: 'notice', title: 'Demo data', text: 'This report was produced from synthetic demonstration data. Use it for illustration only, not for a purchasing decision.' });
  blocks.push(
    { kind: 'summary', label: 'Recommended action', action: actionLabel(guidance.action), tone: TONE[guidance.action] ?? 'neutral',
      badge: urgency ? `${urgency.charAt(0)}${urgency.slice(1).toLowerCase()} urgency` : undefined, tagline: tagline(input), text: summaryText(input) },
    { kind: 'metrics', items: metrics(input) },
    { kind: 'section', heading: 'Plan details' },
    { kind: 'table', rows: [
      ['Plan reference', { text: ref, bold: true, sub: plan.plan_id }],
      ...(reference ? [['Latest market price', { text: `${reference.basis.currency} ${perMt(reference.price)} per ${reference.basis.unit}`,
        sub: `Observed ${dayDate(reference.observation_date, true)}${evidence?.reference_age_days != null ? ` (${evidence.reference_age_days} day${evidence.reference_age_days === 1 ? '' : 's'} before the planning date)` : ''}` }] as Cell[]] : []),
      ...(costDetail ? [['Forecast selected', costDetail] as Cell[]] : []),
      ['Data', demo || analysis.source !== 'api' ? 'Demonstration data' : submitted ? 'Market data saved at submission' : 'Live Bunker Buddy market data'],
    ] },
  );

  const rows = comparisonRows(input);
  if (rows.length) blocks.push(
    { kind: 'section', heading: 'Cost comparison' },
    { kind: 'table', columns: [
      { label: 'Buying option', width: 0.25 }, { label: 'Date', width: 0.13 }, { label: 'Price (USD/MT)', width: 0.19, align: 'right' },
      { label: 'Total (USD)', width: 0.22, align: 'right' }, { label: 'vs today (USD)', width: 0.21, align: 'right' },
    ], rows, note: `${submitted ? 'This comparison uses the reference price and selected forecast saved at submission. ' : ''}Total = price × ${amount(plan.quantity_mt)} MT. Estimate = model’s central estimate. + costs more, − costs less than today.` },
  );

  if (evidence && evidence.allocations.length > 1) blocks.push(
    { kind: 'section', heading: 'Purchase schedule' },
    { kind: 'table', columns: [{ label: 'Purchase date', width: 0.5 }, { label: 'Quantity (MT)', width: 0.5, align: 'right' }],
      rows: evidence.allocations.map(a => [dayDate(a.date, true), amount(a.quantity_mt)]) },
  );

  blocks.push({ kind: 'section', heading: 'Why this recommendation' }, { kind: 'list', numbered: true, items: plainReasons(input) },
    { kind: 'section', heading: 'Things to keep in mind' }, { kind: 'list', items: plainLimitations(input) }, ...methodBlocks(input));

  return {
    title: 'Purchase Recommendation',
    subtitle: `${amount(plan.quantity_mt)} MT ${commodity} · due ${dayDate(plan.purchase_deadline, true)}`,
    meta: [['Planning date', dayDate(plan.scenario_as_of_date, true)], ['Reference', ref], ['Plan status', status], ['Generated', stamp(generatedAt)]],
    footer: `Bunker Buddy · Purchase Recommendation · ${ref}`,
    disclaimer: 'Forecasts are model estimates, not guarantees. Use this report alongside current supplier quotes and procurement judgement.',
    createdAt: generatedAt,
    blocks,
  };
}
