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
}
