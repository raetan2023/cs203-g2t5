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

/** Requires a valid X-API-Key header on every /api/ route. */
@Component
public class ApiKeyFilter extends OncePerRequestFilter {

    private final byte[] apiKey;

    public ApiKeyFilter(@Value("${mgo.api-key}") String apiKey) {
        this.apiKey = apiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String key = request.getHeader("X-API-Key");
        // Constant-time comparison, like secrets.compare_digest in the Python service.
        if (key == null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8), apiKey)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"detail\":\"Provide a valid X-API-Key header.\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
