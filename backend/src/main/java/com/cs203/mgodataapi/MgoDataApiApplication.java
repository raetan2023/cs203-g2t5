package com.cs203.mgodataapi;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@OpenAPIDefinition(info = @Info(
        title = "MGO backend",
        version = MgoDataApiApplication.VERSION,
        description = "Historical market data and purchase plans. Send `X-API-Key` with API requests."))
@SecurityScheme(name = "apiKey", type = SecuritySchemeType.APIKEY, in = SecuritySchemeIn.HEADER, paramName = "X-API-Key")
public class MgoDataApiApplication {

    public static final String VERSION = "0.0.1";

    public static void main(String[] args) {
        SpringApplication.run(MgoDataApiApplication.class, args);
    }
}
