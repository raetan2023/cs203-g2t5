package com.cs203.mgodataapi;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the frontend's development server to call the API from a browser.
 *
 * <p>Browsers block cross-origin requests unless the server names the origin, and
 * {@code 127.0.0.1} and {@code localhost} count as different origins.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final List<String> allowedOrigins;

    public WebConfig(@Value("${mgo.frontend-origins}") List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                // Custom headers make browsers send a preflight OPTIONS request first.
                .allowedHeaders("Authorization", "Content-Type", "X-API-Key", "X-User-Id")
                .maxAge(3600);
    }
}
