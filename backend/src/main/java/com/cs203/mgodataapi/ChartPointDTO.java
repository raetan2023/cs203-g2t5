package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * DTO for single time-series data points plotted on the line chart.
 */
public record ChartPointDTO(
    LocalDate date,
    BigDecimal value,
    String seriesKey
) {}
