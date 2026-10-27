package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Shared published forecasts require a verified Clerk session, like purchase plans. */
@RestController
public class ForecastController {
    private final ForecastService forecasts;
    public ForecastController(ForecastService forecasts) { this.forecasts = forecasts; }
    @GetMapping("/api/v1/forecast")
    public ResponseEntity<ForecastService.Response> get(@RequestParam(defaultValue = "7") int horizon_days) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(forecasts.read(horizon_days));
    }
}
