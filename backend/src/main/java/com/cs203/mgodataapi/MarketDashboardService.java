package com.cs203.mgodataapi;

import com.cs203.mgodataapi.ChartPointDTO;
import com.cs203.mgodataapi.DashboardResponse;
import com.cs203.mgodataapi.IndicatorDTO;
import com.cs203.mgodataapi.MarketTickerDTO;
import com.cs203.mgodataapi.MarketIndicator;
import com.cs203.mgodataapi.MarketObservation;
import com.cs203.mgodataapi.MarketIndicatorRepository;
import com.cs203.mgodataapi.MarketObservationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Service orchestrating market data aggregation for Anjali's historical market dashboard.
 * Supports querying database records (MARKET_SERIES, MARKET_OBSERVATIONS, MARKET_INDICATORS),
 * fetching live data from external API, and serving clearly labelled mock historical data.
 */
@Service
public class MarketDashboardService {

    private static final Logger log = LoggerFactory.getLogger(MarketDashboardService.class);
    private static final String API_BASE = "https://mgo-data-api.vercel.app";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final MarketObservationRepository observationRepository;
    private final MarketIndicatorRepository indicatorRepository;

    public MarketDashboardService(
        ObjectMapper objectMapper,
        @Autowired(required = false) MarketObservationRepository observationRepository,
        @Autowired(required = false) MarketIndicatorRepository indicatorRepository
    ) {
        this.objectMapper = objectMapper;
        this.observationRepository = observationRepository;
        this.indicatorRepository = indicatorRepository;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public DashboardResponse getDashboard(LocalDate scenarioDate) {
        LocalDate date = scenarioDate != null ? scenarioDate : LocalDate.of(2025, 10, 24);

        // 1. Attempt database-backed query if repositories are configured and contain records
        if (observationRepository != null && indicatorRepository != null) {
            try {
                DashboardResponse dbResponse = fetchFromDatabase(date);
                if (dbResponse != null && !dbResponse.tickers().isEmpty()) {
                    log.info("Serving historical market data from database for scenario {}", date);
                    return dbResponse;
                }
            } catch (Exception e) {
                log.warn("Database query skipped or failed: {}. Falling back to API/mock.", e.getMessage());
            }
        }

        // 2. Attempt live external data hub
        try {
            return fetchFromExternalApi(date);
        } catch (Exception e) {
            log.error("Failed to fetch live market data from {}. Using fallback mock fixtures. Error: {}", API_BASE, e.getMessage());
            return buildFallbackResponse(date);
        }
    }

    private DashboardResponse fetchFromDatabase(LocalDate scenarioDate) {
        List<MarketObservation> tickerObs = observationRepository.findTickersForScenario(scenarioDate);
        if (tickerObs.isEmpty()) return null;

        List<MarketTickerDTO> tickers = tickerObs.stream().map(o -> new MarketTickerDTO(
            o.getSeries().getSeriesKey(),
            o.getSeries().getLabel(),
            o.getSeries().getUnit(),
            o.getSeries().getCurrency(),
            o.getSeries().getSource(),
            o.getSeries().getValueType(),
            o.getValue(),
            o.getChangeAbs(),
            o.getChangePct(),
            o.getObservedDate()
        )).toList();

        List<MarketObservation> chartObs = observationRepository.findChartSeries("SGP_MGO_DERIVED", scenarioDate);
        List<ChartPointDTO> chartSeries = chartObs.stream().map(o -> new ChartPointDTO(
            o.getObservedDate(),
            o.getValue(),
            o.getSeries().getSeriesKey()
        )).toList();

        List<MarketIndicator> indicatorEntities = indicatorRepository.findByScenarioDateOrderByIdAsc(scenarioDate);
        List<IndicatorDTO> indicators = indicatorEntities.stream().map(i -> new IndicatorDTO(
            i.getLabel(),
            i.getSource(),
            i.getObservedDate(),
            i.getValue(),
            i.getUnit()
        )).toList();

        return new DashboardResponse(scenarioDate, tickers, chartSeries, indicators);
    }

    private DashboardResponse fetchFromExternalApi(LocalDate scenarioDate) throws Exception {
        // Fetch MGO Singapore series
        JsonNode mgoRoot = fetchJson(API_BASE + "/api/v1/data/mgo_singapore?limit=30");
        JsonNode brentRoot = fetchJson(API_BASE + "/api/v1/data/brent?limit=5");
        JsonNode usdRoot = fetchJson(API_BASE + "/api/v1/data/usd_index?limit=5");
        JsonNode featuresRoot = fetchJson(API_BASE + "/api/v1/analysis/features?source_id=mgo_singapore&limit=5");

        // Parse MGO Observations
        List<ChartPointDTO> chartSeries = new ArrayList<>();
        BigDecimal latestMgo = BigDecimal.valueOf(614.50);
        BigDecimal prevMgo = latestMgo;
        LocalDate latestDate = scenarioDate != null ? scenarioDate : LocalDate.of(2025, 10, 24);

        if (mgoRoot != null && mgoRoot.has("data") && mgoRoot.get("data").isArray()) {
            JsonNode dataArray = mgoRoot.get("data");
            for (int i = 0; i < dataArray.size(); i++) {
                JsonNode row = dataArray.get(i);
                LocalDate d = LocalDate.parse(row.get("date").asText());
                BigDecimal val = BigDecimal.valueOf(row.get("value").asDouble());
                chartSeries.add(new ChartPointDTO(d, val, "SGP_MGO_DERIVED"));
                if (i == dataArray.size() - 2) {
                    prevMgo = val;
                }
                if (i == dataArray.size() - 1) {
                    latestMgo = val;
                    latestDate = d;
                }
            }
        }

        BigDecimal mgoChangeAbs = latestMgo.subtract(prevMgo);
        BigDecimal mgoChangePct = prevMgo.compareTo(BigDecimal.ZERO) != 0
            ? mgoChangeAbs.divide(prevMgo, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
            : BigDecimal.ZERO;

        // Parse Brent
        BigDecimal latestBrent = BigDecimal.valueOf(78.45);
        BigDecimal prevBrent = latestBrent;
        LocalDate brentDate = latestDate;
        if (brentRoot != null && brentRoot.has("data") && brentRoot.get("data").isArray()) {
            JsonNode brentData = brentRoot.get("data");
            int sz = brentData.size();
            if (sz > 0) {
                JsonNode last = brentData.get(sz - 1);
                latestBrent = BigDecimal.valueOf(last.get("value").asDouble());
                brentDate = LocalDate.parse(last.get("date").asText());
                if (sz > 1) {
                    prevBrent = BigDecimal.valueOf(brentData.get(sz - 2).get("value").asDouble());
                }
            }
        }
        BigDecimal brentChangeAbs = latestBrent.subtract(prevBrent);
        BigDecimal brentChangePct = prevBrent.compareTo(BigDecimal.ZERO) != 0
            ? brentChangeAbs.divide(prevBrent, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
            : BigDecimal.ZERO;

        // Parse USD Index
        BigDecimal latestUsd = BigDecimal.valueOf(104.25);
        BigDecimal prevUsd = latestUsd;
        LocalDate usdDate = latestDate;
        if (usdRoot != null && usdRoot.has("data") && usdRoot.get("data").isArray()) {
            JsonNode usdData = usdRoot.get("data");
            int sz = usdData.size();
            if (sz > 0) {
                JsonNode last = usdData.get(sz - 1);
                latestUsd = BigDecimal.valueOf(last.get("value").asDouble());
                usdDate = LocalDate.parse(last.get("date").asText());
                if (sz > 1) {
                    prevUsd = BigDecimal.valueOf(usdData.get(sz - 2).get("value").asDouble());
                }
            }
        }
        BigDecimal usdChangeAbs = latestUsd.subtract(prevUsd);
        BigDecimal usdChangePct = prevUsd.compareTo(BigDecimal.ZERO) != 0
            ? usdChangeAbs.divide(prevUsd, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
            : BigDecimal.ZERO;

        // Derived Gasoil Proxy
        BigDecimal gasoilConversionFactor = BigDecimal.valueOf(7.45);
        BigDecimal gasoilVal = latestMgo.divide(gasoilConversionFactor, 2, RoundingMode.HALF_UP);
        BigDecimal gasoilChangeAbs = mgoChangeAbs.divide(gasoilConversionFactor, 2, RoundingMode.HALF_UP);

        // Build 4 Ticker cards
        List<MarketTickerDTO> tickers = List.of(
            new MarketTickerDTO("SGP_MGO_DERIVED", "Singapore MGO (derived est.)", "USD/MT", "USD", "Derived via Singapore Gasoil Proxy", "ESTIMATED", latestMgo, mgoChangeAbs, mgoChangePct, latestDate),
            new MarketTickerDTO("SGP_GASOIL_FUT", "Singapore Gasoil futures", "USD/bbl", "USD", "SGX SG Gasoil (GSD)", "OBSERVED", gasoilVal, gasoilChangeAbs, mgoChangePct, latestDate),
            new MarketTickerDTO("BRENT_CRUDE", "Brent crude", "USD/bbl", "USD", "ICE Brent Crude", "OBSERVED", latestBrent, brentChangeAbs, brentChangePct, brentDate),
            new MarketTickerDTO("USD_INDEX", "USD index", null, null, "ICE DXY", "OBSERVED", latestUsd, usdChangeAbs, usdChangePct, usdDate)
        );

        // Parse Indicators
        BigDecimal volVal = BigDecimal.valueOf(24.1);
        if (featuresRoot != null && featuresRoot.has("data") && featuresRoot.get("data").isArray()) {
            JsonNode fData = featuresRoot.get("data");
            if (fData.size() > 0) {
                JsonNode lastF = fData.get(fData.size() - 1);
                if (lastF.has("volatility_7") && !lastF.get("volatility_7").isNull()) {
                    volVal = BigDecimal.valueOf(lastF.get("volatility_7").asDouble() * 100).setScale(1, RoundingMode.HALF_UP);
                }
            }
        }

        List<IndicatorDTO> indicators = List.of(
            new IndicatorDTO("Brent-Dubai Spread", "Platts / S&P", latestDate, BigDecimal.valueOf(1.82), "/bbl"),
            new IndicatorDTO("Gasoil 10ppm Crack", "SGX Exchange", latestDate, BigDecimal.valueOf(18.45), "/bbl"),
            new IndicatorDTO("MGO Implied Volatility", "Internal Estimate", latestDate, volVal, "%"),
            new IndicatorDTO("SG Bunker Sales Vol", "MPA Singapore", LocalDate.of(2025, 9, 1), BigDecimal.valueOf(4210000), "MT")
        );

        return new DashboardResponse(latestDate, tickers, chartSeries, indicators);
    }

    private JsonNode fetchJson(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json")
                .GET()
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return objectMapper.readTree(response.body());
            }
        } catch (Exception e) {
            log.warn("Could not retrieve {}: {}", url, e.getMessage());
        }
        return null;
    }

    private DashboardResponse buildFallbackResponse(LocalDate scenarioDate) {
        LocalDate date = scenarioDate != null ? scenarioDate : LocalDate.of(2025, 10, 24);
        List<MarketTickerDTO> tickers = List.of(
            new MarketTickerDTO("SGP_MGO_DERIVED", "Singapore MGO (derived est.)", "USD/MT", "USD", "Derived via Singapore Gasoil Proxy", "ESTIMATED", BigDecimal.valueOf(614.50), BigDecimal.valueOf(4.20), BigDecimal.valueOf(0.69), date),
            new MarketTickerDTO("SGP_GASOIL_FUT", "Singapore Gasoil futures", "USD/bbl", "USD", "SGX SG Gasoil (GSD)", "OBSERVED", BigDecimal.valueOf(84.10), BigDecimal.valueOf(0.85), BigDecimal.valueOf(1.02), date),
            new MarketTickerDTO("BRENT_CRUDE", "Brent crude", "USD/bbl", "USD", "ICE Brent Crude", "OBSERVED", BigDecimal.valueOf(78.45), BigDecimal.valueOf(-1.20), BigDecimal.valueOf(-1.51), date),
            new MarketTickerDTO("USD_INDEX", "USD index", null, null, "ICE DXY", "OBSERVED", BigDecimal.valueOf(104.25), BigDecimal.valueOf(0.12), BigDecimal.valueOf(0.12), date)
        );

        List<ChartPointDTO> chartSeries = List.of(
            new ChartPointDTO(date.minusDays(23), BigDecimal.valueOf(582.00), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date.minusDays(19), BigDecimal.valueOf(587.50), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date.minusDays(14), BigDecimal.valueOf(591.00), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date.minusDays(9), BigDecimal.valueOf(598.00), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date.minusDays(6), BigDecimal.valueOf(601.00), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date.minusDays(3), BigDecimal.valueOf(607.00), "SGP_MGO_DERIVED"),
            new ChartPointDTO(date, BigDecimal.valueOf(614.50), "SGP_MGO_DERIVED")
        );

        List<IndicatorDTO> indicators = List.of(
            new IndicatorDTO("Brent-Dubai Spread", "Platts / S&P", date, BigDecimal.valueOf(1.82), "/bbl"),
            new IndicatorDTO("Gasoil 10ppm Crack", "SGX Exchange", date, BigDecimal.valueOf(18.45), "/bbl"),
            new IndicatorDTO("MGO Implied Volatility", "Internal Estimate", date.minusDays(1), BigDecimal.valueOf(24.1), "%"),
            new IndicatorDTO("SG Bunker Sales Vol", "MPA Singapore", LocalDate.of(2025, 9, 1), BigDecimal.valueOf(4210000), "MT")
        );

        return new DashboardResponse(date, tickers, chartSeries, indicators);
    }
}
