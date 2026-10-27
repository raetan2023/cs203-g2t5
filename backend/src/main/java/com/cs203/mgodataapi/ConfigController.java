package com.cs203.mgodataapi;

import java.util.Map;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Settings the frontend needs before it has any data to show.
 *
 * <p>The scenario date is needed even when a user has no saved plan, so screens can show
 * days remaining while the deadline is being chosen. Every feature reads it from here, so
 * plan validation and displayed remaining days agree. Market observations retain their own dates.
 */
@RestController
@Tag(name = "Operations")
@SecurityRequirement(name = "apiKey")
public class ConfigController {

    private final OperationalDate dates;

    public ConfigController(OperationalDate dates) {
        this.dates = dates;
    }

    @GetMapping("/api/v1/config")
    public Map<String, Object> config() {
        // Keep the existing wire key; its value is now the runtime Singapore date.
        return Map.of("scenario_as_of_date", dates.today().toString());
    }
}
