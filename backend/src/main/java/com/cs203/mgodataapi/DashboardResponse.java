package com.cs203.mgodataapi;

import java.time.LocalDate;
import java.util.List;

/**
 * Composite DTO representing the historical market dashboard payload.
 * Aggregates scenario date, ticker cards, chart data points, and indicator table rows.
 */
public record DashboardResponse(
    LocalDate scenarioDate,
    List<MarketTickerDTO> tickers,
    List<ChartPointDTO> chartSeries,
    List<IndicatorDTO> indicators
) {}
