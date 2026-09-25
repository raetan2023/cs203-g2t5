package com.cs203.mgodataapi;

import java.util.LinkedHashMap;
import java.util.Map;

/** A commodity/source the API knows about, whether or not a snapshot is bundled. */
public record Source(String id, String name, String provider, String unit) {

    public static final Map<String, Source> ALL = new LinkedHashMap<>();

    static {
        add("mgo_singapore", "Singapore MGO prices", "The Maritime", "USD/MT");
        add("gasoil_singapore", "Singapore Gasoil futures", "Investing.com", "source-defined");
        add("dubai_crude", "Dubai Crude Oil futures", "Investing.com", "source-defined");
        add("brent", "Brent crude", "FRED", "USD/barrel");
        add("usd_index", "Broad USD index", "FRED", "index");
        add("bunker_sales", "Singapore bunker sales", "data.gov.sg / MPA", "thousand tonnes");
        add("gdelt", "Oil and shipping news", "GDELT", "articles");
    }

    private static void add(String id, String name, String provider, String unit) {
        ALL.put(id, new Source(id, name, provider, unit));
    }
}
