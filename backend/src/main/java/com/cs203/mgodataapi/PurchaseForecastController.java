package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Authenticated plan-only endpoint; the dashboard's /forecast remains independent. */
@RestController
public class PurchaseForecastController {
    private final PurchaseForecastService forecasts;
    public PurchaseForecastController(PurchaseForecastService forecasts) { this.forecasts = forecasts; }
    @GetMapping("/api/v1/purchase-plans/forecast")
    public ResponseEntity<ForecastService.Response> read(@RequestParam(defaultValue = "7") int horizon_days) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(forecasts.read(horizon_days));
    }
}
