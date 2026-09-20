const app = document.getElementById("app");

const state = {
  me: null,
  guilds: [],
  guildId: "",
  members: [],
  roles: [],
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
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
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
    h("h1", {}, "Rolebot"),
    h("p", {}, "Click a member, then click roles to give or take them instantly."),
    h("label", { for: "password" }, "Dashboard password"),
    h("input", { id: "password", name: "password", type: "password", autocomplete: "current-password", required: true }),
    h("div", { style: "height:14px" }),
    h("button", { class: "btn", type: "submit" }, "Open dashboard"),
    h("div", { class: "error" }, state.error),
  ]);
  app.replaceChildren(h("div", { class: "login-wrap" }, h("div", { class: "card" }, form)));
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
            h("div", {}, "Rolebot"),
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
      h("div", { class: "layout" }, [
        h("aside", { class: "sidebar" }, [
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
        ]),
        h("main", { class: "main" }, selected
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
    const [members, roles] = await Promise.all([
      api(`/api/guilds/${state.guildId}/members?q=${encodeURIComponent(state.query)}`),
      api(`/api/guilds/${state.guildId}/roles`),
    ]);
    state.members = members.members;
    state.roles = roles.roles;
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
