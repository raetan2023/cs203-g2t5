package com.cs203.mgodataapi;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@OpenAPIDefinition(info = @Info(
        title = "MGO backend",
        version = MgoBackendApplication.VERSION,
        description = "Historical market data, plus each signed-in user's purchase plan."))
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
public class MgoBackendApplication {

    public static final String VERSION = "0.0.1";

    public static void main(String[] args) {
        SpringApplication.run(MgoBackendApplication.class, args);
    }
}
