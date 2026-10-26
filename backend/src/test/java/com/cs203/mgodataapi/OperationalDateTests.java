package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import org.junit.jupiter.api.Test;

class OperationalDateTests {
    @Test void usesSingaporeCalendarDateRegardlessOfClockZone() {
        var before = new OperationalDate(Clock.fixed(Instant.parse("2026-10-26T15:59:59Z"), ZoneOffset.UTC));
        var after = new OperationalDate(Clock.fixed(Instant.parse("2026-10-26T16:00:00Z"), ZoneOffset.UTC));
        assertEquals(LocalDate.of(2026, 10, 26), before.today());
        assertEquals(LocalDate.of(2026, 10, 27), after.today());
        assertEquals("2026-10-27", new ConfigController(after).config().get("scenario_as_of_date"));
    }

    @Test void readsClockEveryTimeRatherThanFreezingAtConstruction() {
        var clock = org.mockito.Mockito.mock(Clock.class);
        org.mockito.Mockito.when(clock.instant()).thenReturn(
                Instant.parse("2026-12-31T15:59:59Z"), Instant.parse("2026-12-31T16:00:00Z"));
        var dates = new OperationalDate(clock);
        assertEquals(LocalDate.of(2026, 12, 31), dates.today());
        assertEquals(LocalDate.of(2027, 1, 1), dates.today());
    }
}
