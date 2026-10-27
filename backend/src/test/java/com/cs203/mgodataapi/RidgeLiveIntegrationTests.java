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

    @Test void realRecommendationCarriesTheSelectedRunAndApprovalFingerprint() throws Exception {
        var saved = jdbc.queryForMap("select plan_id,user_id,quantity_mt,purchase_deadline,clerk_org_id from purchase_plans where clerk_org_id is not null and status='draft' order by purchase_deadline desc limit 1");
        when(users.resolve(anyString(), any())).thenReturn((UUID) saved.get("user_id"));
        var membership = jwt().jwt(token -> token.claim("o", java.util.Map.of("id", saved.get("clerk_org_id").toString(), "rol", "buyer")));
        var forecast = assertInstanceOf(ForecastService.Ready.class, forecasts.read(14));
        String query = "?plan_id=" + saved.get("plan_id") + "&quantity_mt=" + saved.get("quantity_mt")
                + "&purchase_deadline=" + saved.get("purchase_deadline") + "&scenario_as_of_date=" + forecasts.today()
                + "&horizon_days=14&urgency=NORMAL&run_id=" + forecast.run_id();
        var response = mvc.perform(get("/api/v1/purchase-plans/recommendation" + query).with(membership))
                .andExpect(status().isOk()).andExpect(jsonPath("$.provenance").value("model"))
                .andExpect(jsonPath("$.recommendation.status").value("ready"))
                .andExpect(jsonPath("$.cost_impact.status").value("ready"))
                .andExpect(jsonPath("$.forecast.value.run_id").value(forecast.run_id().toString()))
                .andReturn().getResponse().getContentAsString();
        assertTrue(mapper.readTree(response).path("approval_fingerprint").asText().matches("[a-f0-9]{64}"));
        System.out.println("Read-only live check: selected recommendation has model provenance, matching run, ready costs and approval fingerprint.");
    }

    @Test void realSavedPlanUsesExecutedRidgeStoredNewsAndExactDecimalCosts() throws Exception {
        var saved = jdbc.queryForMap("select plan_id,user_id,quantity_mt,purchase_deadline,clerk_org_id from purchase_plans where clerk_org_id is not null order by purchase_deadline desc limit 1");
        UUID owner = (UUID) saved.get("user_id");
        when(users.resolve(anyString(), any())).thenReturn(owner);
        String organisationId = (String) saved.get("clerk_org_id");
        var membership = jwt().jwt(token -> token.claim("o", java.util.Map.of("id", organisationId, "rol", "buyer")));
        LocalDate today = forecasts.today();
        var standalone = ridge.predict(30, today);
        var response = mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=30").with(membership))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("ready"))
                .andReturn().getResponse().getContentAsString();
        var forecast = mapper.readTree(response);
        assertEquals(new BigDecimal(standalone.path("forecast").asText()), new BigDecimal(forecast.path("forecast").asText()));
        assertEquals(standalone.path("model_version").asText(), forecast.path("model_version").asText());
        String query = "?plan_id=" + saved.get("plan_id") + "&quantity_mt=" + saved.get("quantity_mt")
                + "&purchase_deadline=" + saved.get("purchase_deadline") + "&scenario_as_of_date=" + today
                + "&horizon_days=30&run_id=" + forecast.path("run_id").asText();
        LocalDate deadline = saved.get("purchase_deadline") instanceof LocalDate d ? d : ((java.sql.Date) saved.get("purchase_deadline")).toLocalDate();
        boolean fits = !LocalDate.parse(forecast.path("target_date").asText()).isAfter(deadline);
        var impact = mapper.readTree(mvc.perform(get("/api/v1/purchase-plans/cost-impact" + query).with(membership))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cost_impact.status").value(fits ? "ready" : "unavailable"))
                .andReturn().getResponse().getContentAsString());
        if (fits) {
            BigDecimal quantity = (BigDecimal) saved.get("quantity_mt");
            assertEquals(0, new BigDecimal(forecast.path("low").asText()).multiply(quantity)
                    .compareTo(new BigDecimal(impact.at("/cost_impact/value/forecast_total/lower").asText())));
        } else assertEquals("unsupported_horizon", impact.at("/cost_impact/reason").asText());
        assertEquals(forecast.path("run_id").asText(), impact.at("/forecast/value/run_id").asText());
        mvc.perform(get("/api/v1/purchase-plans/recommendation" + query).with(membership))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recommendation.status").value("ready"));
        for (int h : new int[]{7,14}) {
            var current = mapper.readTree(mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=" + h).with(membership))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ready"))
                .andReturn().getResponse().getContentAsString());
            assertEquals(today.toString(), current.path("anchor_quote_date").asText());
            assertEquals(today.plusDays(h).toString(), current.path("target_date").asText());
        }
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
