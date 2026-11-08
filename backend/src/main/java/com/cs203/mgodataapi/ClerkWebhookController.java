package com.cs203.mgodataapi;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Receives Clerk membership and user events so members exist before their first
 * sign-in and role changes apply straight away. There is no sign-in token here: the
 * request is trusted only after its signature checks out.
 */
@RestController
public class ClerkWebhookController {
    private final ClerkWebhookVerifier verifier;
    private final ClerkMembershipSync sync;
    private final tools.jackson.databind.json.JsonMapper mapper;

    public ClerkWebhookController(ClerkWebhookVerifier verifier, ClerkMembershipSync sync,
            tools.jackson.databind.json.JsonMapper mapper) {
        this.verifier = verifier; this.sync = sync; this.mapper = mapper;
    }

    @PostMapping("/api/v1/webhooks/clerk")
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "svix-id", required = false) String id,
            @RequestHeader(value = "svix-timestamp", required = false) String timestamp,
            @RequestHeader(value = "svix-signature", required = false) String signature,
            @RequestBody(required = false) String body) {
        // Verify the exact bytes received before reading anything from them.
        verifier.verify(id, timestamp, signature, body);
        Map<?, ?> event;
        try { event = mapper.readValue(body, Map.class); }
        catch (Exception failure) { throw new ApiException(HttpStatus.BAD_REQUEST, "The webhook body is not valid JSON."); }
        if (event.get("data") instanceof Map<?, ?> data)
            sync.apply(event.get("type") instanceof String type ? type : null, data);
        return ResponseEntity.noContent().build();
    }
}
