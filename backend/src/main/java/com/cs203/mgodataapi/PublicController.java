package com.cs203.mgodataapi;

import java.util.Map;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

@RestController
public class PublicController {

    private final SnapshotStore store;
    private final String apiKey;

    public PublicController(SnapshotStore store, @Value("${mgo.api-key}") String apiKey) {
        this.store = store;
        this.apiKey = HtmlUtils.htmlEscape(apiKey);
    }

    @Hidden
    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public String home() {
        StringBuilder rows = new StringBuilder();
        for (Source source : Source.ALL.values()) {
            Map<String, Object> status = store.availability(source.id());
            rows.append("<tr><td>").append(source.name())
                    .append("</td><td>").append(String.format("%,d", (int) status.get("records")))
                    .append("</td><td>").append(status.get("start") == null ? "Not bundled" : status.get("start"))
                    .append("</td><td>").append(status.get("end") == null ? "—" : status.get("end"))
                    .append("</td></tr>");
        }
        return """
                <!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>
                <title>MGO Data API</title><style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;color:#17212b}code{background:#eef2f5;padding:3px 6px;border-radius:4px}table{border-collapse:collapse;width:100%%;margin-top:20px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dbe2e8}a{color:#0759b8}</style></head><body>
                <h1>MGO Data API</h1><p>Service status: <strong>healthy</strong></p><p>Your API key: <code>%1$s</code></p>
                <p>Use it as <code>X-API-Key: %1$s</code>. <a href='/docs'>Open API docs</a></p>
                <h2>Bundled data availability</h2><table><thead><tr><th>Commodity / source</th><th>Records</th><th>From</th><th>To</th></tr></thead><tbody>%2$s</tbody></table>
                </body></html>""".formatted(apiKey, rows);
    }

    @Tag(name = "Operations")
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "mgo-data-api", "version", MgoDataApiApplication.VERSION);
    }

    @Hidden
    @GetMapping("/favicon.ico")
    public ResponseEntity<Void> favicon() {
        return ResponseEntity.noContent().build();
    }
}
