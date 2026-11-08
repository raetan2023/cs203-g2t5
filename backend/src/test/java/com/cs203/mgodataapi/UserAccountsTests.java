package com.cs203.mgodataapi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class UserAccountsTests {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserAccounts accounts = new UserAccounts(jdbc);
    private final UUID id = UUID.randomUUID();

    @Test
    void returnsTheRecordWithoutASecondInsertWhenOneExists() {
        when(jdbc.queryForList(anyString(), eq(UUID.class), any(Object[].class))).thenReturn(List.of(id));

        assertThat(accounts.resolve("user_1", "a@example.com")).isEqualTo(id);

        verify(jdbc, never()).update(contains("values (?, null)"), any(Object[].class));
    }

    @Test
    void createsTheRecordWithoutAnEmailWhenTheEmailIsTaken() {
        when(jdbc.queryForList(anyString(), eq(UUID.class), any(Object[].class))).thenReturn(List.of());
        when(jdbc.queryForObject(anyString(), eq(UUID.class), any(Object[].class))).thenReturn(id);

        assertThat(accounts.resolve("user_new", "taken@example.com")).isEqualTo(id);

        verify(jdbc).update(contains("values (?, null)"), eq("user_new"));
    }
}
