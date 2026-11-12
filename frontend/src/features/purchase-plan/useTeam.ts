import { useRef } from 'react';
import type { PurchasePlanService, TeamMember } from './types';
import { useManagerRefresh } from './useManagerRefresh';
import type { OfficerOption } from './components/OfficerFilter';

const NONE: TeamMember[] = [];

/** Everyone the officer filters should offer, reloaded every 30 seconds; empty where the service has no team list. */
export function useTeam(service: PurchasePlanService): TeamMember[] {
  const { data } = useManagerRefresh(service, () => service.team ? service.team() : Promise.resolve({ officers: NONE }), 30_000);
  // Keep the last list while the next one loads, so the dropdowns do not empty for a moment.
  const last = useRef(NONE);
  if (data) last.current = data.officers;
  return last.current;
}

/** The whole team, each with how many of the shown items are theirs (0 if none), plus anyone else who has items. */
export function withTeam(team: TeamMember[], fromItems: OfficerOption[]): OfficerOption[] {
  const byId = new Map<string, OfficerOption>(team.map(member => [member.user_id, { id: member.user_id, label: member.label, count: 0 }]));
  for (const option of fromItems) byId.set(option.id, { ...option, label: byId.get(option.id)?.label ?? option.label });
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
