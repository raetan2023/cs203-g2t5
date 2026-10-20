package com.cs203.mgodataapi;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Latest stored observations only: never calls an external provider or invents prices. */
@Service
public class StoredMarketService {
    private final BrentMarketRepository repository;
    private final String brentKey;
    private static final Map<String, String> LABELS = Map.of(
            "SGP_MGO_OBSERVED", "Singapore MGO", "SGP_GASOIL_FUT", "Singapore gasoil futures",
            "DUBAI_CRUDE", "Dubai crude futures", "USD_INDEX", "Broad USD index",
            "GDELT_ARTICLE_COUNT", "GDELT daily article count", "GDELT_AVERAGE_TONE", "GDELT average tone");

    public record Series(String category, MarketTickerDTO ticker, List<ChartPointDTO> history) {}
    public record Response(List<Series> series, List<String> missing, Instant fetchedAt, String storage) {}

    public StoredMarketService(BrentMarketRepository repository,
            @Value("${mgo.brent.series-key:BRENT_CRUDE}") String brentKey) {
        this.repository = repository;
        this.brentKey = brentKey;
    }

    public Response latest() {
        List<BrentMarketRepository.Observation> rows;
        try {
            rows = repository.latestImported();
        } catch (DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Stored market data is unavailable. Check the backend database connection.");
        }
        Map<String, List<BrentMarketRepository.Observation>> groups = new LinkedHashMap<>();
        for (var row : rows) groups.computeIfAbsent(row.seriesKey(), ignored -> new ArrayList<>()).add(row);
        List<Series> series = new ArrayList<>();
        for (var group : groups.entrySet()) {
            String key = group.getKey();
            String category = key.startsWith("MPA_BUNKER_") ? "sales" : key.startsWith("GDELT_") ? "news" : "prices";
            String label = key.equals(brentKey) ? "Brent crude" : LABELS.getOrDefault(key,
                    key.replace("MPA_BUNKER_SALES_", "Bunker sales: ").replace('_', ' '));
            var value = BrentMarketService.buildResponse(group.getValue(), label);
            series.add(new Series(category, value.ticker(), value.history()));
        }
        List<String> missing = new ArrayList<>();
        if (!groups.containsKey(brentKey)) missing.add("Brent crude");
        LABELS.forEach((key, label) -> { if (!groups.containsKey(key)) missing.add(label); });
        if (groups.keySet().stream().noneMatch(key -> key.startsWith("MPA_BUNKER_"))) missing.add("Monthly bunker sales");
        return new Response(List.copyOf(series), List.copyOf(missing), Instant.now(), "supabase");
    }
}
