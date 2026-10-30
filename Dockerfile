# Backend image for Azure App Service: the Spring Boot API plus the Python
# environment its purchase-plan inference runs as a subprocess. The layout
# (/app/backend, /app/ridge-regression-model, /app/.venv) matches the
# RidgeInference defaults, so no MGO_RIDGE_* overrides are needed.

# The jar is platform-independent, so build it natively (avoids emulation on ARM Macs).
FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk-noble AS build
WORKDIR /src
COPY backend/ .
RUN chmod +x mvnw && ./mvnw -q -DskipTests package

# Ubuntu 24.04 ships Python 3.12, which the pinned requirements support.
FROM eclipse-temurin:21-jre-noble
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ridge-regression-model/requirements-lock.txt /tmp/requirements-lock.txt
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -r /tmp/requirements-lock.txt
COPY ridge-regression-model/ ridge-regression-model/
COPY --from=build /src/target/*.jar backend/app.jar
WORKDIR /app/backend
ENV PORT=8000
EXPOSE 8000
CMD ["java", "-XX:MaxRAMPercentage=60", "-jar", "app.jar"]
