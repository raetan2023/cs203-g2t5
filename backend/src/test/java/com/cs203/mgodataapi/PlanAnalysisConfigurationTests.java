package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class PlanAnalysisConfigurationTests {
    final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(PlanAnalysisConfiguration.class);
    @Test void fixtureRequiresBothProfileAndFlag() {
        runner.run(context -> assertEquals("unavailable", context.getBean(PlanAnalysisProvider.class).provenance()));
        runner.withPropertyValues("mgo.analysis.fixture-enabled=true")
                .run(context -> assertEquals("unavailable", context.getBean(PlanAnalysisProvider.class).provenance()));
        runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("analysis-fixture"))
                .run(context -> assertEquals("unavailable", context.getBean(PlanAnalysisProvider.class).provenance()));
        runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("analysis-fixture"))
                .withPropertyValues("mgo.analysis.fixture-enabled=true")
                .run(context -> assertEquals("fixture", context.getBean(PlanAnalysisProvider.class).provenance()));
    }
    @Test void realProviderReplacesTheUnavailableDefault() {
        PlanAnalysisProvider provider = org.mockito.Mockito.mock(PlanAnalysisProvider.class);
        runner.withBean(PlanAnalysisProvider.class, () -> provider).run(context -> {
            assertEquals(1, context.getBeansOfType(PlanAnalysisProvider.class).size());
            assertSame(provider, context.getBean(PlanAnalysisProvider.class));
        });
    }
}
