package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PlanAnalysisServiceTests {
    final LocalDate date = LocalDate.parse("2025-10-24");
    final PlanAnalysisService.Context context = new PlanAnalysisService.Context(UUID.randomUUID(), new BigDecimal("100"), date.plusDays(22), date);
    final Basis basis = new Basis("Singapore MGO", "USD", "MT");
    final Reference reference = new Reference(new BigDecimal("700"), date, basis);
    Forecast forecast(String low, String high, Basis b, LocalDate target, String central) {
        return new Forecast(new Range(new BigDecimal(low), new BigDecimal(high)), target, b,
                "Test bounds", null, central == null ? null : new BigDecimal(central));
    }
    Result<PlanAnalysisService.Impact> calculate(Forecast forecast) {
        return PlanAnalysisService.calculate(context, Result.ready(reference), Result.ready(forecast));
    }

    @Test void calculatesSignedDifferencesAndReversedSavingsBounds() {
        var result = calculate(forecast("680", "740", basis, date.plusDays(6), "710"));
        assertEquals("ready", result.status());
        var i = result.value();
        assertEquals(new BigDecimal("70000"), i.reference_total());
        assertEquals(new Range(new BigDecimal("68000"), new BigDecimal("74000")), i.forecast_total());
        assertEquals(new Range(new BigDecimal("-2000"), new BigDecimal("4000")), i.difference_total());
        assertEquals(new Range(new BigDecimal("-4000"), new BigDecimal("2000")), i.savings_total());
        assertEquals(new BigDecimal("71000"), i.central_total());
        assertEquals(date.plusDays(6), i.target_date());
    }

    @Test void retainsFractionalPrecisionAndHandlesZeroPrices() {
        var fractional = new PlanAnalysisService.Context(context.plan_id(), new BigDecimal("0.125"), context.purchase_deadline(), date);
        var i = PlanAnalysisService.calculate(fractional, Result.ready(new Reference(new BigDecimal("0.1"), date, basis)),
                Result.ready(forecast("0", "0.2", basis, date, null))).value();
        assertEquals(new BigDecimal("0.0125"), i.reference_total());
        assertEquals(0, i.forecast_total().lower().signum());
        assertNull(i.central_total());
    }

    @Test void handlesAllHigherAllLowerAndEqualPrices() {
        for (String[] sample : new String[][]{{"710", "740", "1000", "4000"},
                {"680", "690", "-2000", "-1000"}, {"700", "700", "0", "0"}}) {
            var impact = calculate(forecast(sample[0], sample[1], basis, date, null)).value();
            assertEquals(new Range(new BigDecimal(sample[2]), new BigDecimal(sample[3])), impact.difference_total());
        }
    }

    @Test void rejectsIncompatibleBasisAndBadBounds() {
        for (Basis incompatible : new Basis[]{new Basis("Brent", "USD", "MT"), new Basis("Singapore MGO", "EUR", "MT"), new Basis("Singapore MGO", "USD", "bbl")})
            assertEquals("incompatible_basis", calculate(forecast("680", "740", incompatible, date, null)).reason());
        assertEquals("invalid_bounds", calculate(forecast("740", "680", basis, date, null)).reason());
        assertEquals("invalid_bounds", calculate(forecast("-1", "680", basis, date, null)).reason());
        assertEquals("invalid_bounds", calculate(forecast("680", "740", basis, date, "-1")).reason());
    }

    @Test void independentPointMayLieOutsideQuantileBounds() {
        assertEquals("ready", calculate(forecast("680", "740", basis, date, "750")).status());
    }

    @Test void rejectsFutureReferencesAndUnsupportedTargets() {
        assertEquals("unsupported_horizon", calculate(forecast("680", "740", basis, date.minusDays(1), null)).reason());
        // Estimates beyond the saved deadline must not be used for this purchase window.
        assertEquals("unsupported_horizon", calculate(forecast("680", "740", basis, date.plusDays(23), null)).reason());
        assertEquals("unsupported_horizon", PlanAnalysisService.calculate(context,
                Result.ready(new Reference(reference.price(), date.plusDays(1), basis)),
                Result.ready(forecast("680", "740", basis, date, null))).reason());
    }

    @Test void missingInputsAreUnavailableNotZero() {
        assertEquals("missing_forecast", PlanAnalysisService.calculate(context, Result.ready(reference),
                Result.unavailable("missing_forecast", "No forecast")).reason());
        assertEquals("missing_reference", PlanAnalysisService.calculate(context, Result.unavailable("missing_reference", "No reference"),
                Result.ready(forecast("680", "740", basis, date, null))).reason());
    }

    @Test void storedScenarioDoesNotControlReadUrgency() {
        var plan = new PurchasePlan(context.plan_id(), UUID.randomUUID(), context.quantity_mt(), date.plusDays(22), date);
        assertEquals(14L, plan.toResponse(date.plusDays(8)).get("days_remaining"));
        assertEquals(-1L, plan.toResponse(date.plusDays(23)).get("days_remaining"));
        assertEquals(date, plan.scenarioAsOfDate());
    }

    @Test void providerFailuresAndStaleOutputsDoNotBecomeUnavailableOrSyntheticSuccess() {
        PlanAnalysisProvider provider = org.mockito.Mockito.mock(PlanAnalysisProvider.class);
        org.mockito.Mockito.when(provider.provenance()).thenReturn("model");
        org.mockito.Mockito.when(provider.prices(date, 7)).thenThrow(new IllegalStateException("Provider offline"));
        org.mockito.Mockito.when(provider.recommendation(context)).thenReturn(new Recommendation(context,
                Result.unavailable("recommendation_unavailable", "No policy")));
        PlanAnalysisService service = new PlanAnalysisService(provider);
        assertEquals(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ApiException.class, () -> service.read(context, false)).status());
        assertEquals(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ApiException.class, () -> service.read(context, true)).status());
        org.mockito.Mockito.reset(provider);
        org.mockito.Mockito.when(provider.prices(date, 7)).thenReturn(new Prices(date.minusDays(1), Result.ready(reference),
                Result.ready(forecast("680", "740", basis, date, null))));
        assertThrows(ApiException.class, () -> service.read(context, true));
    }

    @Test void invalidProviderBoundsBecomeExplicitUnavailableSections() {
        PlanAnalysisProvider provider = org.mockito.Mockito.mock(PlanAnalysisProvider.class);
        org.mockito.Mockito.when(provider.provenance()).thenReturn("model");
        org.mockito.Mockito.when(provider.prices(date, 7)).thenReturn(new Prices(date, Result.ready(reference),
                Result.ready(forecast("740", "680", basis, date, null))));
        var body = new PlanAnalysisService(provider).read(context, true);
        assertEquals("invalid_bounds", ((Result<?>) body.get("forecast")).reason());
        assertEquals("invalid_bounds", ((Result<?>) body.get("cost_impact")).reason());
    }
    @Test void recommendationIgnoresDisplayedHorizonAndRejectsMixedSnapshots() {
        var provider = org.mockito.Mockito.mock(PlanAnalysisProvider.class);
        org.mockito.Mockito.when(provider.provenance()).thenReturn("model");
        UUID run = UUID.randomUUID();
        for (int h : new int[] {7, 14, 30}) {
            var f = forecast("600", "800", basis, date.plusDays(h), h == 14 ? "650" : "680");
            f = new Forecast(f.prices(), f.target_date(), f.basis(), f.range_description(), h + " days", f.central_estimate(), run, "model-" + h);
            org.mockito.Mockito.when(provider.prices(date, h)).thenReturn(new Prices(date, Result.ready(reference), Result.ready(f)));
        }
        var service = new PlanAnalysisService(provider);
        assertEquals(service.read(context, false, 7, run).get("recommendation"), service.read(context, false, 30, run).get("recommendation"));
        var changed = forecast("600", "800", basis, date.plusDays(14), "650");
        org.mockito.Mockito.when(provider.prices(date, 14)).thenReturn(new Prices(date, Result.ready(reference), Result.ready(
                new Forecast(changed.prices(), changed.target_date(), basis, "Bounds", "14 days", changed.central_estimate(), UUID.randomUUID(), "model-14"))));
        assertEquals(org.springframework.http.HttpStatus.CONFLICT, assertThrows(ApiException.class, () -> service.read(context, false, 7, run)).status());
    }
}
