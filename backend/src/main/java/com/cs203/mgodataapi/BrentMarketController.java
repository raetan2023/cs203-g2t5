package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/market")
public class BrentMarketController {
    private final BrentMarketService service;

    public BrentMarketController(BrentMarketService service) {
        this.service = service;
    }

    /** Shared market-data API key protection is provided by ApiKeyFilter. */
    @GetMapping("/brent")
    public ResponseEntity<BrentMarketService.Response> latest() {
        return service.latest()
                .map(value -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value))
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build());
    }
}
