package com.cs203.mgodataapi;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RidgeRuntimeTests {
    @Test void windowsUsesVirtualEnvironmentScriptsDirectory() {
        assertEquals(Path.of("../.venv/Scripts/python.exe").toAbsolutePath().normalize().toString(),
                RidgeInference.pythonExecutable("", "Windows 11"));
    }

    @Test void unixUsesVirtualEnvironmentBinDirectory() {
        assertEquals(Path.of("../.venv/bin/python").toAbsolutePath().normalize().toString(),
                RidgeInference.pythonExecutable("", "Linux"));
    }

    @Test void configuredPathOverridesPlatformDefault() {
        assertEquals(Path.of("custom environment/python.exe").toAbsolutePath().normalize().toString(),
                RidgeInference.pythonExecutable("custom environment/python.exe", "Windows 11"));
    }
}
