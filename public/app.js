const app = document.getElementById("app");

const state = {
  appName: "Zyntra Bot",
  me: null,
  guilds: [],
  guildId: "",
  members: [],
  roles: [],
  channels: [],
  page: "roles",
  messageMode: "text",
  channelId: "",
  selected: null,
  query: "",
  error: "",
  toast: "",
  loading: false,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "html") el.innerHTML = value;
    else if (value === false || value == null) continue;
    else el.setAttribute(key, value === true ? "" : value);
  }
  const appendChild = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(appendChild);
      return;
    }
    el.append(child.nodeType ? child : document.createTextNode(child));
  };
  appendChild(children);
  return el;
}

function renderLogin() {
  const form = h("form", {
    onSubmit: async (e) => {
      e.preventDefault();
      state.error = "";
      const password = e.target.password.value;
      try {
        await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
        await boot();
      } catch (err) {
        state.error = err.message;
        render();
      }
    },
  }, [
    h("h1", {}, `${state.appName} Dashboard`),
    h("p", {}, "Manage server roles and send channel messages from one dashboard."),
    h("label", { for: "password" }, "Dashboard password"),
    h("input", { id: "password", name: "password", type: "password", autocomplete: "current-password", required: true }),
    h("div", { style: "height:14px" }),
    h("button", { class: "btn", type: "submit" }, "Open dashboard"),
    h("div", { class: "error" }, state.error),
  ]);
  app.replaceChildren(h("div", { class: "login-wrap" }, h("div", { class: "card" }, form)));
}

function renderMessagesPage() {
  return h("form", {
    class: "message-form",
    onSubmit: async (e) => {
      e.preventDefault();
      const fields = e.target.elements;
      const message = state.messageMode === "text" ? fields.namedItem("message").value.trim() : "";
      if (!state.channelId || (state.messageMode === "text" && !message)) return;
      const payload = { message };
      if (state.messageMode === "embed") {
        payload.embed = {
          title: fields.namedItem("embedTitle").value.trim(),
          description: fields.namedItem("embedDescription").value.trim(),
          url: fields.namedItem("embedUrl").value.trim(),
          thumbnail: fields.namedItem("embedThumbnail").value.trim(),
          image: fields.namedItem("embedImage").value.trim(),
          color: fields.namedItem("embedColor").value.trim(),
        };
      }
      state.loading = true;
      state.toast = "";
      render();
      try {
        await api(`/api/guilds/${state.guildId}/channels/${state.channelId}/messages`, {
          method: "POST", body: JSON.stringify(payload),
        });
        state.toast = state.messageMode === "embed" ? "Embed sent." : "Message sent.";
      } catch (err) {
        state.toast = err.message;
      } finally {
        state.loading = false;
        render();
      }
    },
  }, [
    h("h2", {}, "Send a message"),
    h("p", { class: "hint" }, "Send a regular message or build a rich Discord embed."),
    h("div", { class: "mode-toggle" }, [
      h("button", { class: `btn${state.messageMode === "text" ? "" : " ghost"}`, type: "button", onClick: () => { state.messageMode = "text"; render(); } }, "Text message"),
      h("button", { class: `btn${state.messageMode === "embed" ? "" : " ghost"}`, type: "button", onClick: () => { state.messageMode = "embed"; render(); } }, "Embed builder"),
    ]),
    h("label", { for: "message-channel", style: "margin-top:18px" }, "Channel"),
    h("select", { id: "message-channel", required: true, onChange: (e) => { state.channelId = e.target.value; } }, [
      h("option", { value: "", selected: !state.channelId, disabled: true }, "Choose a channel"),
      ...state.channels.map((channel) => h("option", { value: channel.id, selected: channel.id === state.channelId }, `# ${channel.name}`)),
    ]),
    state.messageMode === "embed"
      ? [
          h("label", { for: "embed-title", style: "margin-top:18px" }, "Embed title"),
          h("input", { id: "embed-title", name: "embedTitle", maxlength: "256", placeholder: "Official website", required: true }),
          h("label", { for: "embed-url", style: "margin-top:16px" }, "Website URL shown under the title (optional)"),
          h("input", { id: "embed-url", name: "embedUrl", type: "url", placeholder: "https://example.com" }),
          h("label", { for: "embed-description", style: "margin-top:16px" }, "Message inside the embed (optional)"),
          h("textarea", { id: "embed-description", name: "embedDescription", maxlength: "4096", rows: "3", placeholder: "Write the message that should appear inside the card…" }),
          h("div", { class: "embed-two-col" }, [
            h("div", {}, [
              h("label", { for: "embed-thumbnail" }, "Small thumbnail URL (optional)"),
              h("input", { id: "embed-thumbnail", name: "embedThumbnail", type: "url", placeholder: "https://example.com/logo.png" }),
            ]),
            h("div", {}, [
              h("label", { for: "embed-image" }, "Large banner image URL (optional; shown wide)"),
              h("input", { id: "embed-image", name: "embedImage", type: "url", placeholder: "https://example.com/banner.png" }),
            ]),
          ]),
          h("label", { for: "embed-color", style: "margin-top:16px" }, "Accent color (optional)"),
          h("input", { id: "embed-color", name: "embedColor", placeholder: "#e60026", value: "#e60026", pattern: "#?[0-9a-fA-F]{6}" }),
          h("p", { class: "hint embed-hint" }, "Image links must be public http or https URLs. The bot needs Embed Links permission in the channel."),
        ]
      : [
          h("label", { for: "message-content", style: "margin-top:18px" }, "Message"),
          h("textarea", { id: "message-content", name: "message", maxlength: "2000", rows: "6", placeholder: "Write your message…", required: true }),
        ],
    h("div", { class: "message-actions" }, [
      h("span", { class: "hint" }, "Mentions in the message won’t ping anyone."),
      h("button", { class: "btn", type: "submit", disabled: state.loading || !state.channels.length }, state.loading ? "Sending…" : state.messageMode === "embed" ? "Send embed" : "Send message"),
    ]),
  ]);
}

function renderDash() {
  const selected = state.members.find((m) => m.id === state.selected);

  const memberButtons = state.members.map((member) =>
    h("button", {
      class: `member${member.id === state.selected ? " active" : ""}`,
      onClick: () => {
        state.selected = member.id;
        render();
      },
    }, [
      h("img", { src: member.avatar, alt: "" }),
      h("div", {}, [
        h("div", { class: "name" }, member.displayName),
        h("div", { class: "sub" }, `@${member.username}${member.bot ? " · bot" : ""}`),
      ]),
    ])
  );

  const roleButtons = selected
    ? state.roles.map((role) => {
        const on = selected.roleIds.includes(role.id);
        return h("button", {
          class: `role${on ? " on" : ""}`,
          style: `--role:${role.color}`,
          disabled: !role.assignable || state.loading,
          title: role.assignable ? (on ? "Click to remove" : "Click to give") : "Bot cannot assign this role",
          onClick: () => toggleRole(selected, role, !on),
        }, `${on ? "● " : ""}${role.name}`);
      })
    : [];

  app.replaceChildren(
    h("div", { class: "shell" }, [
      h("header", { class: "topbar" }, [
        h("div", { class: "brand" }, [
          state.me?.bot?.avatar ? h("img", { src: state.me.bot.avatar, alt: "" }) : null,
          h("div", {}, [
            h("div", {}, `${state.appName} Dashboard`),
            h("div", { class: "hint", style: "margin:0" }, state.me?.bot?.tag || "Dashboard"),
          ]),
        ]),
        h("div", { style: "display:flex;gap:10px;align-items:center;min-width:260px" }, [
          h("select", {
            onChange: (e) => {
              state.guildId = e.target.value;
              state.selected = null;
              loadGuild();
            },
          }, state.guilds.map((g) => h("option", { value: g.id, selected: g.id === state.guildId }, g.name))),
          h("button", {
            class: "btn ghost",
            onClick: async () => {
              await api("/api/logout", { method: "POST" });
              state.me = null;
              render();
            },
          }, "Log out"),
        ]),
      ]),
      h("nav", { class: "dashboard-nav" }, [
        h("button", { class: `btn${state.page === "roles" ? "" : " ghost"}`, onClick: () => { state.page = "roles"; render(); } }, "Roles"),
        h("button", { class: `btn${state.page === "messages" ? "" : " ghost"}`, onClick: () => { state.page = "messages"; render(); } }, "Send a message"),
        h("button", { class: `btn${state.page === "moderation" ? "" : " ghost"}`, onClick: () => { state.page = "moderation"; render(); } }, "Moderation"),
      ]),
      h("div", { class: "layout", style: state.page === "messages" ? "grid-template-columns:1fr" : "" }, [
        ["roles", "moderation"].includes(state.page) ? h("aside", { class: "sidebar" }, [
          h("input", {
            type: "search",
            placeholder: "Search members…",
            value: state.query,
            onInput: (e) => {
              state.query = e.target.value;
            },
            onKeydown: (e) => {
              if (e.key === "Enter") loadGuild();
            },
          }),
          h("button", { class: "btn", onClick: loadGuild }, "Search"),
          h("div", { class: "member-list" }, memberButtons.length ? memberButtons : h("div", { class: "hint" }, "No members loaded.")),
        ]) : null,
        h("main", { class: "main" }, state.page === "messages"
          ? renderMessagesPage()
          : state.page === "moderation"
          ? selected
            ? [
                h("form", {
                  class: "message-form moderation-form",
                  onSubmit: async (e) => {
                    e.preventDefault();
                    const action = e.target.elements.namedItem("action").value;
                    const durationMinutes = Number(e.target.elements.namedItem("durationMinutes").value);
                    const reason = e.target.elements.namedItem("reason").value.trim();
                    if (["ban", "kick"].includes(action) && !window.confirm(`Are you sure you want to ${action} ${selected.displayName}?`)) return;
                    state.loading = true;
                    state.toast = "";
                    render();
                    try {
                      const result = await api(`/api/guilds/${state.guildId}/members/${selected.id}/moderation`, {
                        method: "POST",
                        body: JSON.stringify({ action, durationMinutes, reason }),
                      });
                      state.toast = result.message;
                      if (result.removed) {
                        state.members = state.members.filter((member) => member.id !== selected.id);
                        state.selected = null;
                      }
                    } catch (err) {
                      state.toast = err.message;
                    } finally {
                      state.loading = false;
                      render();
                    }
                  },
                }, [
                  h("h2", {}, `Moderate ${selected.displayName}`),
                  h("p", { class: "hint" }, "Ban and kick remove a member from the server. Mute applies a Discord timeout."),
                  h("label", { for: "moderation-action" }, "Action"),
                  h("select", { id: "moderation-action", name: "action", required: true }, [
                    h("option", { value: "mute", selected: true }, "Mute (timeout)"),
                    h("option", { value: "unmute" }, "Unmute (remove timeout)"),
                    h("option", { value: "kick" }, "Kick from server"),
                    h("option", { value: "ban" }, "Ban from server"),
                  ]),
                  h("label", { for: "moderation-duration", style: "margin-top:16px" }, "Mute duration (used for Mute only)"),
                  h("select", { id: "moderation-duration", name: "durationMinutes" }, [
                    h("option", { value: "10", selected: true }, "10 minutes"),
                    h("option", { value: "60" }, "1 hour"),
                    h("option", { value: "1440" }, "1 day"),
                    h("option", { value: "10080" }, "7 days"),
                    h("option", { value: "40320" }, "28 days"),
                  ]),
                  h("label", { for: "moderation-reason", style: "margin-top:16px" }, "Reason (optional)"),
                  h("input", { id: "moderation-reason", name: "reason", maxlength: "450", placeholder: "Reason for this action" }),
                  h("div", { class: "message-actions" }, [
                    h("span", { class: "hint" }, "The bot can only moderate members below its highest role."),
                    h("button", { class: "btn", type: "submit", disabled: state.loading }, state.loading ? "Working…" : "Apply action"),
                  ]),
                ]),
                h("section", { class: "command-reference" }, [
                  h("h3", {}, "Use commands in Discord"),
                  h("p", {}, "When prefix commands are enabled, moderators can use:"),
                  h("pre", {}, "*help\n*ban USER_ID [reason]\n*kick USER_ID [reason]\n*mute USER_ID [10m] [reason]\n*unmute USER_ID [reason]"),
                  h("p", { class: "hint" }, "You can use a member ID or @mention. Commands require the matching Discord permission. Bans stay until manually removed. Mute defaults to 10 minutes; durations can be 30s, 10m, 2h, or 1d (up to 28 days)."),
                ]),
              ]
            : h("div", { class: "empty" }, "Pick someone on the left to moderate." )
          : selected
          ? [
              h("div", { class: "person" }, [
                h("img", { src: selected.avatar, alt: "" }),
                h("div", {}, [
                  h("h2", { style: "margin:0" }, selected.displayName),
                  h("div", { class: "hint", style: "margin:6px 0 0" }, "Click a role to give or take it. Green ring = they have it."),
                ]),
              ]),
              h("div", { class: "roles" }, roleButtons),
            ]
          : h("div", { class: "empty" }, "Pick someone on the left.")),
      ]),
      state.toast ? h("div", { class: "toast" }, state.toast) : null,
    ])
  );
}

async function toggleRole(member, role, assigned) {
  state.loading = true;
  state.toast = "";
  render();
  try {
    const data = await api(
      `/api/guilds/${state.guildId}/members/${member.id}/roles/${role.id}`,
      { method: "PUT", body: JSON.stringify({ assigned }) }
    );
    const idx = state.members.findIndex((m) => m.id === member.id);
    if (idx >= 0) state.members[idx] = data.member;
  } catch (err) {
    state.toast = err.message;
    setTimeout(() => {
      state.toast = "";
      render();
    }, 4000);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadGuild() {
  if (!state.guildId) return;
  try {
    const [members, roles, channels] = await Promise.all([
      api(`/api/guilds/${state.guildId}/members?q=${encodeURIComponent(state.query)}`),
      api(`/api/guilds/${state.guildId}/roles`),
      api(`/api/guilds/${state.guildId}/channels`),
    ]);
    state.members = members.members;
    state.roles = roles.roles;
    state.channels = channels.channels;
    if (!state.channels.some((channel) => channel.id === state.channelId)) state.channelId = "";
    if (state.selected && !state.members.some((m) => m.id === state.selected)) {
      state.selected = null;
    }
    render();
  } catch (err) {
    state.toast = err.message;
    render();
  }
}

function render() {
  if (!state.me) renderLogin();
  else renderDash();
}

async function boot() {
  try {
    const status = await api("/api/status");
    state.appName = status.name || state.appName;
    document.title = `${state.appName} Dashboard`;
    const me = await api("/api/me");
    const guilds = await api("/api/guilds");
    state.me = me;
    state.guilds = guilds.guilds;
    state.guildId = state.guilds[0]?.id || "";
    render();
    if (state.guildId) await loadGuild();
  } catch (err) {
    if (err.status === 401) {
      state.me = null;
      renderLogin();
      return;
    }
    state.error = err.message;
    renderLogin();
  }
}

boot();
