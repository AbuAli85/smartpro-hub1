// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateConnection, mockCaptureException, mockIsInitialized } = vi.hoisted(() => ({
  mockCreateConnection: vi.fn(),
  mockCaptureException: vi.fn(),
  mockIsInitialized: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({ default: { createConnection: mockCreateConnection } }));
vi.mock("@sentry/node", () => ({
  captureException: mockCaptureException,
  isInitialized: mockIsInitialized,
}));

import {
  runPendingMigrations,
  getMigrationError,
  _resetMigrationErrorForTesting,
} from "./runPendingMigrations";

beforeEach(() => {
  vi.clearAllMocks();
  _resetMigrationErrorForTesting();
  vi.unstubAllEnvs();
});

describe("getMigrationError() — no-op paths", () => {
  it("returns null before any run", () => {
    expect(getMigrationError()).toBeNull();
  });

  it("returns null when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await runPendingMigrations();
    expect(getMigrationError()).toBeNull();
    expect(mockCreateConnection).not.toHaveBeenCalled();
  });
});

describe("getMigrationError() — error path", () => {
  it("stores the error and calls Sentry.captureException when connection throws", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@localhost/testdb");
    mockIsInitialized.mockReturnValue(true);
    mockCreateConnection.mockRejectedValue(new Error("ECONNREFUSED: connection refused"));

    await runPendingMigrations();

    const captured = getMigrationError();
    expect(captured).toBeInstanceOf(Error);
    expect(captured?.message).toBe("ECONNREFUSED: connection refused");

    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ECONNREFUSED: connection refused" }),
      expect.objectContaining({ tags: { subsystem: "migrations" } }),
    );
  });

  it("wraps non-Error thrown values into an Error", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@localhost/testdb");
    mockIsInitialized.mockReturnValue(true);
    mockCreateConnection.mockRejectedValue("plain string error");

    await runPendingMigrations();

    const captured = getMigrationError();
    expect(captured).toBeInstanceOf(Error);
    expect(captured?.message).toBe("plain string error");
  });

  it("skips Sentry when Sentry is not initialised", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@localhost/testdb");
    mockIsInitialized.mockReturnValue(false);
    mockCreateConnection.mockRejectedValue(new Error("DB down"));

    await runPendingMigrations();

    expect(getMigrationError()?.message).toBe("DB down");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
