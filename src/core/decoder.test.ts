import { describe, expect, it } from "vitest";
import { decodeMqtt, describeDecode } from "./decoder";
import { padDisplayId } from "./padState";
import type { RawMqttMessage } from "./types";

function msg(topic: string, payload: string): RawMqttMessage {
  return { receivedAtMs: 1, topic, payload, qos: 0, retain: false };
}

describe("decoder", () => {
  it("decodes PAD identity, state and battery from proximity/3", () => {
    const decoded = decodeMqtt(
      msg(
        "strata/v1/proximity/3/317924",
        '[3,1790046162,317924,2147512547,"1.3.198",0,0,0,0,0,0,4.20,0,0,0,0,0,7]',
      ),
    );
    expect(decoded.parseError).toBeNull();
    expect(decoded.pad?.displayId).toBe(28899);
    expect(padDisplayId(2147512536)).toBe(28888);
    expect(decoded.pad?.stateCode).toBe(0);
    expect(decoded.pad?.firmware).toBe("1.3.198");
    expect(decoded.pad?.batteryV).toBeCloseTo(4.2);
    expect(decoded.fields.find((field) => field.name === "stateCode")?.confidence).toBe("validated");
    expect(decoded.unmapped.map((item) => item.index)).toEqual([6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]);
  });

  it("decodes parking brake release from proximity/1 input 2", () => {
    const decoded = decodeMqtt(
      msg("strata/v1/proximity/1/311933", "[1,1790051029,311933,2,2,1,0,0,0,0,0,0,0,0,0,1,7]"),
    );
    expect(decoded.controllerStatus?.input1).toBe(1);
    expect(decoded.controllerStatus?.parkingBrakeRelease).toBe(0);
    expect(describeDecode(decoded)).toContain("brake=0");
  });

  it("decodes generator identity without naming electrical health", () => {
    const decoded = decodeMqtt(
      msg(
        "strata/v1/proximity/0/311933",
        '[0,1790050882,311933,312864,"2.3.10",100,100,100,916480,64,1073595120]',
      ),
    );
    expect(decoded.generator?.generatorId).toBe(312864);
    expect(decoded.generator?.firmware).toBe("2.3.10");
    expect(JSON.stringify(decoded.fields)).not.toMatch(/low voltage|comm/i);
    expect(decoded.unmapped.some((item) => item.value === 100)).toBe(true);
  });

  it("keeps undecodable payloads as raw evidence", () => {
    const decoded = decodeMqtt(msg("strata/v1/custom/9", "not-json"));
    expect(decoded.parseError).toBeTruthy();
    expect(decoded.unmapped[0]?.value).toBe("not-json");
    expect(decoded.topicKind).toBe("unknown");
  });

  it("reads controller firmware and generator slots from proximity/21", () => {
    const decoded = decodeMqtt(
      msg(
        "strata/v1/proximity/21/311933",
        '[21,1790050882,311933,"2.6.9",0,1,100,100,100,1,1,312860,312864,312847,312853,999]',
      ),
    );
    expect(decoded.controllerInfo?.firmware).toBe("2.6.9");
    expect(decoded.unmapped.find((item) => item.index === 11)?.value).toBe(312860);
    expect(decoded.fields.some((item) => item.name === "generatorIds")).toBe(false);
  });
});
