"use strict";
// The three sections that read rather than command: history, rooms and robots, driven through
// the real card against both capability profiles. Boundary: what reaches the DOM and what the
// card refuses to invent; the projections themselves are unit tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

test("the history lists finished jobs with their result and duration", async () => {
  const mounted = await mountCard({
    env,
    config: { sections: ["history"], time_format: "absolute" },
    seed: {
      jobs: [
        { job_id: "job-ok", name: "Hall", areas: ["hall"], mode: "vacuum", state: "completed", started_at: "2026-09-17T00:00:00Z", finished_at: "2026-09-17T00:26:00Z" },
        { job_id: "job-bad", name: "Bath", areas: ["bathroom"], mode: "mop", state: "failed", failure_code: "robot_needs_attention" },
      ],
    },
  });
  const rows = [...mounted.root.querySelectorAll(".voc-history-section .voc-job-row")];
  assert.deepEqual(rows.map((row) => row.dataset.jobId), ["job-ok", "job-bad"]);
  assert.match(rows[0].textContent, /26 min/);
  // A failure code reaches the user as a sentence, never as the raw code.
  assert.match(rows[1].textContent, /The robot needs attention\./);
  assert.doesNotMatch(rows[1].textContent, /robot_needs_attention/);
  mounted.unmount();
});

test("a finished job can be created again from the history", async () => {
  const mounted = await mountCard({
    env,
    config: { sections: ["history"] },
    seed: { jobs: [{ job_id: "job-ok", areas: ["hall"], mode: "vacuum", state: "completed" }] },
  });
  await mounted.click(".voc-history-section .voc-job-action-retry");
  assert.deepEqual(mounted.serviceCalls("retry_job")[0].data, { job_id: "job-ok" });
  mounted.unmount();
});

test("rooms show the backend's freshness evidence and the entities that block a room", async () => {
  const mounted = await mountCard({
    env,
    profile: "target",
    config: { sections: ["rooms"], time_format: "absolute" },
    seed: {
      areas: [
        {
          area_id: "kitchen",
          last_vacuumed_at: "2026-09-16T10:00:00Z",
          last_mopped_at: "2026-09-15T10:00:00Z",
          vacuum_due_at: "2026-09-18T10:00:00Z",
          mop_due_at: "2026-09-19T10:00:00Z",
          due_state: "clean",
          release_entity_id: "input_boolean.kitchen_release",
          blocking_entity_ids: ["binary_sensor.door"],
          open_job_ids: [],
        },
      ],
    },
    hass: {
      states: {
        "input_boolean.kitchen_release": { entity_id: "input_boolean.kitchen_release", state: "on", attributes: { friendly_name: "Kitchen released" } },
        "binary_sensor.door": { entity_id: "binary_sensor.door", state: "off", attributes: { friendly_name: "Hall door" } },
      },
    },
  });
  const row = mounted.root.querySelector('.voc-room-row[data-room-id="kitchen"]');
  assert.ok(row);
  assert.match(row.textContent, /Last vacuumed/);
  assert.match(row.textContent, /Last mopped/);
  assert.match(row.querySelector(".voc-room-blockers").textContent, /Hall door/);
  const release = row.querySelector('[data-action="toggle-release"]');
  assert.equal(release.getAttribute("role"), "switch");
  assert.equal(release.getAttribute("aria-checked"), "true");
  mounted.unmount();
});

test("the release switch asks Home Assistant to toggle the entity the backend named", async () => {
  const mounted = await mountCard({
    env,
    profile: "target",
    config: { sections: ["rooms"] },
    // The response guard accepts only the complete area record, so the seed states all of it.
    seed: {
      areas: [
        {
          area_id: "kitchen",
          last_vacuumed_at: null,
          last_mopped_at: null,
          vacuum_due_at: null,
          mop_due_at: null,
          due_state: "unknown",
          release_entity_id: "input_boolean.kitchen_release",
          blocking_entity_ids: [],
          open_job_ids: [],
        },
      ],
    },
    hass: { states: { "input_boolean.kitchen_release": { entity_id: "input_boolean.kitchen_release", state: "off", attributes: {} } } },
  });
  await mounted.click('[data-action="toggle-release"]');
  // The card asks the generic domain, so it works for every toggleable release entity.
  const call = mounted.hass.calledServices.at(-1);
  assert.equal(call.domain, "homeassistant");
  assert.equal(call.service, "toggle");
  // The payload comes from the card's realm, so compare its fields, not the object.
  assert.equal(call.data.entity_id, "input_boolean.kitchen_release");
  mounted.unmount();
});

test("a robot shows its state, its capabilities and the job it is on", async () => {
  const mounted = await mountCard({
    env,
    profile: "target",
    config: { sections: ["robots"] },
    seed: {
      jobs: [{ job_id: "job-run", name: "Living room", areas: ["kitchen"], mode: "vacuum", state: "running" }],
      robots: [
        {
          robot_id: "robot-1",
          name: "Robot 1",
          adapter: "fake",
          vacuum_entity_id: "vacuum.fake",
          availability: "busy",
          battery_percentage: 61,
          active_job_id: "job-run",
          active_area_id: "kitchen",
          blocked_reason: "Dust bin is full",
          allowed_area_ids: ["kitchen", "hall"],
          map_image_entity_id: null,
          capabilities: { operations: ["vacuum"], max_passes: 2, pass_scope: "target_set", vacuum_levels: ["high"], water_levels: [], mop_routes: [], cancel: true },
        },
      ],
    },
  });
  const card = mounted.root.querySelector('.voc-robot-card[data-robot-id="robot-1"]');
  assert.equal(card.querySelector(".voc-robot-availability").textContent, "Busy");
  assert.match(card.textContent, /61/);
  // The job is named, never shown as its identifier.
  assert.match(card.textContent, /Living room/);
  assert.doesNotMatch(card.textContent, /job-run/);
  assert.match(card.querySelector(".voc-robot-blocked").textContent, /Dust bin is full/);
  assert.deepEqual([...card.querySelectorAll(".voc-robot-chip")].map((chip) => chip.textContent), ["Vacuum", "Kitchen", "Hall"]);
  mounted.unmount();
});

test("the robot map is shown only when the backend names an image and the option allows it", async () => {
  const robots = [
    {
      robot_id: "robot-1",
      name: "Robot 1",
      adapter: "fake",
      vacuum_entity_id: "vacuum.fake",
      availability: "available",
      battery_percentage: 50,
      active_job_id: null,
      active_area_id: null,
      blocked_reason: null,
      allowed_area_ids: [],
      map_image_entity_id: "image.robot_map",
      capabilities: { operations: ["vacuum"], max_passes: 1, pass_scope: "target_set", vacuum_levels: [], water_levels: [], mop_routes: [], cancel: true },
    },
  ];
  const hass = { states: { "image.robot_map": { entity_id: "image.robot_map", state: "idle", attributes: { entity_picture: "/api/image_proxy/image.robot_map" } } } };

  const shown = await mountCard({ env, profile: "target", config: { sections: ["robots"] }, seed: { robots }, hass });
  const image = shown.root.querySelector(".voc-robot-map");
  assert.equal(image.getAttribute("src"), "/api/image_proxy/image.robot_map");
  assert.equal(image.getAttribute("loading"), "lazy");
  assert.ok(image.getAttribute("alt"));
  shown.unmount();

  const hidden = await mountCard({
    env,
    profile: "target",
    config: { sections: [{ type: "robots", options: { show_map: false } }] },
    seed: { robots },
    hass,
  });
  assert.equal(hidden.root.querySelector(".voc-robot-map"), null);
  hidden.unmount();
});

test("without their capability the three sections name what the backend does not offer", async () => {
  const mounted = await mountCard({ env, config: { sections: ["rooms", "robots", "history"] }, seed: { jobs: JOBS } });
  for (const [section, message] of [
    ["rooms", "Room data is not provided by the backend."],
    ["robots", "Robot data is not provided by the backend."],
  ]) {
    await mounted.click(`[role=tab][data-section="${section}"]`);
    assert.equal(mounted.text(".voc-unavailable"), message, section);
  }
  // Today's backend does serve the job registry, so the history is not degraded.
  await mounted.click('[role=tab][data-section="history"]');
  assert.equal(mounted.root.querySelector(".voc-unavailable"), null);
  mounted.unmount();
});

// The history has its own paging, and it must ask for history pages rather than queue pages.
test("paging in the history asks the backend for the next registry page", async () => {
  const jobs = Array.from({ length: 9 }, (_, index) => ({
    job_id: `job-${index}`,
    name: `Job ${index}`,
    areas: ["hall"],
    mode: "vacuum",
    state: "completed",
  }));
  const mounted = await mountCard({ env, config: { sections: ["history"], page_size: 5 }, seed: { jobs } });
  const rows = () => [...mounted.root.querySelectorAll(".voc-history-section .voc-job-row")].map((row) => row.dataset.jobId);
  assert.equal(rows().length, 5);

  await mounted.click('.voc-history-section [data-action="load-more"]');
  assert.equal(rows().length, 4, "the last page is as long as what is left");
  assert.equal(mounted.text(".voc-history-section .voc-page-status"), "2 / 2");

  await mounted.click('.voc-history-section [data-action="load-previous"]');
  assert.equal(mounted.text(".voc-history-section .voc-page-status"), "1 / 2");
  mounted.unmount();
});

// A release the backend names but Home Assistant does not know is shown, not acted on.
test("a release switch without a usable entity changes nothing", async () => {
  const mounted = await mountCard({
    env,
    profile: "target",
    config: { sections: ["rooms"] },
    seed: {
      areas: [
        {
          area_id: "kitchen",
          last_vacuumed_at: null,
          last_mopped_at: null,
          vacuum_due_at: null,
          mop_due_at: null,
          due_state: "unknown",
          release_entity_id: "input_boolean.gone",
          blocking_entity_ids: [],
          open_job_ids: [],
        },
      ],
    },
  });
  const toggle = mounted.root.querySelector('[data-action="toggle-release"]');
  assert.equal(toggle.getAttribute("aria-disabled"), "true", "an unknown entity cannot be switched");
  await mounted.click(toggle);
  assert.equal(mounted.hass.calledServices.filter((call) => call.service === "toggle").length, 0);
  mounted.unmount();
});
