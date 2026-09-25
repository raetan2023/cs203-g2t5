package com.cs203.mgodataapi;

import java.util.Map;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The routes that need no API key: a landing page and a health check. */
@RestController
public class PublicController {

    private final SnapshotStore store;
    private final String serviceName;

    public PublicController(SnapshotStore store, @Value("${spring.application.name}") String serviceName) {
        this.store = store;
        this.serviceName = serviceName;
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
                <title>MGO backend</title><style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;color:#17212b}table{border-collapse:collapse;width:100%%;margin-top:20px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dbe2e8}a{color:#0759b8}</style></head><body>
                <h1>MGO backend</h1><p>Service status: <strong>healthy</strong></p>
                <p>API requests need an <code>X-API-Key</code> header. <a href='/docs'>Open the API documentation</a></p>
                <h2>Historical data available</h2><table><thead><tr><th>Commodity / source</th><th>Records</th><th>From</th><th>To</th></tr></thead><tbody>%s</tbody></table>
                </body></html>""".formatted(rows);
    }

    @Tag(name = "Operations")
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", serviceName, "version", MgoDataApiApplication.VERSION);
    }
}
