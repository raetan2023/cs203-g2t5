import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { AppLink } from '../../app/router';
import type { PurchasePlan, PurchasePlanService, SubmissionResponse } from '../purchase-plan/types';
import { amount, dayDate, perMt } from '../recommendations/format';
import {
  buildCard, dateTime, expectedFigure, filterCards, FILTERS, pricePerMt, relativeDays, sortCards, stageOf, STAGE_LABEL, usdCompact,
  type DecisionCard, type Filter, type Stage,
} from './model';
import './decision-history.css';

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; cards: DecisionCard[] };

const errorText = (error: unknown, fallback: string) => {
  const e = error as { detail?: string; message?: string } | null;
  return e?.detail || e?.message || fallback;
};

/**
 * Every plan the officer has submitted, newest first: what the advice was, what the manager decided and,
 * once bought, how the purchase compared with buying at submission time. Drafts stay on Purchase plans.
 */
export function DecisionHistory({ planService, today }: { planService: PurchasePlanService; today: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    setLoaded({ state: 'loading' });
    (async () => {
      try {
        const { plans } = await planService.list();
        const submitted = plans.flatMap(plan => { const stage = stageOf(plan); return stage ? [{ plan, stage }] : []; });
        const cards = await Promise.all(submitted.map(({ plan, stage }) => detail(planService, plan, stage)));
        if (active.current) setLoaded({ state: 'ready', cards: sortCards(cards) });
      } catch (error) {
        if (active.current) setLoaded({ state: 'error', message: errorText(error, 'Could not load your decision history.') });
      }
    })();
  }, [planService, attempt]);

  const cards = loaded.state === 'ready' ? loaded.cards : [];
  const shown = useMemo(() => filterCards(cards, filter, query), [cards, filter, query]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, filterCards(cards, f.id, '').length])) as Record<Filter, number>, [cards]);
  const panelId = useId();

  return <main className="dh" aria-busy={loaded.state === 'loading'}>
    <header className="dh-header">
      <AppLink className="dh-back" href="/purchase-plans" aria-label="Back to purchase plans">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Purchase plans
      </AppLink>
      <h1>Decision history</h1>
      <p>Every plan you have sent for approval: what the advice was, what your manager decided and how the purchase turned out.</p>
    </header>


    <div className="dh-controls">
      <FilterTabs filter={filter} counts={counts} onChange={setFilter} panelId={panelId} />
      <div className="dh-search">
        <label htmlFor="dh-search">Find a plan</label>
        <input id="dh-search" type="search" placeholder="Quantity or deadline" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" />
      </div>
    </div>

    {loaded.state === 'error' ? <section className="dh-card dh-card--notice" role="alert">
        <h2>Couldn’t load your decision history</h2><p>{loaded.message}</p>
        <button type="button" className="bb-button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
      </section>
      : loaded.state === 'loading' ? <section className="dh-list" role="status" aria-label="Loading your decisions">
          <span className="dh-visually-hidden">Loading your decisions…</span>
          {[0, 1, 2].map(i => <div key={i} className="dh-card dh-card--skeleton" aria-hidden="true"><div /><div /><div /></div>)}
        </section>
      : cards.length === 0 ? <section className="dh-card dh-card--notice">
          <h2>Nothing submitted yet</h2>
          <p>When you send a plan’s recommendation to a manager, it is tracked here from submission to purchase.</p>
        </section>
      : shown.length === 0 ? <section className="dh-card dh-card--notice" role="status">
          <h2>No plans match</h2>
          <p>{query.trim() ? `Nothing ${filter === 'all' ? '' : `under ${FILTERS.find(f => f.id === filter)!.label.toLowerCase()} `}matches “${query.trim()}”.` : `No plans are ${FILTERS.find(f => f.id === filter)!.label.toLowerCase()} right now.`}</p>
          <button type="button" className="bb-button bb-button--secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Show all plans</button>
        </section>
      : <section className="dh-list" id={panelId} role="tabpanel" aria-label="Decisions">
          {shown.map(card => <Card key={card.plan.plan_id} card={card} today={today} />)}
        </section>}
  </main>;
}

async function detail(service: PurchasePlanService, plan: PurchasePlan, stage: Stage): Promise<DecisionCard> {
  if (!service.readSubmission) return buildCard(plan, stage, null);
  try {
    const response: SubmissionResponse = await service.readSubmission(plan.plan_id);
    return buildCard(plan, stage, response);
  } catch (error) {
    return buildCard(plan, stage, null, errorText(error, 'The submission details could not be loaded.'));
  }
}


function FilterTabs({ filter, counts, onChange, panelId }: { filter: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void; panelId: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = FILTERS.findIndex(f => f.id === filter);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? -index : event.key === 'End' ? FILTERS.length - 1 - index : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + FILTERS.length) % FILTERS.length;
    onChange(FILTERS[next].id); refs.current[next]?.focus();
  };
  return <div className="dh-tabs" role="tablist" aria-label="Filter by status" onKeyDown={onKeyDown}>
    {FILTERS.map((f, i) => <button key={f.id} type="button" role="tab" ref={el => { refs.current[i] = el; }} id={`${panelId}-tab-${f.id}`}
      aria-selected={filter === f.id} aria-controls={panelId} tabIndex={filter === f.id ? 0 : -1} onClick={() => onChange(f.id)}>
      {f.label}{f.id !== 'all' && counts[f.id] > 0 && <span className="dh-tab-count">{counts[f.id]}</span>}
    </button>)}
  </div>;
}

const ICONS: Record<string, JSX.Element> = {
  BUY_NOW: <path d="M5 12l5 5 9-10" />,
  WAIT: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  MONITOR: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  SPLIT: <><path d="M6 4v16" /><path d="M18 4v16" /><path d="M6 12h12" /></>,
};
const ActionIcon = ({ action }: { action: string | null }) => action && ICONS[action]
  ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[action]}</svg>
  : null;

function Card({ card, today }: { card: DecisionCard; today: string }) {
  const { plan, stage, decision, purchase } = card;
  const headingId = `dh-${plan.plan_id}`;
  const href = `/purchase-plans/recommendation?plan_id=${encodeURIComponent(plan.plan_id)}`;
  const pill = stage === 'approved' && decision ? `Approved by ${decision.manager_label}`
    : stage === 'rejected' && decision ? `Rejected by ${decision.manager_label}` : STAGE_LABEL[stage];
  const submitted = plan.submitted_at ? `Submitted ${dateTime(plan.submitted_at)}` : null;
  const buyingToday = card.referenceTotal != null && card.referencePrice != null;
  const forecast = card.forecastPrices != null && card.buyDate != null;
  const expected = card.expectedSaving ? expectedFigure(card.expectedSaving) : null;

  return <article className={`dh-card dh-card--${stage}`} aria-labelledby={headingId}>
    <div className="dh-card-row">
      <div className="dh-card-what">
        <h2 id={headingId} className="dh-action"><ActionIcon action={card.action} />{card.title}</h2>
        <span className="dh-plan">{amount(plan.quantity_mt)} MT · due {dayDate(plan.purchase_deadline, true)}</span>
      </div>

      {stage === 'completed' && purchase ? <div className="dh-card-body">
          <span className="dh-label">Outcome</span>
          <p>Bought {amount(purchase.quantity_mt)} MT at {pricePerMt(purchase.price_usd_per_mt)} on {dayDate(purchase.purchased_on, true)}.
            {card.referencePrice != null && <> At submission, buying today was {pricePerMt(card.referencePrice)}.</>}</p>
          {card.saved != null && <span className={`dh-chip ${card.saved >= 0 ? 'dh-chip--good' : 'dh-chip--bad'}`}>
            {card.saved >= 0 ? `Advice saved ≈ ${usdCompact(card.saved)}` : `Cost ≈ ${usdCompact(-card.saved)} more than buying at submission`}
          </span>}
        </div>
        : <div className="dh-card-body">
          {card.detailError ? <p className="dh-muted">{card.detailError}</p>
            : !buyingToday && !forecast && !expected ? <p className="dh-muted">The submitted recommendation is not available.</p>
            : <dl className="dh-figures">
              {buyingToday && <Figure label="Buying today" value={usdCompact(card.referenceTotal!)} note={`at ${pricePerMt(card.referencePrice!)}`} />}
              {forecast && <Figure label={`Forecast for ${dayDate(card.buyDate!)}`} value={`$${perMt(card.forecastPrices!.lower)}–${perMt(card.forecastPrices!.upper)}/MT`} />}
              {expected && <Figure label={expected.label} value={expected.value} />}
            </dl>}
        </div>}

      <div className="dh-card-status">
        <span className={`dh-pill dh-pill--${stage}`}>{pill}</span>
        {stage === 'completed' && decision ? <span className="dh-meta">{submitted ? `${submitted} · ` : ''}approved by {decision.manager_label}</span>
          : stage === 'withdrawn' && card.withdrawnAt ? <span className="dh-meta">Withdrawn {dateTime(card.withdrawnAt)}</span>
          : submitted && <span className="dh-meta">{submitted}</span>}
        {stage === 'rejected' && decision?.comment && <blockquote className="dh-comment">“{decision.comment}”</blockquote>}
      </div>
    </div>

    {stage === 'approved' && decision && <ol className="dh-progress" aria-label="Progress">
      <Step done label="Submitted" detail={plan.submitted_at ? dayDate(plan.submitted_at.slice(0, 10)) : '—'} />
      <Step done label="Approved" detail={`${dayDate(decision.decided_at.slice(0, 10))} · ${decision.manager_label}`} />
      {card.buyDate
        ? <Step label="Buy date" detail={`${dayDate(card.buyDate)} · ${relativeDays(today, card.buyDate)}`} />
        : <Step label="Buy by" detail={`${dayDate(plan.purchase_deadline)} · ${relativeDays(today, plan.purchase_deadline)}`} />}
      <Step label="Outcome" detail="Measured once you record the purchase" />
    </ol>}

    <footer className="dh-card-foot">
      <AppLink href={href}>{stage === 'completed' ? 'View purchase record' : 'View recommendation'}</AppLink>
      {stage === 'rejected' && <span className="dh-muted">You can copy this plan into a new draft from the recommendation page</span>}
    </footer>
  </article>;
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="dh-figure">
    <dt>{label}</dt>
    <dd>{value}{note && <span className="dh-figure-note">{note}</span>}</dd>
  </div>;
}

function Step({ label, detail, done = false }: { label: string; detail: string; done?: boolean }) {
  return <li className={done ? 'dh-step dh-step--done' : 'dh-step'}>
    <div className="dh-step-bar" aria-hidden="true" />
    <span className="dh-step-label">{label}</span>
    <span className="dh-step-detail">{detail}</span>
  </li>;
}
