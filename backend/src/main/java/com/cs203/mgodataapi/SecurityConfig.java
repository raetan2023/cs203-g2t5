package com.cs203.mgodataapi;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Protects the purchase-plan routes with the frontend's session token.
 *
 * <p>Tokens are verified against the identity provider's published signing keys, so the
 * backend never sees a password and holds no session of its own. Everything else stays
 * open here and is guarded by {@link ApiKeyFilter}: the market data is shared reference
 * data with no owner, so a token would tell it nothing.
 */
@Configuration
public class SecurityConfig {

    /** The API's own error shape, in place of Spring Security's empty 401 body. */
    private static final AuthenticationEntryPoint SIGN_IN_AGAIN = (request, response, failure) -> {
        response.setStatus(401);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"detail\":\"Please sign in again.\"}");
    };

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/api/v1/purchase-plan/**")
                .cors(Customizer.withDefaults())
                // No browser sessions or forms, so there is no cookie for a forged request to ride on.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
                // Set on both: the resource server answers a rejected token, while the
                // outer handler answers a request that carries no token at all.
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(SIGN_IN_AGAIN)
                        .jwt(Customizer.withDefaults()))
                .exceptionHandling(handling -> handling.authenticationEntryPoint(SIGN_IN_AGAIN))
                .build();
    }
}
