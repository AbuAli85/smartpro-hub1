import { describe, expect, it } from "vitest";
import {
  buildProfileChangeQueueHref,
  DEFAULT_PROFILE_CHANGE_QUEUE_STATE,
  parseProfileChangeQueueSearch,
  PROFILE_CHANGE_QUEUE_PATH,
  serializeProfileChangeQueueState,
  type ProfileChangeQueueState,
} from "./profileChangeRequestQueueUrl";

describe("parseProfileChangeQueueSearch", () => {
  it("returns defaults for empty search", () => {
    expect(parseProfileChangeQueueSearch("")).toEqual(DEFAULT_PROFILE_CHANGE_QUEUE_STATE);
  });

  it("parses all supported params", () => {
    const s =
      "?status=all&fieldKey=other&ageBucket=gt_7d&query=hello&page=2";
    expect(parseProfileChangeQueueSearch(s)).toEqual({
      status: "all",
      fieldKey: "other",
      ageBucket: "gt_7d",
      query: "hello",
      page: 2,
    });
  });

  it("ignores invalid enum values", () => {
    expect(parseProfileChangeQueueSearch("?status=nope&fieldKey=bad")).toEqual({
      ...DEFAULT_PROFILE_CHANGE_QUEUE_STATE,
    });
  });

  it("truncates query length", () => {
    const long = "a".repeat(200);
    expect(parseProfileChangeQueueSearch(`?query=${encodeURIComponent(long)}`).query.length).toBe(120);
  });
});

describe("serializeProfileChangeQueueState + roundtrip", () => {
  it("omits defaults", () => {
    expect(serializeProfileChangeQueueState(DEFAULT_PROFILE_CHANGE_QUEUE_STATE)).toBe("");
  });

  it("roundtrips non-default state", () => {
    const state: ProfileChangeQueueState = {
      status: "all",
      fieldKey: "other",
      ageBucket: "lt_24h",
      query: "test",
      page: 3,
    };
    const qs = serializeProfileChangeQueueState(state);
    const back = parseProfileChangeQueueSearch(`?${qs}`);
    expect(back).toEqual(state);
  });
});

describe("buildProfileChangeQueueHref", () => {
  it("returns path only when default", () => {
    expect(buildProfileChangeQueueHref({})).toBe(PROFILE_CHANGE_QUEUE_PATH);
  });

  it("builds other filter link", () => {
    expect(buildProfileChangeQueueHref({ fieldKey: "other", status: "pending" })).toBe(
      `${PROFILE_CHANGE_QUEUE_PATH}?fieldKey=other`,
    );
  });
});
