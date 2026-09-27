package com.cs203.mgodataapi;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity representing the MARKET_OBSERVATIONS table.
 * Stores historical and snapshot price readings for a particular series.
 */
@Entity
@Table(name = "MARKET_OBSERVATIONS")
public class MarketObservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "series_id", nullable = false)
    private MarketSeries series;

    @Column(name = "observed_date", nullable = false)
    private LocalDate observedDate;

    @Column(name = "value", nullable = false, precision = 12, scale = 4)
    private BigDecimal value;

    @Column(name = "change_abs", precision = 10, scale = 4)
    private BigDecimal changeAbs;

    @Column(name = "change_pct", precision = 8, scale = 4)
    private BigDecimal changePct;

    @Column(name = "scenario_date", nullable = false)
    private LocalDate scenarioDate;

    public MarketObservation() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public MarketSeries getSeries() {
        return series;
    }

    public void setSeries(MarketSeries series) {
        this.series = series;
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

    public BigDecimal getChangeAbs() {
        return changeAbs;
    }

    public void setChangeAbs(BigDecimal changeAbs) {
        this.changeAbs = changeAbs;
    }

    public BigDecimal getChangePct() {
        return changePct;
    }

    public void setChangePct(BigDecimal changePct) {
        this.changePct = changePct;
    }

    public LocalDate getScenarioDate() {
        return scenarioDate;
    }

    public void setScenarioDate(LocalDate scenarioDate) {
        this.scenarioDate = scenarioDate;
    }
}
