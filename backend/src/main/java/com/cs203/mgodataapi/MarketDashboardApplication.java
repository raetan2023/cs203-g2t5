package com.example.market;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the Spring Boot Market Dashboard application.
 * Launches the embedded web server (Tomcat by default on port 8080)
 * and scans the com.example.market package for Spring components.
 */
@SpringBootApplication
public class MarketDashboardApplication {

    public static void main(String[] args) {
        SpringApplication.run(MarketDashboardApplication.class, args);
    }
}
