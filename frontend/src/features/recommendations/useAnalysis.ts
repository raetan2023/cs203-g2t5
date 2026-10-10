import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanAnalysis, PlanResultContext } from '../purchase-plan/types';
import { sameContext, type RecommendationService } from './service';

/** Independent request state for guidance and cost impact. No result cache. */
export function useAnalysis(service: RecommendationService | undefined, context: PlanResultContext, kind: 'read' | 'readImpact') {
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({}), [service, context.plan_id, context.quantity_mt, context.purchase_deadline, context.scenario_as_of_date, kind, attempt]);
  const [result, setResult] = useState<{ scope: object; analysis?: PlanAnalysis; error?: boolean }>();
  const request = useRef<{ scope: object; promise: Promise<PlanAnalysis> } | null>(null);
  const operation = service?.[kind];
  useEffect(() => {
    if (!operation) return;
    let current = true;
    if (request.current?.scope !== scope) request.current = { scope, promise: operation.call(service, context) };
    request.current.promise.then(analysis => {
      if (!current) return;
      if (!sameContext(analysis.context, context)) throw new Error('Stale result');
      setResult({ scope, analysis });
    }).catch(() => { if (current) setResult({ scope, error: true }); });
    return () => { current = false; };
  }, [scope, operation]);
  const active = result?.scope === scope ? result : undefined;
  return { analysis: active?.analysis, error: active?.error, loading: !!operation && !active, connected: !!operation, retry: () => setAttempt(value => value + 1) };
}
