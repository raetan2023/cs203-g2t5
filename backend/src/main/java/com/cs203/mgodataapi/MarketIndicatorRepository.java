package com.cs203.mgodataapi;

import com.cs203.mgodataapi.MarketIndicator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

/**
 * Spring Data JPA Repository for MARKET_INDICATORS.
 * Automatically generates queries to fetch macroeconomic indicators for a given scenario date.
 */
@Repository
public interface MarketIndicatorRepository extends JpaRepository<MarketIndicator, Long> {

    List<MarketIndicator> findByScenarioDateOrderByIdAsc(LocalDate scenarioDate);
}
