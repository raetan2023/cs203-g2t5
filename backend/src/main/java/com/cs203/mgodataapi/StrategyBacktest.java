package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.MathContext;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

/** Offline replay of the actual product policy. No supplier orders or database writes. */
public final class StrategyBacktest {
    private StrategyBacktest() {}
    public record Outcome(LocalDate origin, LocalDate deadline, String action, LocalDate purchaseDate,
                          BigDecimal quantity, BigDecimal buyNow, BigDecimal strategy, BigDecimal savedPerMt) {}

    public static Outcome replay(PlanAnalysisService.Context context, List<Prices> forecasts,
                                 Map<LocalDate, BigDecimal> observations) {
        var guidance = RecommendationPolicy.evaluateAvailable(context, forecasts);
        // MONITOR has no execution rule. Precommit to buying immediately, not hindsight timing.
        LocalDate execution = "WAIT".equals(guidance.action())
                ? guidance.evidence().supported_target_date() : context.scenario_as_of_date();
        BigDecimal now = observations.get(context.scenario_as_of_date());
        BigDecimal actual = observations.get(execution);
        if (now == null || actual == null || now.signum() <= 0 || actual.signum() <= 0)
            throw new IllegalArgumentException("Exact observed execution prices required");
        return new Outcome(context.scenario_as_of_date(), context.purchase_deadline(), guidance.action(), execution,
                context.quantity_mt(), now.multiply(context.quantity_mt()), actual.multiply(context.quantity_mt()), now.subtract(actual));
    }

    private static List<Map<String, String>> csv(Path file) throws Exception {
        var lines = Files.readAllLines(file);
        String[] header = lines.get(0).split(",", -1);
        var rows = new ArrayList<Map<String, String>>();
        for (String line : lines.subList(1, lines.size())) {
            if (line.isBlank()) continue;
            String[] values = line.split(",", -1);
            if (values.length != header.length || line.contains("\"")) throw new IllegalArgumentException("Expected numeric/date CSV: " + file);
            var row = new HashMap<String, String>();
            for (int i = 0; i < header.length; i++) row.put(header[i], values[i]);
            rows.add(row);
        }
        return rows;
    }
    private static BigDecimal decimal(Map<String, String> row, String key) { return new BigDecimal(row.get(key)); }
    private static LocalDate date(Map<String, String> row, String key) { return LocalDate.parse(row.get(key)); }
    private static String key(Map<String, String> row) { return row.get("origin") + "/" + row.get("target_date"); }
    private static void observation(Map<LocalDate, BigDecimal> values, LocalDate day, BigDecimal price) {
        var old = values.putIfAbsent(day, price);
        if (price.signum() <= 0 || old != null && old.compareTo(price) != 0)
            throw new IllegalArgumentException("Invalid or conflicting observation at " + day);
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Usage: StrategyBacktest <model reports directory> <output directory> <holdout start YYYY-MM-DD>");
        Path input = Path.of(args[0]), output = Path.of(args[1]);
        LocalDate holdout = LocalDate.parse(args[2]);
        var byOrigin = new TreeMap<LocalDate, List<Prices>>();
        var observations = new TreeMap<LocalDate, BigDecimal>();
        var basis = new Basis("Singapore MGO", "USD", "MT");
        int excluded = 0;
        for (int horizon : List.of(7, 14, 30)) {
            var points = new HashMap<String, Map<String, String>>();
            for (var row : csv(input.resolve("backtest_" + horizon + "d.csv"))) {
                if (points.putIfAbsent(key(row), row) != null) throw new IllegalArgumentException("Duplicate point forecast");
                observation(observations, date(row, "origin"), decimal(row, "mgo_t"));
                observation(observations, date(row, "target_date"), decimal(row, "mgo_target"));
            }
            var seen = new HashSet<String>();
            for (var row : csv(input.resolve("quantile_backtest_" + horizon + "d.csv"))) {
                if (!seen.add(key(row))) throw new IllegalArgumentException("Duplicate interval forecast");
                var point = points.get(key(row));
                LocalDate origin = date(row, "origin");
                if (point == null || !date(row, "trained_through_target_date").isBefore(origin)) { excluded++; continue; }
                if (decimal(point, "mgo_t").compareTo(decimal(row, "mgo_t")) != 0
                        || decimal(point, "mgo_target").compareTo(decimal(row, "mgo_target")) != 0)
                    throw new IllegalArgumentException("Point/interval observations disagree");
                var reference = new Reference(decimal(row, "mgo_t"), origin, basis);
                var forecast = new Forecast(new Range(decimal(row, "low"), decimal(row, "high")),
                        date(row, "target_date"), basis, "Historical experimental bounds", horizon + " days", decimal(point, "pred_price"));
                byOrigin.computeIfAbsent(origin, ignored -> new ArrayList<>()).add(new Prices(origin, Result.ready(reference), Result.ready(forecast)));
            }
        }
        Files.createDirectories(output);
        var details = new StringBuilder("origin,deadline,action,purchase_date,quantity_mt,buy_now_usd,strategy_usd,saved_usd_per_mt\n");
        var report = new StringBuilder("# Historical strategy versus buy-now\n\nPolicy: " + RecommendationPolicy.VERSION + "; holdout start: " + holdout + "\n\n");
        report.append("Same origin, quantity (100 MT), observed Singapore MGO price basis and deadline for both strategies. WAIT buys once on the policy's suggested date at its exact observed price. BUY_NOW and MONITOR buy at origin; MONITOR fallback is a simulation assumption, not product guidance. No hindsight minimum, interpolation, repeated monitoring, fees, freight, taxes, financing, slippage or volume discounts. Positive savings favour strategy; negative savings mean underperformance. Overlapping daily scenarios are not independent trades or a portfolio.\n\n");
        report.append("Forecast inputs are existing walk-forward point reports joined to historical quantile bounds on origin and target. Interval training labels must precede origin. This replay does not retrain or independently certify the source pipeline; historical bounds are experimental. Origins before the supplied holdout start are excluded to avoid evaluating shrinkage on its development sample. Origins require all three horizons so missing forecasts do not inflate buy-now ties. Outcomes use observations only after the decision. No claim of future advantage.\n\n");
        report.append("| Deadline days | Origin period | Last execution | Scenarios | WAIT | MONITOR | Wins / losses / ties | Average saved USD/MT | Worst USD/MT | Total saved USD |\n|---|---|---|---:|---:|---:|---|---:|---:|---:|\n");
        for (int days : List.of(7, 14, 20, 30)) {
            var outcomes = new ArrayList<Outcome>();
            for (var entry : byOrigin.entrySet()) {
                if (entry.getValue().size() != 3 || entry.getKey().isBefore(holdout)) continue;
                var origin = entry.getKey();
                var context = new PlanAnalysisService.Context(new UUID(0, 1), new BigDecimal("100"), origin.plusDays(days), origin);
                var result = replay(context, entry.getValue(), observations);
                outcomes.add(result);
                details.append(String.join(",", origin.toString(), result.deadline().toString(), result.action(), result.purchaseDate().toString(), result.quantity().toPlainString(), result.buyNow().toPlainString(), result.strategy().toPlainString(), result.savedPerMt().toPlainString())).append("\n");
            }
            if (outcomes.isEmpty()) throw new IllegalArgumentException("No complete scenarios");
            var sum = outcomes.stream().map(Outcome::savedPerMt).reduce(BigDecimal.ZERO, BigDecimal::add);
            long wins = outcomes.stream().filter(o -> o.savedPerMt().signum() > 0).count();
            long losses = outcomes.stream().filter(o -> o.savedPerMt().signum() < 0).count();
            report.append(String.format(Locale.ROOT, "| %d | %s to %s | %s | %d | %d | %d | %d / %d / %d | %.4f | %.4f | %.2f |%n", days,
                    outcomes.get(0).origin(), outcomes.get(outcomes.size()-1).origin(), outcomes.stream().map(Outcome::purchaseDate).max(LocalDate::compareTo).orElseThrow(), outcomes.size(),
                    outcomes.stream().filter(o -> o.action().equals("WAIT")).count(), outcomes.stream().filter(o -> o.action().equals("MONITOR")).count(), wins, losses, outcomes.size()-wins-losses,
                    sum.divide(BigDecimal.valueOf(outcomes.size()), MathContext.DECIMAL128), outcomes.stream().map(Outcome::savedPerMt).min(BigDecimal::compareTo).orElseThrow(), sum.multiply(new BigDecimal("100"))));
        }
        report.append("\nInterpretation: compare the signed mean and loss count above. Zero savings indicate no demonstrated advantage over buy-now; MONITOR fallback ties are not evidence that waiting works.\n");
        report.append("\nExcluded interval rows without a matching point forecast or with training labels not strictly before origin: " + excluded + ". Per-scenario outcomes: strategy-outcomes.csv. Results describe the bundled historical sample only.\n");
        Files.writeString(output.resolve("strategy-outcomes.csv"), details);
        Files.writeString(output.resolve("strategy-backtest.md"), report);
    }
}
