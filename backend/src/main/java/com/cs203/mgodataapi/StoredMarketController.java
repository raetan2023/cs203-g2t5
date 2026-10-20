package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StoredMarketController {
    private final StoredMarketService service;
    public StoredMarketController(StoredMarketService service) { this.service = service; }

    @GetMapping("/api/v1/market/stored")
    public ResponseEntity<StoredMarketService.Response> latest() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.latest());
    }
}
