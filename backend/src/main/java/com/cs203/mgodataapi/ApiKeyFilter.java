package com.cs203.mgodataapi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Requires a valid X-API-Key header on the shared market-data routes.
 *
 * <p>Purchase-plan routes are exempt: they carry a session token identifying a specific
 * user, which a shared key cannot do, and sending both would gain nothing.
 */
@Component
public class ApiKeyFilter extends OncePerRequestFilter {

    private final byte[] apiKey;

    public ApiKeyFilter(@Value("${mgo.api-key}") String apiKey) {
        this.apiKey = apiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Browsers send preflight OPTIONS requests without custom headers, so they
        // must reach the CORS handler rather than being rejected for a missing key.
        return "OPTIONS".equals(request.getMethod())
                || !request.getRequestURI().startsWith("/api/")
                || request.getRequestURI().startsWith("/api/v1/purchase-plan");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String key = request.getHeader("X-API-Key");
        // Constant-time comparison, so a wrong key cannot be guessed from response timing.
        if (key == null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8), apiKey)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"detail\":\"Provide a valid X-API-Key header.\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
