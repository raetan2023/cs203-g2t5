package com.cs203.mgodataapi;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder", "spring.datasource.username=placeholder",
        "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class PmAssignmentHttpTests {
    static final String PATH = "/api/v1/admin/pm-assignments";
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean PmAssignmentService assignments;
    @MockitoBean UserAccounts users;
    final UUID po = UUID.randomUUID(), pm = UUID.randomUUID(), admin = UUID.randomUUID();
    final String body = "{\"pm_user_id\":\"%s\",\"clerk_org_id\":\"org_attacker\"}";

    RequestPostProcessor member(String role) {
        return jwt().jwt(t -> t.subject("user_x").claim("o", Map.of("id", "org_a", "rol", role)));
    }

    @Test void onlyAdminsCanListOrAssign() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        for (String role : List.of("officer", "manager", "analyst")) {
            mvc.perform(get(PATH).with(member(role))).andExpect(status().isForbidden());
            mvc.perform(put(PATH + "/" + po).with(member(role)).contentType("application/json").content(body.formatted(pm)))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(assignments);
    }

    @Test void listUsesTheTokenOrganisationAndShowsUnassignedOfficers() throws Exception {
        when(assignments.overview("org_a")).thenReturn(new PmAssignmentService.Overview(
                List.of(new PmAssignmentService.Officer(po, "po@example.com", null)),
                List.of(new PmAssignmentService.Manager(pm, "pm@example.com", 0))));
        mvc.perform(get(PATH).with(member("admin"))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.officers[0].label").value("po@example.com"))
                .andExpect(jsonPath("$.officers[0].pm_user_id").isEmpty())
                .andExpect(jsonPath("$.managers[0].officer_count").value(0));
    }

    @Test void assignIgnoresClientOrganisationAndRecordsTheAdmin() throws Exception {
        when(users.resolve("user_x", null)).thenReturn(admin);
        when(assignments.assign("org_a", po, pm, admin)).thenReturn(new PmAssignmentService.Overview(List.of(), List.of()));
        mvc.perform(put(PATH + "/" + po).with(member("admin")).contentType("application/json").content(body.formatted(pm)))
                .andExpect(status().isOk());
        verify(assignments).assign("org_a", po, pm, admin);
    }

    @Test void aPmIsRequiredAndAssignmentsCannotBeDeleted() throws Exception {
        mvc.perform(put(PATH + "/" + po).with(member("admin")).contentType("application/json").content("{}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(delete(PATH + "/" + po).with(member("admin"))).andExpect(status().is4xxClientError());
        verify(assignments, never()).assign(any(), any(), any(), any());
    }

    @Test void validationMessagesReachTheAdmin() throws Exception {
        when(users.resolve("user_x", null)).thenReturn(admin);
        when(assignments.assign(any(), any(), any(), any())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_CONTENT,
                "This person is not a Procurement Manager in your organisation."));
        mvc.perform(put(PATH + "/" + po).with(member("admin")).contentType("application/json").content(body.formatted(pm)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.detail").value("This person is not a Procurement Manager in your organisation."));
    }
}
