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
        if (!"ready".equals(prices.forecast().status()) || !"ready".equals(prices.reference().status()))
            return new Recommendation(context, Result.unavailable("recommendation_unavailable",
                    "Current news-informed prices are unavailable. Your plan remains saved."));
        Forecast f = prices.forecast().value();
        Reference r = prices.reference().value();
        String action, reason;
        if (context.purchase_deadline().isBefore(context.scenario_as_of_date())) {
            action = "Review your overdue purchase plan";
            reason = "The saved purchase deadline has passed.";
        } else if (f.target_date().isAfter(context.purchase_deadline())) {
            action = "Choose a forecast within your purchase deadline";
            reason = "This forecast targets " + f.target_date() + ", after your deadline of "
                    + context.purchase_deadline() + ". It cannot support waiting until that date.";
        } else if (r.observation_date().isBefore(context.scenario_as_of_date().minusDays(7))) {
            action = "Review this estimate against a current supplier quote";
            reason = "The reference price is dated " + r.observation_date()
                    + ". This experimental scenario cannot establish whether buying now or waiting is better.";
        } else if (f.prices().upper().compareTo(r.price()) < 0) {
            action = "Potential lower prices within your purchase window";
            reason = "Both forecast bounds are below the reference price. Waiting may reduce cost, but the interval can miss the actual price.";
        } else if (f.prices().lower().compareTo(r.price()) > 0) {
            action = "Consider purchasing earlier within your deadline";
            reason = "Both forecast bounds are above the reference price. Earlier purchasing may limit exposure to an increase.";
        } else {
            action = "No clear price advantage from waiting";
            reason = "The forecast range includes the reference price, so prices could rise or fall.";
        }
        String explanation = reason + " For " + context.quantity_mt().stripTrailingZeros().toPlainString()
                + " MT, the estimated cost at " + f.target_date() + " is USD "
                + String.format(java.util.Locale.ROOT, "%,.0f", f.prices().lower().multiply(context.quantity_mt())) + " to "
                + String.format(java.util.Locale.ROOT, "%,.0f", f.prices().upper().multiply(context.quantity_mt()))
                + ". This is an experimental comparison against the dated reference quote, not a live supplier offer or a proven purchasing advantage.";
        String identity = context.toString() + ":" + f.run_id() + ":" + f.target_date();
        return new Recommendation(context, Result.ready(new Guidance(
                java.util.UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(), action, explanation)));
    }
    private static Prices unavailable(LocalDate date, String message) {
        return new Prices(date, Result.unavailable("missing_reference", message), Result.unavailable("missing_forecast", message));
    }
}
