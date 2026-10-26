package com.cs203.mgodataapi;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Private child process: no unauthenticated network model endpoint. */
@Component
public class RidgeInference {
    private final Path root;
    private final String python;
    private final JsonMapper mapper;
    public RidgeInference(@Value("${mgo.ridge.root:../ridge-regression-model}") String root,
            @Value("${mgo.ridge.python:../.venv/bin/python}") String python, JsonMapper mapper) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.python = Path.of(python).toAbsolutePath().normalize().toString();
        this.mapper = mapper;
    }
    public synchronized JsonNode predict(int horizon, LocalDate asOf) {
        Process process = null;
        try {
            process = new ProcessBuilder(python, "-m", "src.purchase_inference")
                    .directory(root.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            try (var input = process.getOutputStream()) {
                input.write(mapper.writeValueAsBytes(Map.of("horizon_days", horizon, "as_of_date", asOf.toString())));
            }
            if (!process.waitFor(25, TimeUnit.SECONDS)) throw new IllegalStateException("Ridge inference timed out.");
            if (process.exitValue() != 0) throw new IllegalStateException("Ridge inference failed; inspect model installation and inputs.");
            return mapper.readTree(process.getInputStream().readAllBytes());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Ridge inference interrupted.", error);
        } catch (java.io.IOException error) {
            throw new IllegalStateException("Ridge runtime unavailable; verify the local Python environment.", error);
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
    }
}
