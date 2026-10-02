// Changes that must not change what the card concludes: additional wire fields, records shifting
// between pages while a collection is read, and the order robots or rooms are reported in.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../fixtures/voi/wire.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

test("unknown wire fields change only the unknown-field inventory", async () => {
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { normalizeRoom } = await import("../../src/domain/rooms.js");
  const { cases, seed } = propertyRun("METAMORPHIC", 240, "voc-metamorphic-v2");
  checkGenerated({
    name: "additive fields",
    cases,
    seed,
    generate: (random, index) => ({ field: `future_${random.integer(1000)}`, job: W.wireJob({ job_id: `job-${index}`, passes: 1 + random.integer(10) }), room: W.wireRoom({ room_id: `room-${index}` }) }),
    verify({ field, job, room }) {
      for (const [normalize, wire] of [[normalizeJob, job], [normalizeRoom, room]]) {
        const { unknownFields: before, ...known } = normalize(wire);
        const { unknownFields: after, ...extended } = normalize({ ...wire, [field]: { opaque: true } });
        assert.deepEqual(extended, known);
        assert.deepEqual(after, [...before, field]);
      }
    },
  });
});

// The loader is asynchronous, so this property runs its own seeded loop.
test("a record shifting between pages is kept once and nothing is lost", async () => {
  const { loadRooms } = await import("../../src/backend/scopes.js");
  const { seededRandom } = require("./seeded-random.js");
  const { cases, seed } = propertyRun("METAMORPHIC", 120, "voc-metamorphic-v2");
  const random = seededRandom(seed);
  for (let index = 0; index < cases; index += 1) {
    const rooms = Array.from({ length: 1 + random.integer(250) }, (_, n) => W.wireRoom({ room_id: `room-${n}` }));
    let calls = 0;
    const transport = {
      ws: async (message) => {
        calls += 1;
        const { offset, limit } = message.parameters;
        // After the first page a new room appears at the front: every later page shifts by one.
        const list = calls === 1 ? rooms : [W.wireRoom({ room_id: "room-new" }), ...rooms];
        return { ok: true, data: W.wirePage("rooms", list.slice(offset, offset + limit), { total: list.length, offset, limit }) };
      },
    };
    const ids = (await loadRooms(transport)).data.items.map((room) => room.roomId);
    assert.equal(new Set(ids).size, ids.length, `seed=${seed} case=${index}: a duplicate`);
    for (const room of rooms) assert.ok(ids.includes(room.room_id), `seed=${seed} case=${index}: ${room.room_id} lost`);
  }
});

test("the order robots are reported in does not change which rooms are reached or the setup verdict", async () => {
  const { normalizeRobot } = await import("../../src/domain/robots.js");
  const { normalizeRoom } = await import("../../src/domain/rooms.js");
  const { setupStatus, coveredRoomIds } = await import("../../src/application/setup-status.js");
  const { cases, seed } = propertyRun("METAMORPHIC", 240, "voc-metamorphic-v2");
  checkGenerated({
    name: "robot order",
    cases,
    seed: seed ^ 0x9e3779b9,
    generate(random, index) {
      const robots = Array.from({ length: random.integer(5) }, (_, n) => {
        const targets = Object.fromEntries(Array.from({ length: random.integer(4) }, () => [`room-${random.integer(6)}`, ["1"]]));
        return W.wireRobot({ robot_id: `robot-${index}-${n}`, capabilities: random.boolean() ? { targets } : null });
      });
      const rooms = Array.from({ length: 6 }, (_, n) => W.wireRoom({ room_id: `room-${n}`, enabled: random.integer(5) !== 0 }));
      return { robots, rooms };
    },
    verify({ robots, rooms }) {
      const normalizedRooms = rooms.map(normalizeRoom);
      const forward = robots.map(normalizeRobot);
      const backward = [...forward].reverse();
      assert.deepEqual([...coveredRoomIds(forward)].sort(), [...coveredRoomIds(backward)].sort());
      const one = setupStatus({ robots: forward, rooms: normalizedRooms, queueTotal: 0, openJobs: [] });
      const other = setupStatus({ robots: backward, rooms: normalizedRooms, queueTotal: 0, openJobs: [] });
      assert.deepEqual(JSON.parse(JSON.stringify(one)), JSON.parse(JSON.stringify(other)));
    },
  });
});
