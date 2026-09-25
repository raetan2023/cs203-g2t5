package com.cs203.mgodataapi;

import java.util.Map;

import org.springframework.http.HttpStatus;

/** An error returned to the frontend as {"detail": ..., "field_errors": {...}}. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final Map<String, String> fieldErrors;

    public ApiException(HttpStatus status, String detail) {
        this(status, detail, null);
    }

    public ApiException(HttpStatus status, String detail, Map<String, String> fieldErrors) {
        super(detail);
        this.status = status;
        this.fieldErrors = fieldErrors;
    }

    public HttpStatus status() {
        return status;
    }

    public Map<String, String> fieldErrors() {
        return fieldErrors;
    }
}
