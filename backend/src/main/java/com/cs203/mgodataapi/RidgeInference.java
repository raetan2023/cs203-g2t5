package com.cs203.mgodataapi;

import java.nio.file.Path;
import java.nio.file.Files;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.concurrent.FutureTask;
import java.util.concurrent.ExecutionException;
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
    private final PurchaseForecastRepository repository;
    private final Path root;
    private final String python;
    private final JsonMapper mapper;
    private record PredictionKey(int horizon, LocalDate asOf,
            List<PurchaseForecastRepository.ModelObservation> observations, String artifacts) {}
    private final Map<PredictionKey, FutureTask<JsonNode>> predictions = new LinkedHashMap<>();
    private static final int CACHE_LIMIT = 12;
    private static final int PROCESS_TIMEOUT_SECONDS = 90;
    public RidgeInference(@Value("${mgo.ridge.root:../ridge-regression-model}") String root,
            @Value("${mgo.ridge.python:}") String python, JsonMapper mapper, PurchaseForecastRepository repository) {
        this.root = Path.of(root).toAbsolutePath().normalize();
        this.python = pythonExecutable(python, System.getProperty("os.name"));
        this.mapper = mapper;
        this.repository = repository;
    }
    static String pythonExecutable(String configured, String osName) {
        String executable = configured.isBlank()
                ? (osName.startsWith("Windows") ? "../.venv/Scripts/python.exe" : "../.venv/bin/python")
                : configured;
        return Path.of(executable).toAbsolutePath().normalize().toString();
    }
    public JsonNode predict(int horizon, LocalDate asOf) {
        // Re-read evidence on every request. Only the expensive Python execution is reused.
        var observations = List.copyOf(repository.modelObservations(asOf));
        var key = new PredictionKey(horizon, asOf, observations, artifactSnapshot());
        FutureTask<JsonNode> task;
        synchronized (predictions) {
            task = predictions.get(key);
            if (task == null) {
                task = new FutureTask<>(() -> execute(horizon, asOf, observations));
                predictions.put(key, task);
                if (predictions.size() > CACHE_LIMIT) predictions.remove(predictions.keySet().iterator().next());
            }
        }
        // FutureTask runs once even when concurrent requests race. Different horizons can run together.
        task.run();
        try {
            JsonNode result = task.get();
            if (!"ready".equals(result.path("status").asText()) || !key.artifacts().equals(artifactSnapshot())) {
                synchronized (predictions) { predictions.remove(key, task); }
            }
            return result.deepCopy();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Ridge inference interrupted.", error);
        } catch (ExecutionException error) {
            synchronized (predictions) { predictions.remove(key, task); }
            if (error.getCause() instanceof RuntimeException failure) throw failure;
            throw new IllegalStateException("Ridge inference failed.", error.getCause());
        }
    }
    private String artifactSnapshot() {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            for (String directory : List.of("src", "artifacts", "data")) {
                Path folder = root.resolve(directory);
                if (!Files.isDirectory(folder)) continue;
                try (var paths = Files.list(folder)) {
                    for (Path file : paths.filter(Files::isRegularFile).filter(path -> {
                        String name = path.getFileName().toString();
                        return directory.equals("src") ? name.endsWith(".py")
                                : directory.equals("data") ? name.equals("series_dictionary.json")
                                : name.startsWith("ridge_") || name.startsWith("quantile_");
                    }).sorted().toList()) {
                        digest.update(root.relativize(file).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        digest.update(Files.readAllBytes(file));
                    }
                }
            }
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (java.io.IOException | java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("Ridge artifacts unavailable; verify the model installation.", error);
        }
    }
    JsonNode execute(int horizon, LocalDate asOf, List<PurchaseForecastRepository.ModelObservation> observations) {
        Process process = null;
        Path output = null;
        try {
            // Avoid filling a stdout pipe while the parent waits for process completion.
            output = Files.createTempFile("purchase-ridge-", ".json");
            var builder = new ProcessBuilder(python, "-m", "src.purchase_inference")
                    .directory(root.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD)
                    .redirectOutput(output.toFile());
            // Different horizons can run together on the single-core production host.
            builder.environment().put("OPENBLAS_NUM_THREADS", "1");
            builder.environment().put("OMP_NUM_THREADS", "1");
            process = builder.start();
            try (var input = process.getOutputStream()) {
                input.write(mapper.writeValueAsBytes(Map.of("horizon_days", horizon, "as_of_date", asOf.toString(), "observations", observations)));
            }
            if (!process.waitFor(PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS)) throw new IllegalStateException("Ridge inference timed out.");
            if (process.exitValue() != 0) throw new IllegalStateException("Ridge inference failed; inspect model installation and inputs.");
            return mapper.readTree(Files.readAllBytes(output));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Ridge inference interrupted.", error);
        } catch (java.io.IOException error) {
            throw new IllegalStateException("Ridge runtime unavailable; verify the local Python environment.", error);
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
            if (output != null) {
                try { Files.deleteIfExists(output); }
                catch (java.io.IOException ignored) { /* Best-effort cleanup after process failure. */ }
            }
        }
    }
}
