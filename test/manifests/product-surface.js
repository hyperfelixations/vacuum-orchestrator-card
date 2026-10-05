"use strict";
// The one hand-written statement of what the card offers. The product-surface contract test
// holds the source to it, so a new option, view, language or vocabulary word is a deliberate
// change here and in the public README, never a silent one.

module.exports = Object.freeze({
  languages: ["en", "de"],
  views: ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"],
  viewOptions: {
    setup: [],
    queue: ["show_active", "show_attention", "show_templates"],
    rooms: ["sort", "show_disabled"],
    robots: ["show_map", "show_capabilities"],
    templates: [],
    history: ["source"],
    diagnostics: ["show_trace"],
    settings: [],
  },
  modes: ["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"],
  states: ["queued", "dispatching", "running", "canceling", "completed", "failed", "cancelled", "needs_attention"],
  actions: ["create_job", "update_job", "delete_job", "move_job", "start_job", "cancel_job", "retry_job", "run_queue", "pause_queue", "resume_queue"],
  commands: ["configure_queue", "create_room", "update_room", "disable_room", "enable_room", "release_room", "revoke_room", "add_robot", "configure_robot", "remove_robot", "resolve_recovery", "save_template", "remove_template", "create_job_from_template", "reset_template_demand"],
  queries: ["get_rooms", "get_room", "get_robots", "get_robot_candidates", "get_templates", "get_history", "get_trace", "get_diagnostics", "get_job_execution"],
  topLevelKeys: ["title", "subtitle", "icon", "accent_line", "language", "show", "views", "start_view", "page_size", "time_format", "confirm_destructive"],
  showKeys: ["accent_line", "icon", "title", "subtitle", "pill", "warnings", "panel", "queue_controls", "unavailable_views", "tabs"],
});
