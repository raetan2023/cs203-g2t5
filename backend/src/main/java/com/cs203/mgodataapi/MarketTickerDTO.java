package com.example.market.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * DTO for the top 4 market ticker summary cards.
 */
public record MarketTickerDTO(
    String seriesKey,
    String label,
    String unit,
    String currency,
    String source,
    String valueType,
    BigDecimal value,
    BigDecimal changeAbs,
    BigDecimal changePct,
    LocalDate observedDate
) {}
