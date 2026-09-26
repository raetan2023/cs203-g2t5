package com.cs203.mgodataapi;

import java.util.Map;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Liveness, for platforms and teammates checking the service is up. */
@RestController
public class HealthController {

    private final String serviceName;

    public HealthController(@Value("${spring.application.name}") String serviceName) {
        this.serviceName = serviceName;
    }

    @Tag(name = "Operations")
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", serviceName, "version", MgoBackendApplication.VERSION);
    }
}
