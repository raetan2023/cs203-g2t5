package com.cs203.mgodataapi;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

// These tests cover the snapshot endpoints and never touch the database, so a placeholder
// connection is enough: Hikari only dials out on first use, which never happens here.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder",
        "spring.datasource.username=placeholder",
        "spring.datasource.password=placeholder",
        "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class MgoDataApiApplicationTests {

    private static final String KEY = "mgo_public_demo_2026";

    @Autowired
    private MockMvc mvc;

    @Test
    void homeHealthAndDocsArePublic() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/health")).andExpect(jsonPath("$.status").value("ok"));
        mvc.perform(get("/openapi.json")).andExpect(status().isOk());
    }

    @Test
    void dataRequiresAKeyAndReturnsSnapshotData() throws Exception {
        mvc.perform(get("/api/v1/sources")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/sources").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.sources[?(@.id == 'brent')].records").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.greaterThan(0))));
        mvc.perform(get("/api/v1/data/brent?limit=2").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.count").value(2));
        mvc.perform(get("/api/v1/data/brent?limit=1&format=csv").header("X-API-Key", KEY))
                .andExpect(content().string(startsWith("date,value,series,source,unit\n")));
    }

    @Test
    void rejectsUnknownSourcesAndBadParameters() throws Exception {
        mvc.perform(get("/api/v1/data/nope").header("X-API-Key", KEY)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/data/brent?limit=0").header("X-API-Key", KEY)).andExpect(status().isUnprocessableContent());
        mvc.perform(get("/api/v1/data/brent?format=xml").header("X-API-Key", KEY)).andExpect(status().isUnprocessableContent());
    }

    /** Plan requests without a usable caller are rejected before the database is touched. */
    @Test
    void purchasePlanRequiresAKnownCaller() throws Exception {
        mvc.perform(get("/api/v1/purchase-plan").header("X-API-Key", KEY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
        mvc.perform(get("/api/v1/purchase-plan").header("X-API-Key", KEY).header("X-User-Id", "not-a-uuid"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/purchase-plan")).andExpect(status().isUnauthorized());
    }
}
