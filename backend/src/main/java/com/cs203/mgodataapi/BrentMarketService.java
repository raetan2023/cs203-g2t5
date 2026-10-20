package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class BrentMarketService {
    private static final Logger log = LoggerFactory.getLogger(BrentMarketService.class);
    private final BrentMarketRepository repository;

    public record Response(MarketTickerDTO ticker, List<ChartPointDTO> history,
                           Instant fetchedAt, String storage) {}

    public BrentMarketService(BrentMarketRepository repository) {
        this.repository = repository;
    }

    public Optional<Response> latest() {
        List<BrentMarketRepository.Observation> rows;
        try {
            rows = repository.latest();
        } catch (DataAccessException failure) {
            log.warn("Unable to read stored Brent observations ({})", failure.getClass().getSimpleName());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Stored Brent data is unavailable. Check the backend database connection.");
        }
        if (rows.isEmpty()) return Optional.empty();
        var latest = rows.getFirst();
        BigDecimal change = null;
        BigDecimal changePct = null;
        if (rows.size() > 1) {
            BigDecimal previous = rows.get(1).value();
            change = latest.value().subtract(previous);
            if (previous.signum() != 0) {
                changePct = change.multiply(BigDecimal.valueOf(100)).divide(previous, 4, RoundingMode.HALF_UP);
            }
        }
        var ticker = new MarketTickerDTO(latest.seriesKey(), "Brent crude", latest.unit(),
                latest.currency(), latest.source(), "OBSERVED", latest.value(), change,
                changePct, latest.date());
        var history = rows.stream().sorted(Comparator.comparing(BrentMarketRepository.Observation::date))
                .map(row -> new ChartPointDTO(row.date(), row.value(), row.seriesKey())).toList();
        return Optional.of(new Response(ticker, history, Instant.now(), "supabase"));
    }
}
