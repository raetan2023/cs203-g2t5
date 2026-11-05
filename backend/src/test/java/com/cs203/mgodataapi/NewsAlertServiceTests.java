package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import tools.jackson.databind.json.JsonMapper;

class NewsAlertServiceTests {
    final NewsRepository news = mock(NewsRepository.class);
    final BrentMarketRepository market = mock(BrentMarketRepository.class);
    final NewsAlertService service = new NewsAlertService(news, market, JsonMapper.builder().build());
    static final Instant LATEST_END = Instant.parse("2026-11-05T00:17:00Z");

    /** Daily rolling windows, newest first: the first count is the latest window. */
    static List<NewsRepository.WindowCount> daily(int... counts) {
        List<NewsRepository.WindowCount> windows = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) {
            Instant end = LATEST_END.minus(Duration.ofDays(i)).plus(Duration.ofMinutes(i % 3));
            windows.add(new NewsRepository.WindowCount(end.minus(Duration.ofDays(1)), end, counts[i]));
        }
        return windows;
    }

    static String latestPayload(String... categories) {
        List<String> records = new ArrayList<>();
        for (String category : categories) records.add("""
            {"title": "t", "url": "https://example.com/%d", "seen_at": "2026-11-04T10:00:00Z",
             "classification": {"category": "%s", "market_bias": "bullish", "valid": true}}
            """.formatted(records.size(), category));
        return """
            {"status": "complete", "start": "2026-11-04T00:17:00Z", "end": "2026-11-05T00:17:00Z",
             "query": "(oil OR crude) sourcelang:english", "records": [%s]}
            """.formatted(String.join(",", records));
    }

    static List<BrentMarketRepository.Observation> prices(double... newestFirst) {
        List<BrentMarketRepository.Observation> rows = new ArrayList<>();
        for (int i = 0; i < newestFirst.length; i++)
            rows.add(new BrentMarketRepository.Observation("SGP_MGO_OBSERVED", "s", "USD/MT", "USD",
                    LocalDate.of(2026, 11, 4).minusDays(i), BigDecimal.valueOf(newestFirst[i])));
        return rows;
    }

    /** Alternating ±0.5% daily moves, newest first, ending at the given price. */
    static double[] calm(double latest, int count) {
        double[] values = new double[count];
        values[0] = latest;
        for (int i = 1; i < count; i++) values[i] = values[i - 1] * (i % 2 == 0 ? 1.005 : 0.995);
        return values;
    }

    @Test void flagsANewsSpikeAgainstTheMedianOfEarlierWindowsAndNamesItsTopTopics() {
        when(news.recentWindowCounts(NewsAlertService.WINDOWS)).thenReturn(daily(150, 60, 70, 80, 65, 75, 70, 300));
        when(news.latestCompleteWindows(1)).thenReturn(List.of(latestPayload(
            "shipping_disruption", "shipping_disruption", "sanctions", "other", "sanctions", "shipping_disruption", "refinery_outage", "demand_shock")));
        var spike = service.alerts().news();
        assertEquals(NewsAlertService.State.ALERT, spike.state());
        assertEquals(150, spike.articleCount());
        assertEquals(70, spike.baselineCount()); // the median ignores the one 300-headline outlier
        assertEquals(7, spike.baselineWindows());
        assertEquals(LATEST_END, spike.windowEnd());
        assertEquals(List.of(new NewsAlertService.TopicCount("shipping_disruption", 3), new NewsAlertService.TopicCount("sanctions", 2),
            new NewsAlertService.TopicCount("demand_shock", 1)), spike.topTopics());
        assertEquals("(oil OR crude) sourcelang:english", spike.query());
    }

    @Test void ordinaryVolumeAndSmallAbsoluteRisesAreNotSpikes() {
        when(news.recentWindowCounts(anyInt())).thenReturn(daily(90, 60, 70, 80, 65, 75));
        assertEquals(NewsAlertService.State.NORMAL, service.alerts().news().state());
        when(news.recentWindowCounts(anyInt())).thenReturn(daily(18, 6, 6, 6, 6, 6));
        assertEquals(NewsAlertService.State.ALERT, service.alerts().news().state());
        // Two and a half times the usual volume, but only nine extra headlines.
        when(news.recentWindowCounts(anyInt())).thenReturn(daily(15, 6, 6, 6, 6, 6));
        assertEquals(NewsAlertService.State.NORMAL, service.alerts().news().state());
    }

    @Test void needsFiveEarlierWindowsAndIgnoresOverlappingRetries() {
        var windows = new ArrayList<>(daily(200, 60, 70, 80, 65));
        // A retry of the latest day, ten minutes earlier, must not count as its own baseline day.
        windows.add(1, new NewsRepository.WindowCount(LATEST_END.minus(Duration.ofDays(1)).minus(Duration.ofMinutes(10)), LATEST_END.minus(Duration.ofMinutes(10)), 198));
        when(news.recentWindowCounts(anyInt())).thenReturn(windows);
        var spike = service.alerts().news();
        assertEquals(NewsAlertService.State.INSUFFICIENT_DATA, spike.state());
        assertNull(spike.baselineCount());
        assertEquals(4, spike.baselineWindows());
        assertTrue(spike.topTopics().isEmpty());
    }

    @Test void flagsAnMgoMoveFarOutsideRecentDailyMoves() {
        double[] values = calm(1300, 22);
        double[] shocked = new double[23];
        shocked[0] = 1300 * 1.04;
        System.arraycopy(values, 0, shocked, 1, 22);
        when(market.latestObserved("SGP_MGO_OBSERVED")).thenReturn(prices(shocked));
        var move = service.alerts().price();
        assertEquals(NewsAlertService.State.ALERT, move.state());
        assertEquals(LocalDate.of(2026, 11, 4), move.observedDate());
        assertEquals(new BigDecimal("4.00"), move.changePct());
        assertEquals(NewsAlertService.RETURNS, move.returns());
        assertTrue(move.typicalChangePct().doubleValue() > 0.4 && move.typicalChangePct().doubleValue() < 0.6);
    }

    @Test void calmPricesAndTinyMovesAfterFlatPricesAreNormal() {
        when(market.latestObserved(anyString())).thenReturn(prices(calm(1300, 22)));
        assertEquals(NewsAlertService.State.NORMAL, service.alerts().price().state());
        double[] flat = new double[15];
        java.util.Arrays.fill(flat, 1300);
        flat[0] = 1301;
        when(market.latestObserved(anyString())).thenReturn(prices(flat));
        assertEquals(NewsAlertService.State.NORMAL, service.alerts().price().state());
    }

    @Test void shortPriceHistoryIsInsufficientRatherThanCalm() {
        when(market.latestObserved(anyString())).thenReturn(prices(1300, 1250, 1260));
        var move = service.alerts().price();
        assertEquals(NewsAlertService.State.INSUFFICIENT_DATA, move.state());
        assertEquals(new BigDecimal("4.00"), move.changePct());
        assertNull(move.typicalChangePct());
        when(market.latestObserved(anyString())).thenReturn(prices(1300));
        assertNull(service.alerts().price().changePct());
    }

    @Test void emptyStoreHasNoSignalsAndDatabaseFailureIsUnavailable() {
        var empty = service.alerts();
        assertNull(empty.news());
        assertNull(empty.price());
        assertEquals("supabase", empty.storage());
        when(news.recentWindowCounts(anyInt())).thenThrow(new DataAccessResourceFailureException("private"));
        assertEquals(503, assertThrows(ApiException.class, service::alerts).status().value());
    }
}
