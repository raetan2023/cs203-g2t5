package com.cs203.mgodataapi;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Checks that a webhook request really came from Clerk. Clerk signs
 * {@code id.timestamp.body} with the endpoint's signing secret (HMAC-SHA256) and sends
 * the result in the {@code svix-signature} header.
 */
@Component
public class ClerkWebhookVerifier {
    static final long TOLERANCE_SECONDS = 5 * 60;

    private final byte[] key;
    private final Clock clock;

    public ClerkWebhookVerifier(@Value("${mgo.clerk.webhook-secret:}") String secret, Clock clock) {
        this.key = decode(secret);
        this.clock = clock;
    }

    public boolean configured() {
        return key != null;
    }

    /** Throws 401 unless the headers carry a current, valid signature for this exact body. */
    public void verify(String id, String timestamp, String signatures, String body) {
        if (key == null)
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Clerk webhooks are not configured.");
        if (id == null || timestamp == null || signatures == null || body == null)
            throw rejected();
        long sent;
        try { sent = Long.parseLong(timestamp.strip()); }
        catch (NumberFormatException failure) { throw rejected(); }
        // A captured request cannot be replayed later.
        if (Math.abs(clock.instant().getEpochSecond() - sent) > TOLERANCE_SECONDS) throw rejected();
        byte[] expected = sign(id + "." + timestamp.strip() + "." + body);
        // The header can list several signatures (e.g. during secret rotation).
        for (String entry : signatures.strip().split(" ")) {
            int comma = entry.indexOf(',');
            if (comma < 0 || !"v1".equals(entry.substring(0, comma))) continue;
            byte[] given;
            try { given = Base64.getDecoder().decode(entry.substring(comma + 1)); }
            catch (IllegalArgumentException failure) { continue; }
            if (MessageDigest.isEqual(expected, given)) return;
        }
        throw rejected();
    }

    byte[] sign(String content) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception failure) {
            throw new IllegalStateException("Could not compute the webhook signature.", failure);
        }
    }

    private static byte[] decode(String secret) {
        if (secret == null || secret.isBlank()) return null;
        String value = secret.strip();
        if (value.startsWith("whsec_")) value = value.substring("whsec_".length());
        try { return Base64.getDecoder().decode(value); }
        catch (IllegalArgumentException failure) {
            throw new IllegalStateException("CLERK_WEBHOOK_SECRET is not a valid signing secret.", failure);
        }
    }

    private static ApiException rejected() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "The webhook signature is invalid.");
    }
}
