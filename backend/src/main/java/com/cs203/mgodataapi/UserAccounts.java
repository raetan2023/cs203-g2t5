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
        // Two first requests can arrive together, so let the unique constraint decide the
        // winner rather than checking first and inserting after.
        jdbc.update("""
                insert into users (clerk_user_id, email) values (?, ?)
                on conflict (clerk_user_id) do nothing""", subject, email);
        return jdbc.queryForObject("select user_id from users where clerk_user_id = ?", UUID.class, subject);
    }
}
