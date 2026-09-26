import { useMemo, useState } from 'react';
import { PurchasePlanPage } from '../features/purchase-plan';
import { Icon } from '../features/purchase-plan/components/Primitives';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from '../features/purchase-plan/fixtures';
import { createMockPlanService } from '../features/purchase-plan/mockService';

const examples = {
  empty: 'Empty', saved: 'Saved', loading: 'Slow loading (8 seconds)',
  'load-error': 'Load fails once', 'save-error': 'Create / save fails once',
  'edit-error': 'Edit / save fails once', 'delete-error': 'Delete fails once',
};
type Example = keyof typeof examples;

export function PreviewApp() {
  const [example, setExample] = useState<Example>('empty');
  const [revision, setRevision] = useState(0);
  const [slow, setSlow] = useState(false);
  const service = useMemo(() => createMockPlanService({
    initialPlan: ['saved', 'edit-error', 'delete-error'].includes(example) ? DEMO_PLAN : null,
    delayMs: example === 'loading' ? 8000 : slow ? 3500 : 700,
    failOnce: {
      read: example === 'load-error', create: example === 'save-error',
      update: example === 'edit-error', delete: example === 'delete-error',
    },
  }), [example, revision, slow]);

  return <>
    <header className="preview-header">
      <span className="preview-menu" aria-hidden="true"><Icon name="menu" /></span>
      <span className="preview-logo" aria-hidden="true"><Icon name="anchor" /></span>
      <span className="preview-brand">Bunker Buddy</span>
      <span className="preview-date">Oct 24, 2025</span>
    </header>
    <PurchasePlanPage key={`${example}-${revision}-${slow}`} service={service} scenarioDate={DEMO_SCENARIO_DATE} />
    {import.meta.env.DEV && <details className="preview-tools">
      <summary>Demo controls</summary>
      <div className="preview-tools-body">
        <strong>Local preview · mock data</strong>
        <label htmlFor="preview-state">Starting state</label>
        <select id="preview-state" value={example} onChange={event => setExample(event.target.value as Example)}>
          {Object.entries(examples).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="preview-checkbox"><input type="checkbox" checked={slow} onChange={event => setSlow(event.target.checked)} />Slow requests (3.5 seconds)</label>
        <button onClick={() => setRevision(value => value + 1)}>Reset example</button>
        <p>Changing controls resets the plan. Failures happen once; retry succeeds. Refresh clears mock data.</p>
      </div>
    </details>}
  </>;
}
