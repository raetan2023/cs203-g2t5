package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RidgeInferenceCacheTests {
    @TempDir Path root;
    final LocalDate date = LocalDate.of(2026, 11, 4);
    final JsonMapper mapper = JsonMapper.builder().build();
    final PurchaseForecastRepository repository = mock(PurchaseForecastRepository.class);
    List<PurchaseForecastRepository.ModelObservation> rows(String price) {
        return List.of(new PurchaseForecastRepository.ModelObservation("SGP_MGO_OBSERVED", "The Maritime",
                "source", "USD/MT", "USD", date, new BigDecimal(price)));
    }
    RidgeInference inference() {
        when(repository.modelObservations(any())).thenReturn(rows("800"));
        return spy(new RidgeInference(root.toString(), "python3", mapper, repository));
    }
    @Test void evidenceReusesExecutionButChangedDataDateAndArtifactsInvalidate() throws Exception {
        RidgeInference ridge = inference();
        Files.createDirectories(root.resolve("artifacts"));
        Path artifact = root.resolve("artifacts/ridge_7d.joblib");
        Files.writeString(artifact, "model one");
        doAnswer(call -> mapper.readTree("{\"status\":\"ready\",\"forecast\":800}"))
                .when(ridge).execute(anyInt(), any(), anyList());
        ridge.predict(7, date);
        ridge.predict(7, date);
        verify(ridge).execute(eq(7), eq(date), anyList());
        when(repository.modelObservations(date)).thenReturn(rows("801"));
        ridge.predict(7, date);
        Files.writeString(artifact, "model two");
        ridge.predict(7, date);
        ridge.predict(14, date);
        ridge.predict(7, date.plusDays(1));
        verify(ridge, times(5)).execute(anyInt(), any(), anyList());
    }
    @Test void simultaneousRequestsShareExecutionWhileOtherHorizonsRunInParallel() throws Exception {
        RidgeInference ridge = inference();
        CountDownLatch started = new CountDownLatch(2), release = new CountDownLatch(1);
        doAnswer(call -> {
            started.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return mapper.readTree("{\"status\":\"ready\"}");
        }).when(ridge).execute(anyInt(), any(), anyList());
        try (var pool = Executors.newFixedThreadPool(3)) {
            var first = pool.submit(() -> ridge.predict(7, date));
            var duplicate = pool.submit(() -> ridge.predict(7, date));
            var other = pool.submit(() -> ridge.predict(14, date));
            try { assertTrue(started.await(5, TimeUnit.SECONDS)); }
            finally { release.countDown(); }
            assertEquals(first.get(5, TimeUnit.SECONDS), duplicate.get(5, TimeUnit.SECONDS));
            other.get(5, TimeUnit.SECONDS);
        }
        verify(ridge).execute(eq(7), any(), anyList());
        verify(ridge).execute(eq(14), any(), anyList());
    }
    @Test void unavailableAndFailedExecutionsCanRecoverWithoutRestart() throws Exception {
        RidgeInference ridge = inference();
        doThrow(new IllegalStateException("temporary failure"))
                .doReturn(mapper.readTree("{\"status\":\"unavailable\"}"))
                .doReturn(mapper.readTree("{\"status\":\"ready\"}"))
                .when(ridge).execute(anyInt(), any(), anyList());
        assertThrows(IllegalStateException.class, () -> ridge.predict(7, date));
        assertEquals("unavailable", ridge.predict(7, date).path("status").asText());
        assertEquals("ready", ridge.predict(7, date).path("status").asText());
        ridge.predict(7, date);
        verify(ridge, times(3)).execute(anyInt(), any(), anyList());
    }
    @Test void artifactsChangedDuringExecutionAreNotRetainedUnderOldIdentity() throws Exception {
        RidgeInference ridge = inference();
        Files.createDirectories(root.resolve("artifacts"));
        Path artifact = root.resolve("artifacts/ridge_7d.joblib");
        Files.writeString(artifact, "old");
        doAnswer(call -> {
            Files.writeString(artifact, "new");
            return mapper.readTree("{\"status\":\"ready\"}");
        }).when(ridge).execute(anyInt(), any(), anyList());
        ridge.predict(7, date);
        Files.writeString(artifact, "old");
        ridge.predict(7, date);
        verify(ridge, times(2)).execute(anyInt(), any(), anyList());
    }
    @Test
    @org.junit.jupiter.api.condition.EnabledOnOs({org.junit.jupiter.api.condition.OS.MAC, org.junit.jupiter.api.condition.OS.LINUX})
    void childCanWriteMoreThanAPipeBufferWithoutDeadlocking() throws Exception {
        Path executable = root.resolve("fake-python");
        String payload = "x".repeat(128 * 1024);
        Files.writeString(executable, "#!/bin/sh\ncat >/dev/null\ncat <<'RESULT'\n"
                + "{\"status\":\"ready\",\"payload\":\"" + payload + "\"}\nRESULT\n");
        assertTrue(executable.toFile().setExecutable(true));
        when(repository.modelObservations(date)).thenReturn(rows("800"));
        RidgeInference ridge = new RidgeInference(root.toString(), executable.toString(), mapper, repository);
        assertEquals(payload, ridge.predict(7, date).path("payload").asText());
    }
    @Test void cacheIsBounded() throws Exception {
        RidgeInference ridge = inference();
        doReturn(mapper.readTree("{\"status\":\"ready\"}"))
                .when(ridge).execute(anyInt(), any(), anyList());
        for (int i = 0; i < 13; i++) ridge.predict(7, date.plusDays(i));
        ridge.predict(7, date);
        verify(ridge, times(14)).execute(anyInt(), any(), anyList());
    }
}
