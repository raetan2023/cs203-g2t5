package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class StoredMarketServiceTests {
    final BrentMarketRepository repository = mock(BrentMarketRepository.class);
    final StoredMarketService service = new StoredMarketService(repository, "BRENT_CRUDE");

    BrentMarketRepository.Observation row(String key, String unit, String date, String value) {
        return new BrentMarketRepository.Observation(key, "Provider", unit, null, LocalDate.parse(date), new BigDecimal(value));
    }

    @Test void emptyDatabaseReportsMissingInsteadOfMockPrices() {
        when(repository.latestImported()).thenReturn(List.of());
        var response = service.latest();
        assertTrue(response.series().isEmpty());
        assertTrue(response.missing().contains("Singapore MGO"));
        assertTrue(response.missing().contains("Monthly bunker sales"));
    }

    @Test void seriesRetainOwnDatesUnitsAndNoDerivedGasoilIsInvented() {
        when(repository.latestImported()).thenReturn(List.of(
            row("BRENT_CRUDE", "USD/barrel", "2026-10-14", "126.55"),
            row("MPA_BUNKER_SALES_MARINE_GAS_OIL", "thousand tonnes", "2026-08-01", "0"),
            row("SGP_MGO_OBSERVED", "USD/MT", "2026-10-18", "1254")));
        var response = service.latest();
        assertEquals(3, response.series().size());
        assertTrue(response.missing().contains("Singapore gasoil futures"));
        var sales = response.series().stream().filter(s -> s.category().equals("sales")).findFirst().orElseThrow();
        assertEquals(0, sales.ticker().value().signum());
        assertEquals(LocalDate.parse("2026-08-01"), sales.ticker().observedDate());
        assertEquals("thousand tonnes", sales.ticker().unit());
    }

    @Test void unknownFuturesUnitsAndNegativeNewsToneArePreserved() {
        when(repository.latestImported()).thenReturn(List.of(
            row("GDELT_AVERAGE_TONE", "tone", "2026-10-20", "-1.1651"),
            row("SGP_GASOIL_FUT", "source-defined", "2026-10-16", "171.08")));
        var response = service.latest();
        assertEquals("news", response.series().getFirst().category());
        assertEquals(new BigDecimal("-1.1651"), response.series().getFirst().ticker().value());
        assertNull(response.series().get(1).ticker().currency());
        assertEquals("source-defined", response.series().get(1).ticker().unit());
    }

    @Test void databaseErrorDoesNotBecomeSuccessfulExternalFallback() {
        when(repository.latestImported()).thenThrow(new DataAccessResourceFailureException("private"));
        assertEquals(503, assertThrows(ApiException.class, service::latest).status().value());
    }
}
