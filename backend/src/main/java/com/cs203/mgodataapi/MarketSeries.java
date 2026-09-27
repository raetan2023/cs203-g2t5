package com.cs203.mgodataapi;

import jakarta.persistence.*;

/**
 * Entity representing the MARKET_SERIES table.
 * Stores metadata and descriptors for time-series instruments (e.g. currency, unit, value type).
 */
@Entity
@Table(name = "MARKET_SERIES")
public class MarketSeries {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "series_key", nullable = false, unique = true, length = 64)
    private String seriesKey;

    @Column(name = "label", nullable = false, length = 128)
    private String label;

    @Column(name = "unit", length = 32)
    private String unit;

    @Column(name = "currency", length = 8)
    private String currency;

    @Column(name = "source", length = 128)
    private String source;

    @Column(name = "value_type", nullable = false, length = 16)
    private String valueType; // 'OBSERVED' | 'ESTIMATED'

    public MarketSeries() {}

    public MarketSeries(Long id, String seriesKey, String label, String unit, String currency, String source, String valueType) {
        this.id = id;
        this.seriesKey = seriesKey;
        this.label = label;
        this.unit = unit;
        this.currency = currency;
        this.source = source;
        this.valueType = valueType;
    }

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

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getValueType() {
        return valueType;
    }

    public void setValueType(String valueType) {
        this.valueType = valueType;
    }
}
