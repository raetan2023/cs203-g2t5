package com.cs203.mgodataapi;
import java.time.LocalDate;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;
/** Purchase-plan interpretation of one immutable daily publication. */
public class PublishedForecastAnalysisProvider implements PlanAnalysisProvider {
    private final ForecastService forecasts;
    private final PurchaseForecastService experimental;
    public PublishedForecastAnalysisProvider(ForecastService forecasts) { this(forecasts, null); }
    public PublishedForecastAnalysisProvider(ForecastService forecasts, PurchaseForecastService experimental) {
        this.forecasts = forecasts; this.experimental = experimental;
    }
    public boolean recommendationUsesPrices() { return true; }
    public String provenance() { return "model"; }
    public Prices prices(LocalDate date) { return prices(date, 7); }
    public Prices prices(LocalDate date, int horizon) {
        if (!date.equals(forecasts.today())) return unavailable(date, "The requested date is not the current forecast origin.");
        ForecastService.Response response = experimental == null ? forecasts.read(horizon) : experimental.read(horizon);
        if (!(response instanceof ForecastService.Ready ready)) return unavailable(date,
                ((ForecastService.Unavailable) response).message());
        ForecastService.Value value = ready.data();
        java.time.Instant expectedEnd = PurchaseForecastService.METHOD.equals(value.interval().method()) && experimental != null
                ? experimental.newsDay().plusDays(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant()
                : date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        if (!expectedEnd.equals(value.news_window_end())
                || !expectedEnd.minusSeconds(86400).equals(value.news_window_start()))
            return unavailable(date, "The previous completed UTC day of GDELT news is unavailable.");
        Basis basis = new Basis("Singapore Marine Gas Oil (MGO)", "USD", "MT");
        boolean isExperimental = PurchaseForecastService.METHOD.equals(value.interval().method());
        String description = isExperimental ? value.interval().limitations()
                : "Experimental 80% nominal news-conditioned q10/q90 interval. Historical coverage: "
                + value.interval().empirical_coverage().movePointRight(2).stripTrailingZeros().toPlainString()
                + "% across " + value.interval().evaluation_rows() + " forecasts; not a guarantee. News window: "
                + value.news_window_start() + " to " + value.news_window_end() + ".";
        return new Prices(date, Result.ready(new Reference(value.anchor_price(), value.anchor_quote_date(), basis)),
                Result.ready(new Forecast(new Range(value.low(), value.high()), value.target_date(), basis,
                        description, horizon + " calendar days from " + value.forecast_origin_date(),
                        value.forecast(), ready.run_id(), ready.model_version())));
    }

    public Recommendation recommendation(PlanAnalysisService.Context context) {
        return recommendation(context, prices(context.scenario_as_of_date()));
    }
    public Recommendation recommendation(PlanAnalysisService.Context context, Prices prices) {
        return new Recommendation(context, Result.ready(RecommendationPolicy.evaluate(context, prices)));
    }
    private static Prices unavailable(LocalDate date, String message) {
        return new Prices(date, Result.unavailable("missing_reference", message), Result.unavailable("missing_forecast", message));
    }
}
