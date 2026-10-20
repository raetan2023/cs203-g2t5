package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class BrentMarketServiceTests {
    private final BrentMarketRepository repository = mock(BrentMarketRepository.class);
    private final BrentMarketService service = new BrentMarketService(repository);

    private BrentMarketRepository.Observation row(String date, String value) {
        return new BrentMarketRepository.Observation("BRENT_CRUDE", "FRED", "USD/barrel", "USD",
                LocalDate.parse(date), new BigDecimal(value));
    }

    @Test void readsLatestActualDateAndCalculatesChangeOverPreviousObservation() {
        when(repository.latest()).thenReturn(List.of(row("2026-10-14", "126.55"), row("2026-10-13", "125.78")));
        var value = service.latest().orElseThrow();
        assertEquals(LocalDate.parse("2026-10-14"), value.ticker().observedDate());
        assertEquals(new BigDecimal("126.55"), value.ticker().value());
        assertEquals(new BigDecimal("0.77"), value.ticker().changeAbs());
        assertEquals(new BigDecimal("0.6122"), value.ticker().changePct());
        assertEquals(LocalDate.parse("2026-10-13"), value.history().getFirst().date());
        assertEquals("supabase", value.storage());
    }

    @Test void doesNotInventZeroChangeWhenOnlyOneObservationExists() {
        when(repository.latest()).thenReturn(List.of(row("2026-10-14", "126.55")));
        var ticker = service.latest().orElseThrow().ticker();
        assertNull(ticker.changeAbs());
        assertNull(ticker.changePct());
    }

    @Test void doesNotDivideByZeroPreviousPrice() {
        when(repository.latest()).thenReturn(List.of(row("2026-10-14", "1.00"), row("2026-10-13", "0")));
        assertNull(service.latest().orElseThrow().ticker().changePct());
    }

    @Test void emptyDatabaseHasNoExamplePrice() {
        when(repository.latest()).thenReturn(List.of());
        assertTrue(service.latest().isEmpty());
        assertEquals(204, new BrentMarketController(service).latest().getStatusCode().value());
    }

    @Test void databaseFailureIsUnavailableInsteadOfExternalOrMockFallback() {
        when(repository.latest()).thenThrow(new DataAccessResourceFailureException("private connection detail"));
        var error = assertThrows(ApiException.class, service::latest);
        assertEquals(503, error.status().value());
        assertFalse(error.getMessage().contains("private connection detail"));
    }
}
