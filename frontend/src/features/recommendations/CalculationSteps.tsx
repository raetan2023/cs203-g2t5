import type { RecommendationEvidence } from '../purchase-plan/types';
import type { Column } from './TimingComparison';
import { actionLabel, change, dayDate, perMt } from './format';

const forecastName = (column: Column) => column.label.replace(' days', '-day');
const inWords = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function result(action: string, evidence: RecommendationEvidence, overlaps: boolean) {
  const stale = (evidence.reference_age_days ?? 0) > 7;
  if (action === 'MONITOR') return overlaps && stale ? 'The range overlaps today’s price and the quote is over 7 days old.'
    : stale ? 'The quote is over 7 days old, too old for timing advice.' : 'The range overlaps today’s price, so the direction is uncertain.';
  if (action === 'WAIT') return `The central forecast is below today’s price${evidence.supported_target_date ? `, so buying on ${dayDate(evidence.supported_target_date)} is expected to cost less` : ''}.`;
  return 'The forecast shows no saving over today’s price, so buying today is the better option.';
}

/** The four steps from forecast to action. Reads the policy's own signal; nothing is recalculated beyond the comparison with today. */
export function CalculationSteps({ evidence, action, columns, deadline, quantity }: {
  evidence: RecommendationEvidence; action: string; columns: Column[]; deadline: string; quantity: number;
}) {
  const { signal_price: signal, signal_low: low, signal_high: high, signal_inputs: inputs, buy_now_cost_usd: buyNow } = evidence;
  if (signal == null || low == null || high == null || !inputs?.length || buyNow == null) return null;
  const today = buyNow / quantity;
  const difference = (signal - today) * quantity;
  const eligible = columns.filter(column => column.forecast && !column.late);
  const name = (date: string) => { const column = columns.find(c => c.date === date); return column ? forecastName(column) : dayDate(date); };
  const blend = inputs.length === 1 ? `Uses the ${name(inputs[0].target_date)} forecast on its own.`
    : `Weighted ${inputs.map(input => `${Math.round(input.weight * 100)}% to ${name(input.target_date)}`).join(', ')}, by closeness to deadline.`;
  return <section className="rec-calc" aria-labelledby="rec-calc-title">
    <div className="rec-section-head"><div>
      <h2 id="rec-calc-title">How this was calculated</h2>
      <p>Four steps from forecast to recommendation.</p>
    </div></div>
    <ol className="rec-calc-steps">
      <li><span className="rec-calc-label">1 · Forecasts in time</span>
        <strong>{eligible.length ? inWords(eligible.map(forecastName)) : 'None'}</strong>
        <span>{eligible.length === 0 ? `No forecast lands before your ${dayDate(deadline)} deadline.`
          : `${eligible.length === 1 ? 'It lands' : eligible.length === 2 ? 'Both land' : 'All land'} before your ${dayDate(deadline)} deadline.`}</span></li>
      <li><span className="rec-calc-label">2 · Blended signal</span>
        <strong>USD {perMt(signal)}/MT</strong><span>{blend}</span></li>
      <li><span className="rec-calc-label">3 · Against today</span>
        <strong>{difference < 0 ? 'Signal below today' : 'No expected saving'}</strong>
        <span>Today is USD {perMt(today)}/MT, so the blended signal {difference === 0 ? 'shows no saving' : `comes to about ${change(difference)} in total`}.</span></li>
      <li className="rec-calc-result"><span className="rec-calc-label">4 · Result</span>
        <strong>{actionLabel(action)}</strong><span>{result(action, evidence, low <= today && high >= today)}</span></li>
    </ol>
  </section>;
}
