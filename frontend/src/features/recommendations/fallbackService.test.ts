import { expect, it, vi } from 'vitest';
import { createPurchaseFallback } from './fallbackService';
import type { ReadyForecast } from '../forecast/apiService';
const context = { plan_id: 'p', quantity_mt: 888, scenario_as_of_date: '2026-11-06', purchase_deadline: '2026-11-26' };
it('fills every failed horizon with current dates and a usable labelled recommendation', async () => {
  const services = createPurchaseFallback({ read: async () => { throw new Error('offline'); } }, undefined, context.scenario_as_of_date);
  const forecasts = await Promise.all([7,14,30].map(h => services.forecasts.read(h as 7|14|30)));
  expect(forecasts.map(f => (f as ReadyForecast).target_date)).toEqual(['2026-11-13','2026-11-20','2026-12-06']);
  expect(new Set(forecasts.map(f => (f as ReadyForecast).run_id)).size).toBe(1);
  expect(forecasts.every(f => (f as ReadyForecast).synthetic)).toBe(true);
  const result = await services.recommendations.read(context,14);
  expect(result.source).toBe('mock');
  expect(result.recommendation.status === 'ready' && result.recommendation.value.action).toBe('WAIT');
  expect(result.cost_impact.status).toBe('ready');
  const urgent = await services.recommendations.read({...context, urgency:'HIGH'},7);
  expect(urgent.recommendation.status === 'ready' && urgent.recommendation.value.action).toBe('BUY_NOW');
});
it('never disguises an authentication failure as mock success', async () => {
  const services = createPurchaseFallback({read:async()=>{throw new Error('Please sign in again');}},undefined,context.scenario_as_of_date);
  await expect(services.forecasts.read(7)).rejects.toThrow('sign in');
});
it('retries the real source on refresh instead of permanently caching a failure',async()=>{
  const source={read:vi.fn(async()=>({status:'unavailable' as const,reason:'failed',message:'failed'}))};
  const services=createPurchaseFallback(source,undefined,context.scenario_as_of_date);
  await services.forecasts.read(7); await services.forecasts.read(7);
  expect(source.read).toHaveBeenCalledTimes(6);
});
it('prioritizes current real forecasts and real recommendation responses', async()=>{
  const seed=createPurchaseFallback({read:async()=>{throw new Error('offline');}},undefined,context.scenario_as_of_date);
  const sample=await seed.forecasts.read(14) as ReadyForecast;
  const body=await seed.recommendations.read(context,14);
  const live={...body,source:'api' as const,provenance:'model' as const};
  const read=vi.fn(async()=>live);
  const services=createPurchaseFallback({read:async h=>({...sample,horizon_days:h,target_date:new Date(Date.parse(context.scenario_as_of_date)+h*86400000).toISOString().slice(0,10),model_version:'real-current-model',synthetic:false})},{read},context.scenario_as_of_date);
  expect((await services.forecasts.read(14) as ReadyForecast).model_version).toBe('real-current-model');
  expect(await services.recommendations.read(context,14)).toBe(live);
  expect(read).toHaveBeenCalledOnce();
});
