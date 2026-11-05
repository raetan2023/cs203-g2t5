package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import tools.jackson.databind.json.JsonMapper;

class NewsServiceTests {
    final NewsRepository repository = mock(NewsRepository.class);
    final NewsService service = new NewsService(repository, JsonMapper.builder().build());

    static String record(String title, String url, String seenAt, String category) {
        return """
            {"title": "%s", "url": "%s", "seen_at": "%s", "domain": "www.reuters.com",
             "classification": {"category": "%s", "market_bias": "bullish", "confidence": 0.8, "reason": "r", "valid": true}}
            """.formatted(title, url, seenAt, category);
    }

    static String window(String retrievedAt, String... records) {
        return """
            {"status": "complete", "retrieved_at": "%s", "records": [%s]}
            """.formatted(retrievedAt, String.join(",", records));
    }

    @Test void mergesOverlappingWindowsNewestFirstWithoutDuplicates() {
        when(repository.latestCompleteWindows(NewsService.WINDOWS)).thenReturn(List.of(
            window("2026-11-02T08:00:00Z",
                record("OPEC+ holds December output", "https://example.com/a", "2026-11-02T06:00:00Z", "production_decision"),
                record("Tanker attacked near Hormuz", "https://example.com/b", "2026-11-01T20:00:00Z", "shipping_disruption")),
            window("2026-11-01T08:00:00Z",
                record("Tanker attacked near Hormuz", "https://example.com/b", "2026-11-01T20:00:00Z", "shipping_disruption"),
                record("Refinery fire  in\\nTexas", "https://example.com/c", "2026-11-01T02:00:00Z", "refinery_outage"))));
        var response = service.latest(40);
        assertEquals(List.of("https://example.com/a", "https://example.com/b", "https://example.com/c"),
            response.items().stream().map(NewsService.Item::url).toList());
        var first = response.items().getFirst();
        assertEquals("reuters.com", first.source());
        assertEquals("production_decision", first.topic());
        assertEquals("bullish", first.marketBias());
        assertEquals("Refinery fire in Texas", response.items().get(2).title());
        assertEquals(Instant.parse("2026-11-02T08:00:00Z"), response.updatedAt());
        assertEquals(2, service.latest(2).items().size());
    }

    @Test void dropsUnsafeLinksAndRecordsWithoutHeadlineOrTime() {
        when(repository.latestCompleteWindows(NewsService.WINDOWS)).thenReturn(List.of(window("2026-11-02T08:00:00Z",
            record("Script link", "javascript:alert(1)", "2026-11-02T06:00:00Z", "other"),
            record("", "https://example.com/blank", "2026-11-02T06:00:00Z", "other"),
            record("No time", "https://example.com/time", "yesterday", "other"),
            record("Kept", "https://example.com/kept", "2026-11-02T05:00:00Z", "other")), "not json"));
        assertEquals(List.of("Kept"), service.latest(40).items().stream().map(NewsService.Item::title).toList());
    }

    @Test void emptyStoreIsAnEmptyListNotAnError() {
        when(repository.latestCompleteWindows(NewsService.WINDOWS)).thenReturn(List.of());
        var response = service.latest(40);
        assertTrue(response.items().isEmpty());
        assertNull(response.updatedAt());
    }

    @Test void rejectsOutOfRangeLimitsAndReportsDatabaseFailure() {
        assertEquals(422, assertThrows(ApiException.class, () -> service.latest(0)).status().value());
        assertEquals(422, assertThrows(ApiException.class, () -> service.latest(101)).status().value());
        when(repository.latestCompleteWindows(anyInt())).thenThrow(new DataAccessResourceFailureException("private"));
        assertEquals(503, assertThrows(ApiException.class, () -> service.latest(40)).status().value());
    }
}
