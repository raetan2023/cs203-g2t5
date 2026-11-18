package com.cs203.mgodataapi;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Operational plan date; market observations retain their own dates. */
@Component
public class OperationalDate {
    private static final ZoneId SINGAPORE = ZoneId.of("Asia/Singapore");
    private final Clock clock;

    // Uses the application Clock bean, so the fixed scenario date under the test and
    // analysis-fixture profiles applies to plan dates as well as forecasts.
    @Autowired
    public OperationalDate(Clock clock) { this.clock = clock; }

    public LocalDate today() { return LocalDate.ofInstant(clock.instant(), SINGAPORE); }
}
