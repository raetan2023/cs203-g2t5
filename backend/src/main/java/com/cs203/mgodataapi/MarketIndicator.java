package com.cs203.mgodataapi;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity representing the MARKET_INDICATORS table.
 * Stores calculated macroeconomic or regional market proxies per scenario date.
 */
@Entity
@Table(name = "MARKET_INDICATORS")
public class MarketIndicator {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "series_key", nullable = false, length = 64)
    private String seriesKey;

    @Column(name = "label", nullable = false, length = 128)
    private String label;

    @Column(name = "source", length = 128)
    private String source;

    @Column(name = "observed_date", nullable = false)
    private LocalDate observedDate;

    @Column(name = "value", nullable = false, precision = 14, scale = 4)
    private BigDecimal value;

    @Column(name = "unit", length = 32)
    private String unit;

    @Column(name = "scenario_date", nullable = false)
    private LocalDate scenarioDate;

    public MarketIndicator() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSeriesKey() {
        return seriesKey;
    }

    public void setSeriesKey(String seriesKey) {
        this.seriesKey = seriesKey;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public LocalDate getObservedDate() {
        return observedDate;
    }

    public void setObservedDate(LocalDate observedDate) {
        this.observedDate = observedDate;
    }

    public BigDecimal getValue() {
        return value;
    }

    public void setValue(BigDecimal value) {
        this.value = value;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public LocalDate getScenarioDate() {
        return scenarioDate;
    }

    public void setScenarioDate(LocalDate scenarioDate) {
        this.scenarioDate = scenarioDate;
    }
}
