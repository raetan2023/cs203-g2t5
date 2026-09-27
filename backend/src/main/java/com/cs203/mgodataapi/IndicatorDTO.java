package com.example.market.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * DTO for macroeconomic and regional market indicators listed in the table.
 */
public record IndicatorDTO(
    String label,
    String source,
    LocalDate observedDate,
    BigDecimal value,
    String unit
) {}
