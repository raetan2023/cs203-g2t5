package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

@Configuration
public class PlanAnalysisConfiguration {
    @Bean
    @Profile("analysis-fixture")
    @ConditionalOnProperty(name = "mgo.analysis.fixture-enabled", havingValue = "true")
    PlanAnalysisProvider fixtureAnalysisProvider() {
        return new PlanAnalysisProvider() {
            public String provenance() { return "fixture"; }
            public Prices prices(LocalDate date) {
                if (!date.equals(LocalDate.parse("2025-10-24"))) return unavailablePrices(date);
                Basis basis = new Basis("Synthetic Singapore MGO fixture", "USD", "MT");
                return new Prices(date, Result.ready(new Reference(new BigDecimal("700"), date, basis)),
                        Result.ready(new Forecast(new Range(new BigDecimal("680"), new BigDecimal("740")),
                                LocalDate.parse("2025-10-30"), basis, "Synthetic test bounds; not a confidence interval.",
                                "Fixed development fixture for 30 October 2025.", new BigDecimal("710"))));
            }
            public Recommendation recommendation(PlanAnalysisService.Context context) {
                return new Recommendation(context, noGuidance());
            }
        };
    }

    @Bean
    @ConditionalOnMissingBean(PlanAnalysisProvider.class)
    PlanAnalysisProvider unavailableAnalysisProvider(org.springframework.beans.factory.ObjectProvider<ForecastService> services, org.springframework.core.env.Environment environment,
            org.springframework.beans.factory.ObjectProvider<PurchaseForecastService> purchaseForecasts) {
        ForecastService forecasts = services.getIfAvailable();
        if (forecasts != null && !java.util.Arrays.asList(environment.getActiveProfiles()).contains("test"))
            return new PublishedForecastAnalysisProvider(forecasts, purchaseForecasts.getIfAvailable());
        return new PlanAnalysisProvider() {
            public String provenance() { return "unavailable"; }
            public Prices prices(LocalDate date) { return unavailablePrices(date); }
            public Recommendation recommendation(PlanAnalysisService.Context context) {
                return new Recommendation(context, noGuidance());
            }
        };
    }

    private static Result<Guidance> noGuidance() {
        return Result.unavailable("recommendation_unavailable", "No approved recommendation provider or policy is connected.");
    }
    private static Prices unavailablePrices(LocalDate date) {
        return new Prices(date, Result.unavailable("missing_reference", "No normalized reference price is available."),
                Result.unavailable("missing_forecast", "No forecast provider is connected for this scenario."));
    }
}
