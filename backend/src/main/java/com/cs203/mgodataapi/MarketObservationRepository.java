package com.cs203.mgodataapi;

import com.cs203.mgodataapi.MarketObservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

/**
 * Spring Data JPA Repository for MARKET_OBSERVATIONS.
 * Provides JPQL queries to fetch scenario snapshot tickers and time-series history for charts.
 */
@Repository
public interface MarketObservationRepository extends JpaRepository<MarketObservation, Long> {

    @Query("""
        SELECT o FROM MarketObservation o
        WHERE o.scenarioDate = :scenarioDate
          AND o.observedDate = :scenarioDate
        ORDER BY o.series.id ASC
    """)
    List<MarketObservation> findTickersForScenario(@Param("scenarioDate") LocalDate scenarioDate);

    @Query("""
        SELECT o FROM MarketObservation o
        WHERE o.series.seriesKey = :seriesKey
          AND o.scenarioDate = :scenarioDate
        ORDER BY o.observedDate ASC
    """)
    List<MarketObservation> findChartSeries(
        @Param("seriesKey") String seriesKey,
        @Param("scenarioDate") LocalDate scenarioDate
    );
}
