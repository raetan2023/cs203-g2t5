package com.cs203.mgodataapi;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
class TimeConfigurationTests {
    @Test void normalModeUsesCurrentSingaporeDateEvenWithHistoricalSetting() {
        var clock = new TimeConfiguration().applicationClock(new MockEnvironment(), LocalDate.parse("2025-10-24"));
        assertEquals(ZoneId.of("Asia/Singapore"), clock.getZone());
        assertTrue(Math.abs(java.time.Duration.between(clock.instant(), Instant.now()).toSeconds()) < 5);
    }
    @Test void historicalDateRequiresExplicitTestOrFixtureProfile() {
        var environment = new MockEnvironment(); environment.setActiveProfiles("analysis-fixture");
        var clock = new TimeConfiguration().applicationClock(environment, LocalDate.parse("2025-10-24"));
        assertEquals(LocalDate.parse("2025-10-24"), LocalDate.now(clock));
    }
}
