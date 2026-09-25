package com.cs203.mgodataapi;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Loads each bundled JSON snapshot once and keeps its rows in memory. */
@Component
public class SnapshotStore {

    private static final TypeReference<Map<String, Object>> FILE_TYPE = new TypeReference<>() {};

    private final Path snapshotDir;
    private final ObjectMapper mapper;
    private final Map<String, List<Map<String, Object>>> cache = new ConcurrentHashMap<>();

    // Takes a String: Spring would resolve a Path argument as a classpath resource inside the jar.
    public SnapshotStore(@Value("${mgo.snapshot-dir}") String snapshotDir, ObjectMapper mapper) {
        this.snapshotDir = Path.of(snapshotDir);
        this.mapper = mapper;
    }

    public List<Map<String, Object>> rows(String sourceId) {
        return cache.computeIfAbsent(sourceId, this::load);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> load(String sourceId) {
        Path path = snapshotDir.resolve(sourceId + ".json");
        if (!Files.exists(path)) {
            return List.of();
        }
        Map<String, Object> file = mapper.readValue(path.toFile(), FILE_TYPE);
        return List.copyOf((List<Map<String, Object>>) file.get("data"));
    }

    /** Record count and date range, matching the Python service's availability shape. */
    public Map<String, Object> availability(String sourceId) {
        List<Map<String, Object>> rows = rows(sourceId);
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("available", !rows.isEmpty());
        status.put("records", rows.size());
        status.put("start", rows.stream().map(SnapshotStore::date).min(String::compareTo).orElse(null));
        status.put("end", rows.stream().map(SnapshotStore::date).max(String::compareTo).orElse(null));
        return status;
    }

    static String date(Map<String, Object> row) {
        return (String) row.get("date");
    }
}
