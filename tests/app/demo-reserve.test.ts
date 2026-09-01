import { describe, expect, it } from "vitest";
import {
  RESERVE_MAX_BODY_BYTES,
  filterReservationFields,
  handleDemoReserve,
  readRequestBodyWithLimit,
} from "@/lib/demo/reserve-handler";

describe("/api/demo/reserve", () => {
  it("rejects bodies larger than 8 KB with 413", async () => {
    const oversized = "x".repeat(RESERVE_MAX_BODY_BYTES + 1);
    const response = await handleDemoReserve(
      new Request("http://localhost/api/demo/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: oversized }),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("filters unknown fields and caps echoed values", async () => {
    const response = await handleDemoReserve(
      new Request("http://localhost/api/demo/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ada",
          email: "ada@example.com",
          evil: "<script>alert(1)</script>",
          notes: "n".repeat(500),
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; echoed: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.echoed).toEqual({
      name: "Ada",
      email: "ada@example.com",
      notes: "n".repeat(200),
    });
    expect(body.echoed.evil).toBeUndefined();
  });

  it("rejects when Content-Length exceeds the cap before reading the body", async () => {
    const read = await readRequestBodyWithLimit(
      new Request("http://localhost/api/demo/reserve", {
        method: "POST",
        headers: { "content-length": String(RESERVE_MAX_BODY_BYTES + 100) },
        body: "tiny",
      }),
      RESERVE_MAX_BODY_BYTES,
    );
    expect(read.ok).toBe(false);
  });
});

describe("filterReservationFields", () => {
  it("keeps only known reservation keys", () => {
    expect(filterReservationFields({ name: "Ada", extra: "drop" })).toEqual({ name: "Ada" });
  });
});
