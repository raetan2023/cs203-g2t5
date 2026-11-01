import { describe, it, expect, beforeEach } from 'vitest';
import { getDecisions, getDecisionFor, recordDecision } from './buyerDecisions';

beforeEach(() => { localStorage.clear(); });

describe('buyer decision log', () => {
  it('records an accept against the recommendation version', () => {
    recordDecision({ planId: 'p1', recommendationId: 'rec-1', runId: 'run-1', action: 'WAIT', decision: 'accept' });
    expect(getDecisionFor('rec-1')).toMatchObject({ decision: 'accept', recommendation_id: 'rec-1', run_id: 'run-1', plan_id: 'p1' });
  });

  it('requires a reason to reject', () => {
    expect(() => recordDecision({ recommendationId: 'rec-1', decision: 'reject', reason: '  ' })).toThrow('reason');
    recordDecision({ recommendationId: 'rec-1', decision: 'reject', reason: 'Too expensive this month' });
    expect(getDecisionFor('rec-1')).toMatchObject({ decision: 'reject', reason: 'Too expensive this month' });
  });

  it('keeps full history and returns the latest decision for a version', () => {
    recordDecision({ recommendationId: 'rec-1', decision: 'ignore' });
    recordDecision({ recommendationId: 'rec-1', decision: 'accept' });
    expect(getDecisions()).toHaveLength(2);
    expect(getDecisionFor('rec-1').decision).toBe('accept');
  });

  it('rejects an unknown decision or a missing recommendation', () => {
    expect(() => recordDecision({ recommendationId: 'rec-1', decision: 'maybe' })).toThrow();
    expect(() => recordDecision({ decision: 'accept' })).toThrow('recommendation');
  });
});
