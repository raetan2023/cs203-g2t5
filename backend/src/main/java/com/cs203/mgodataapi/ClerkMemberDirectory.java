package com.cs203.mgodataapi;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Reads an organisation's full member list from Clerk's Backend API. */
@Component
public class ClerkMemberDirectory {
    static final int PAGE_SIZE = 100;

    private final String secretKey;
    private final String baseUrl;
    private final tools.jackson.databind.json.JsonMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public ClerkMemberDirectory(@Value("${mgo.clerk.secret-key:}") String secretKey,
            @Value("${mgo.clerk.api-url:https://api.clerk.com/v1}") String baseUrl,
            tools.jackson.databind.json.JsonMapper mapper) {
        this.secretKey = secretKey == null ? "" : secretKey.strip();
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.mapper = mapper;
    }

    public boolean configured() {
        return !secretKey.isEmpty();
    }

    /** Every membership in the organisation, or an exception; never a partial list. */
    public List<ClerkMembershipSync.Membership> members(String organisationId) {
        if (!configured())
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Member sync is not configured.");
        List<ClerkMembershipSync.Membership> all = new ArrayList<>();
        for (int offset = 0; ; offset += PAGE_SIZE) {
            var page = page(organisationId, offset);
            if (!(page.get("data") instanceof List<?> rows))
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Clerk returned an unexpected member list.");
            for (Object row : rows) if (row instanceof Map<?, ?> data) all.add(ClerkMembershipSync.Membership.from(data));
            long total = page.get("total_count") instanceof Number n ? n.longValue() : all.size();
            if (rows.size() < PAGE_SIZE || all.size() >= total) return all;
        }
    }

    private Map<?, ?> page(String organisationId, int offset) {
        var uri = URI.create(baseUrl + "/organizations/" + URLEncoder.encode(organisationId, StandardCharsets.UTF_8)
                + "/memberships?limit=" + PAGE_SIZE + "&offset=" + offset);
        try {
            // Built inside the try: a malformed key's error message would otherwise log the key.
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + secretKey).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200)
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Clerk could not return the member list.");
            return mapper.readValue(response.body(), Map.class);
        } catch (ApiException failure) {
            throw failure;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Clerk could not return the member list.");
        } catch (Exception failure) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Clerk could not return the member list.");
        }
    }
}
