package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Opt-in read-only real database + actual Python artifacts + normal controllers.
 * Only identity resolution is replaced; existing saved plans and market rows are read.
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="RUN_RIDGE_LIVE", matches="true")
class RidgeLiveIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    final JsonMapper mapper = JsonMapper.builder().enable(tools.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
    @Autowired RidgeInference ridge;
    @Autowired PurchaseForecastService forecasts;
    @Autowired PurchaseForecastRepository observations;
    @Autowired java.time.Clock clock;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean UserAccounts users;

    @Test void realSavedPlanUsesExecutedRidgeStoredNewsAndExactDecimalCosts() throws Exception {
        var saved = jdbc.queryForMap("select plan_id,user_id,quantity_mt,purchase_deadline from purchase_plans order by purchase_deadline desc limit 1");
        UUID owner = (UUID) saved.get("user_id");
        when(users.resolve(anyString(), any())).thenReturn(owner);
        LocalDate today = forecasts.today();
        var standalone = ridge.predict(30, today);
        var response = mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=30").with(jwt()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("ready"))
                .andReturn().getResponse().getContentAsString();
        var forecast = mapper.readTree(response);
        assertEquals(new BigDecimal(standalone.path("forecast").asText()), new BigDecimal(forecast.path("forecast").asText()));
        assertEquals(standalone.path("model_version").asText(), forecast.path("model_version").asText());
        String query = "?plan_id=" + saved.get("plan_id") + "&quantity_mt=" + saved.get("quantity_mt")
                + "&purchase_deadline=" + saved.get("purchase_deadline") + "&scenario_as_of_date=" + today
                + "&horizon_days=30&run_id=" + forecast.path("run_id").asText();
        var impact = mapper.readTree(mvc.perform(get("/api/v1/purchase-plans/cost-impact" + query).with(jwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cost_impact.status").value("ready"))
                .andReturn().getResponse().getContentAsString());
        BigDecimal quantity = (BigDecimal) saved.get("quantity_mt");
        assertEquals(0, new BigDecimal(forecast.path("low").asText()).multiply(quantity)
                .compareTo(new BigDecimal(impact.at("/cost_impact/value/forecast_total/lower").asText())));
        assertEquals(forecast.path("run_id").asText(), impact.at("/forecast/value/run_id").asText());
        mvc.perform(get("/api/v1/purchase-plans/recommendation" + query).with(jwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recommendation.status").value("ready"));
        mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=7").with(jwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reason").value("ridge_unavailable"));
        mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=14").with(jwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reason").value("ridge_unavailable"));
        // Change only news in memory; never write synthetic market/news data to the database.
        var repository = mock(PurchaseForecastRepository.class);
        var rows = new java.util.ArrayList<>(observations.observations(today));
        when(repository.observations(today)).thenAnswer(call -> java.util.List.copyOf(rows));
        var controlled = new PurchaseForecastService(repository, clock, ridge);
        var before = assertInstanceOf(ForecastService.Ready.class, controlled.read(30));
        rows.replaceAll(row -> row.date().equals(forecasts.newsDay()) && row.series().equals("GDELT_ARTICLE_COUNT")
                ? new PurchaseForecastRepository.Observation(row.series(), row.source(), row.unit(), row.currency(), row.date(), new BigDecimal("10000000"))
                : row.date().equals(forecasts.newsDay()) && row.series().equals("GDELT_AVERAGE_TONE")
                ? new PurchaseForecastRepository.Observation(row.series(), row.source(), row.unit(), row.currency(), row.date(), new BigDecimal("-100")) : row);
        var after = assertInstanceOf(ForecastService.Ready.class, controlled.read(30));
        assertEquals(before.data().forecast(), after.data().forecast());
        assertTrue(after.data().low().compareTo(before.data().low()) < 0);
        assertTrue(after.data().high().compareTo(before.data().high()) > 0);
        assertNotEquals(before.run_id(), after.run_id());
        System.out.println("RIDGE LIVE VERIFIED: target=" + forecast.path("target_date").asText()
                + " central=" + forecast.path("forecast").asText() + " bounds=" + forecast.path("low").asText()
                + "/" + forecast.path("high").asText() + " model=" + forecast.path("model_version").asText());
    }
}
