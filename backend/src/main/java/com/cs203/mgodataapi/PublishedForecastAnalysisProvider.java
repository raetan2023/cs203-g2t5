package com.cs203.mgodataapi;
import java.time.LocalDate;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;
/** Uses the same immutable publication as the forecast widget. */
public class PublishedForecastAnalysisProvider implements PlanAnalysisProvider {
    private final ForecastService forecasts;
    public PublishedForecastAnalysisProvider(ForecastService forecasts) { this.forecasts = forecasts; }
    public String provenance() { return "model"; }
    public Prices prices(LocalDate date) { return prices(date, 7); }
    public Prices prices(LocalDate date, int horizon) {
        if (!date.equals(forecasts.today())) return unavailable(date, "The requested date is not the current forecast origin.");
        ForecastService.Response response = forecasts.read(horizon);
        if (!(response instanceof ForecastService.Ready ready)) return unavailable(date,
                ((ForecastService.Unavailable) response).message());
        ForecastService.Value value = ready.data();
        Basis basis = new Basis("Singapore Marine Gas Oil (MGO)", "USD", "MT");
        return new Prices(date, Result.ready(new Reference(value.anchor_price(), value.anchor_quote_date(), basis)),
                Result.ready(new Forecast(new Range(value.low(), value.high()), value.target_date(), basis,
                        "Experimental 80% nominal news-conditioned q10/q90 interval; empirical coverage is not guaranteed.",
                        horizon + " calendar days from " + value.forecast_origin_date(), value.forecast(), ready.run_id(), ready.model_version())));
    }
    public Recommendation recommendation(PlanAnalysisService.Context context) {
        return new Recommendation(context, Result.unavailable("recommendation_unavailable", "No approved recommendation provider or policy is connected."));
    }
    private static Prices unavailable(LocalDate date, String message) {
        return new Prices(date, Result.unavailable("missing_reference", message), Result.unavailable("missing_forecast", message));
    }
}
