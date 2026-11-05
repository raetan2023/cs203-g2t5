package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NewsAlertController {
    private final NewsAlertService service;
    public NewsAlertController(NewsAlertService service) { this.service = service; }

    @GetMapping("/api/v1/news/alerts")
    public ResponseEntity<NewsAlertService.Response> alerts() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.alerts());
    }
}
