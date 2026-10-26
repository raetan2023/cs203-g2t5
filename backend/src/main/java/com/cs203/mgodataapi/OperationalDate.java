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

    @Autowired
    public OperationalDate() { this(Clock.systemUTC()); }

    OperationalDate(Clock clock) { this.clock = clock; }

    public LocalDate today() { return LocalDate.ofInstant(clock.instant(), SINGAPORE); }
}
