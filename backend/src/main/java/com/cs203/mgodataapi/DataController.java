package com.cs203.mgodataapi;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Validated
@Tag(name = "Data")
public class DataController {

    private static final List<String> CSV_FIELDS = List.of("date", "value", "series", "source", "unit");

    private final SnapshotStore store;

    public DataController(SnapshotStore store) {
        this.store = store;
    }

    @GetMapping("/sources")
    public Map<String, Object> listSources() {
        List<Map<String, Object>> sources = Source.ALL.values().stream().map(source -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", source.id());
            item.put("name", source.name());
            item.put("provider", source.provider());
            item.put("unit", source.unit());
            item.putAll(store.availability(source.id()));
            return item;
        }).toList();
        return Map.of("sources", sources);
    }

    @GetMapping("/data/{sourceId}")
    public ResponseEntity<?> getData(
            @PathVariable String sourceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(required = false) String series,
            @RequestParam(defaultValue = "5000") @Min(1) @Max(25_000) int limit,
            @RequestParam(defaultValue = "json") @Pattern(regexp = "json|csv") String format) {
        if (!Source.ALL.containsKey(sourceId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Unknown source. See /api/v1/sources.");
        }
        String startDate = start == null ? null : start.toString();
        String endDate = end == null ? null : end.toString();
        List<Map<String, Object>> matching = store.rows(sourceId).stream()
                .filter(row -> startDate == null || SnapshotStore.date(row).compareTo(startDate) >= 0)
                .filter(row -> endDate == null || SnapshotStore.date(row).compareTo(endDate) <= 0)
                .filter(row -> series == null || series.equals(row.get("series")))
                .toList();
        // Keep the most recent rows when more than `limit` match.
        List<Map<String, Object>> rows = matching.subList(Math.max(0, matching.size() - limit), matching.size());

        if (format.equals("csv")) {
            return ResponseEntity.ok().contentType(new MediaType("text", "csv")).body(toCsv(rows));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("source_id", sourceId);
        body.put("count", rows.size());
        body.put("data", rows);
        return ResponseEntity.ok(body);
    }

    private static String toCsv(List<Map<String, Object>> rows) {
        StringBuilder csv = new StringBuilder(String.join(",", CSV_FIELDS)).append('\n');
        for (Map<String, Object> row : rows) {
            csv.append(String.join(",", CSV_FIELDS.stream().map(field -> csvCell(row.get(field))).toList()))
                    .append('\n');
        }
        return csv.toString();
    }

    private static String csvCell(Object value) {
        String text = value == null ? "" : value.toString();
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return '"' + text.replace("\"", "\"\"") + '"';
        }
        return text;
    }
}
