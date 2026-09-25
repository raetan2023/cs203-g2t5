package com.cs203.mgodataapi;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** A commodity/source the API knows about, whether or not a snapshot is bundled. */
public record Source(String id, String name, String provider, String unit) {

    public static final Map<String, Source> ALL;

    static {
        Map<String, Source> sources = new LinkedHashMap<>();
        add(sources, "mgo_singapore", "Singapore MGO prices", "The Maritime", "USD/MT");
        add(sources, "gasoil_singapore", "Singapore Gasoil futures", "Investing.com", "source-defined");
        add(sources, "dubai_crude", "Dubai Crude Oil futures", "Investing.com", "source-defined");
        add(sources, "brent", "Brent crude", "FRED", "USD/barrel");
        add(sources, "usd_index", "Broad USD index", "FRED", "index");
        add(sources, "bunker_sales", "Singapore bunker sales", "data.gov.sg / MPA", "thousand tonnes");
        add(sources, "gdelt", "Oil and shipping news", "GDELT", "articles");
        ALL = Collections.unmodifiableMap(sources);
    }

    private static void add(Map<String, Source> sources, String id, String name, String provider, String unit) {
        sources.put(id, new Source(id, name, provider, unit));
    }
}
