package com.cs203.mgodataapi;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Latest stored provider and curated publisher headlines for Home. Reads only what the news pipeline archived; never calls GDELT. */
@Service
public class NewsService {
    /** Rolling windows overlap, so a few of them cover the last day or two without duplicates after merging. */
    static final int WINDOWS = 4;
    static final int MAX_LIMIT = 100;

    public record Item(String title, String url, String source, Instant seenAt, String topic, String marketBias) {}
    public record Response(List<Item> items, Instant updatedAt, String storage) {}

    private final NewsRepository repository;
    private final JsonMapper mapper;
    public NewsService(NewsRepository repository, JsonMapper mapper) { this.repository = repository; this.mapper = mapper; }

    public Response latest(int limit) {
        if (limit < 1 || limit > MAX_LIMIT)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "limit must be between 1 and " + MAX_LIMIT + ".");
        List<String> payloads;
        try {
            payloads = repository.latestHeadlineWindows(WINDOWS);
        } catch (DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Stored news is unavailable. Check the backend database connection.");
        }
        List<Item> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Instant updatedAt = null;
        for (String payload : payloads) {
            JsonNode window;
            try {
                window = mapper.readTree(payload);
            } catch (RuntimeException malformed) {
                continue;
            }
            Instant retrieved = instant(window.path("retrieved_at"));
            if (retrieved != null && (updatedAt == null || retrieved.isAfter(updatedAt))) updatedAt = retrieved;
            for (JsonNode record : window.path("records")) {
                Item item = item(record);
                if (item != null && seen.add(item.url())) items.add(item);
            }
        }
        items.sort(Comparator.comparing(Item::seenAt).reversed().thenComparing(Item::url));
        return new Response(List.copyOf(items.subList(0, Math.min(limit, items.size()))), updatedAt, "supabase");
    }

    /** Skips records that could not be shown safely: no headline, no time, or a link that is not plain web. */
    private static Item item(JsonNode record) {
        String title = String.join(" ", record.path("title").asText("").trim().split("\\s+"));
        String url = record.path("url").asText("").trim();
        Instant seenAt = instant(record.path("seen_at"));
        if (title.isEmpty() || seenAt == null || !isWebLink(url)) return null;
        String source = record.path("domain").asText("").trim().toLowerCase();
        if (source.isEmpty()) source = URI.create(url).getHost().toLowerCase();
        if (source.startsWith("www.")) source = source.substring(4);
        JsonNode label = record.path("classification");
        boolean valid = label.path("valid").asBoolean(false);
        return new Item(title, url, source, seenAt,
                valid ? label.path("category").asText(null) : null,
                valid ? label.path("market_bias").asText(null) : null);
    }

    private static boolean isWebLink(String url) {
        try {
            URI uri = new URI(url);
            return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null;
        } catch (Exception invalid) {
            return false;
        }
    }

    private static Instant instant(JsonNode node) {
        try {
            String text = node.asText("");
            return text.isEmpty() ? null : Instant.parse(text);
        } catch (RuntimeException invalid) {
            return null;
        }
    }
}
