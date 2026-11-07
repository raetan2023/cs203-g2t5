import type { ReadyForecast } from '../forecast/apiService';

/** Which model produced the published estimate; labels only, never a calculation. */
export function forecastSource(published?: ReadyForecast) {
  const experimental = published?.interval.method === 'experimental_gdelt_scaled_quantiles';
  const executedRidge = experimental && !!published?.model_version.includes('-sha256-');
  // The decision-day model counts from today, and news moves its central price as well as its range.
  const newsAware = !!published?.model_version.startsWith('ridge-decision-gdelt-');
  const label = newsAware ? 'News-aware Ridge regression (executed)' : executedRidge ? 'Ridge regression (executed repository artifact)' : experimental ? 'Last observed quote (persistence)'
    : published?.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression (published)' : published ? 'Published model forecast' : 'Source-supplied estimate';
  const name = newsAware ? 'news-aware Ridge regression' : executedRidge ? 'Ridge regression' : experimental ? 'last observed quote'
    : published?.interval.method === 'gdelt_error_quantiles' ? 'published Ridge regression' : 'published model forecast';
  return { experimental, executedRidge, newsAware, label, name };
}
