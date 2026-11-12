package com.cs203.mgodataapi;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Maps a verified sign-in to the application's own user record.
 *
 * <p>The identity provider owns the account; this table owns the UUID that purchase plans
 * are keyed by. The row is created the first time someone signs in, because no other part
 * of the system is told about a new account.
 */
@Service
public class UserAccounts {

    /** SQL for how a person is shown: their name, else their email, else their Clerk ID. */
    static String labelOf(String alias) {
        return "coalesce(nullif(trim(" + alias + ".display_name), ''), nullif(trim(" + alias + ".email), ''), " + alias + ".clerk_user_id)";
    }

    private static final String FIND = "select user_id from users where clerk_user_id = ?";

    private final JdbcTemplate jdbc;

    public UserAccounts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The internal UUID for this provider subject, creating the record when it is new.
     *
     * @param email optional; the session token carries one only when configured to
     */
    public UUID resolve(String subject, String email) {
        // Two first requests can arrive together, so let the unique constraints decide the
        // winner rather than checking first and inserting after.
        jdbc.update("""
                insert into users (clerk_user_id, email) values (?, ?)
                on conflict do nothing""", subject, email);
        var found = jdbc.queryForList(FIND, UUID.class, subject);
        if (!found.isEmpty()) return found.get(0);
        // The email belongs to another record, such as this person's deleted account.
        // Their new account still needs a record, so create it without the email.
        jdbc.update("""
                insert into users (clerk_user_id, email) values (?, null)
                on conflict (clerk_user_id) do nothing""", subject);
        return jdbc.queryForObject(FIND, UUID.class, subject);
    }

    /** How each of these people is shown (see {@link #labelOf}); unknown ids are left out. */
    public java.util.Map<UUID, String> labels(java.util.Collection<UUID> userIds) {
        var ids = java.util.List.copyOf(new java.util.LinkedHashSet<>(userIds));
        if (ids.isEmpty()) return java.util.Map.of();
        var labels = new java.util.HashMap<UUID, String>();
        jdbc.query("select u.user_id, " + labelOf("u") + " as label from users u where u.user_id in ("
                + String.join(", ", java.util.Collections.nCopies(ids.size(), "?")) + ")",
                rs -> { labels.put(rs.getObject("user_id", UUID.class), rs.getString("label")); }, ids.toArray());
        return labels;
    }

    /** Looks up an existing record without creating one, so it works in read-only transactions. */
    public java.util.Optional<UUID> find(String subject) {
        return jdbc.queryForList(FIND, UUID.class, subject).stream().findFirst();
    }
}
