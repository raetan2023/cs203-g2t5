import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ManagerDecisionForm } from '../features/recommendations/ManagerDecisionForm';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import { PlanError, type DecisionInput, type PlanAnalysis, type PurchasePlan } from '../features/purchase-plan/types';
import '../app/app.css';
import './manager-review-preview.css';

const plan: PurchasePlan = { plan_id: '3f9a2c1d-0000-4000-8000-000000000001', quantity_mt: 99,
  purchase_deadline: '2026-11-03', scenario_as_of_date: '2026-11-02', days_remaining: 1, status: 'submitted', submitted_at: '2026-11-02T08:00:00Z' };
const basis = { commodity: 'Singapore MGO', currency: 'USD', unit: 'MT' };
const analysis: PlanAnalysis = { source: 'mock', provenance: 'fixture', approval_fingerprint: 'a'.repeat(64),
  context: { ...plan }, reference: { status: 'ready', value: { price: 1351.5, observation_date: '2026-10-26', basis } },
  forecast: { status: 'ready', value: { prices: { lower: 1319.5, upper: 1410.5 }, target_date: '2026-11-03', basis, range_description: 'Synthetic preview range' } },
  cost_impact: { status: 'ready', value: { currency: 'USD', reference_total: 133798.5, forecast_total: { lower: 130630.5, upper: 139639.5 }, difference_total: { lower: -3168, upper: 5841 }, central_total: 133798.5 } },
  recommendation: { status: 'ready', value: { recommendation_id: 'synthetic-design-b', action: 'BUY_NOW', explanation: 'Synthetic recommendation for the UI preview.' } } };

function ManagerReviewPreview() {
  const [mode, setMode] = useState('normal');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const service = useMemo(() => ({ ...createMockPlanService({ initialPlan: plan, delayMs: 0 }),
    async decide(_id: string, input: DecisionInput) {
      await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 6000 : 800));
      if (mode === 'error') throw new PlanError('Nothing was changed. Check your connection and try again.', {}, 503);
      if (mode === 'conflict') throw new PlanError('Another manager has already decided this request.', {}, 409);
      return { plan: { ...plan, status: input.decision } };
    },
    async readSubmission() { return { submission: null, decision: mode === 'conflict' ? {
      decision_id: 'synthetic-decision', decision: 'approved' as const, comment: 'Within budget. Proceed with the supplier.', manager_clerk_user_id: 'user_preview_manager', manager_label: 'Another manager (preview)', decided_at: '2026-11-02T08:30:00Z',
    } : null }; },
  }), [mode, revision]);
  return <div className="bb-app mr-preview">
    <header className="mr-preview-controls"><p>DESIGN B · SYNTHETIC PREVIEW</p><h1>Manager review</h1><p>These examples do not change team plans or send notifications.</p>
      <label htmlFor="mr-mode">Example state</label><select id="mr-mode" value={mode} onChange={event => { setMode(event.target.value); setRevision(value => value + 1); setNotice(''); }}>
        <option value="normal">Normal decision</option><option value="slow">Slow submission</option><option value="conflict">Already decided by another manager</option><option value="error">Couldn’t save</option>
      </select><button className="bb-button" onClick={() => { setRevision(value => value + 1); setNotice(''); }}>Reopen review</button>
      <p>Close the review to choose another example, or use Reopen review. To see validation, press Reject with an empty comment.</p>
      {notice && <p role="status">{notice}</p>}
    </header>
    <ManagerDecisionForm key={`${mode}:${revision}`} defaultOpen planId={plan.plan_id} fingerprint={'a'.repeat(64)} service={service} plan={plan} analysis={analysis}
      buyerLabel="alex.ng@bunkerco.example" today="2026-11-02" onDecided={() => setNotice('Preview decision saved. Shared data was not changed.')} onRefresh={() => setNotice('Preview refreshed. Another manager’s decision remains final.')} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<ManagerReviewPreview />);
