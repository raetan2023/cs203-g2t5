package com.cs203.mgodataapi;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NewsController {
    private final NewsService service;
    public NewsController(NewsService service) { this.service = service; }

    @GetMapping("/api/v1/news/latest")
    public ResponseEntity<NewsService.Response> latest(@RequestParam(defaultValue = "40") int limit) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.latest(limit));
    }
}
