package com.cs203.mgodataapi;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
@Configuration
public class TimeConfiguration {
    @Bean @ConditionalOnMissingBean(Clock.class)
    Clock applicationClock(Environment environment, @Value("${mgo.scenario-date:2025-10-24}") LocalDate scenario) {
        ZoneId zone = ZoneId.of("Asia/Singapore");
        boolean historical = Arrays.stream(environment.getActiveProfiles()).anyMatch(p -> p.equals("test") || p.equals("analysis-fixture"));
        return historical ? Clock.fixed(scenario.atStartOfDay(zone).toInstant(), zone) : Clock.system(zone);
    }
}
