package com.cs203.mgodataapi;

import java.time.LocalDate;
import java.util.Map;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Settings the frontend needs before it has any data to show.
 *
 * <p>The scenario date is needed even when a user has no saved plan, so screens can show
 * days remaining while the deadline is being chosen. Every feature reads it from here, so
 * the dashboard and the purchase-plan screens cannot drift apart.
 */
@RestController
@Tag(name = "Operations")
public class ConfigController {

    private final LocalDate scenarioDate;

    public ConfigController(@Value("${mgo.scenario-date}") LocalDate scenarioDate) {
        this.scenarioDate = scenarioDate;
    }

    @GetMapping("/api/v1/config")
    public Map<String, Object> config() {
        return Map.of("scenario_as_of_date", scenarioDate.toString());
    }
}
