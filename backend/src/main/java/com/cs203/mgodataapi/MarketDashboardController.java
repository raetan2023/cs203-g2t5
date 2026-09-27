package com.cs203.mgodataapi;

import com.cs203.mgodataapi.DashboardResponse;
import com.cs203.mgodataapi.MarketDashboardService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * REST Controller exposing the dashboard endpoints under /api/v1/market.
 * Provides the JSON payload consumed by the React frontend.
 */
@RestController
@RequestMapping("/api/v1/market")

public class MarketDashboardController {

    private final MarketDashboardService service;
    private static final LocalDate DEFAULT_SCENARIO = LocalDate.of(2025, 10, 24);

    public MarketDashboardController(MarketDashboardService service) {
        this.service = service;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardResponse> getDashboard(
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate scenarioDate
    ) {
        LocalDate date = scenarioDate != null ? scenarioDate : DEFAULT_SCENARIO;
        DashboardResponse response = service.getDashboard(date);

        if (response.tickers().isEmpty()) {
            return ResponseEntity.noContent().build();  // HTTP 204 No Content
        }
        return ResponseEntity.ok(response);             // HTTP 200 OK
    }
}
