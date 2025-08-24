// Vaesen – Action & Damage Helper (v0.2.6)
// PC: tick condition boxes + set isBroken
// NPC/Vaesen: (1) activate condition Items (system.active) → (2) numeric fallback → (3) flags
// Chat: "Apply Damage" under Push; resilient to rerenders (Push, theme DOM changes)

const MODID = "vaesen-action-damage-helper";

/* ============ Utils ============ */
function get(obj, path, fallback = undefined) {
  try { return path.split(".").reduce((o, k) => (o && k in o) ? o[k] : undefined, obj) ?? fallback; }
  catch { return fallback; }
}
function t(key, data = {}) { try { return game.i18n.format(key, data); } catch { return key; } }
/** i18n con fallback: evita chiavi grezze a schermo */
function safeLabel(key, fallbackIt, fallbackEn) {
  const loc = (game.i18n?.localize?.(key) ?? "").trim();
  if (loc && loc !== key) return loc;
  const lang = (game.i18n?.lang ?? "en").toLowerCase();
  return lang.startsWith("it") ? fallbackIt : fallbackEn;
}
function uiWarn(msg) { ui.notifications?.warn(`[${MODID}] ${msg}`); }
function uiInfo(msg) { ui.notifications?.info(`[${MODID}] ${msg}`); }
function dbg(...a) { console.debug(`[${MODID}]`, ...a); }

/* ============ Settings ============ */
function registerSettings() {
  game.settings.register(MODID, "damageMode", {
    name: t("VAESEN_ADH.Settings.DamageMode.Name"),
    hint: t("VAESEN_ADH.Settings.DamageMode.Hint"),
    scope: "world", config: true, type: String,
    choices: {
      "conditions": t("VAESEN_ADH.Settings.DamageMode.Choices.Conditions"),
      "numeric": t("VAESEN_ADH.Settings.DamageMode.Choices.Numeric")
    },
    default: "conditions"
  });

  // PC paths
  game.settings.register(MODID, "targetPathPhysical", {
    name: t("VAESEN_ADH.Settings.TargetPathPhysical.Name"),
    hint: t("VAESEN_ADH.Settings.TargetPathPhysical.Hint"),
    scope: "world", config: true, type: String,
    default: "system.condition.physical.states"
  });
  game.settings.register(MODID, "targetPathMental", {
    name: t("VAESEN_ADH.Settings.TargetPathMental.Name"),
    hint: t("VAESEN_ADH.Settings.TargetPathMental.Hint"),
    scope: "world", config: true, type: String,
    default: "system.condition.mental.states"
  });
  game.settings.register(MODID, "brokenPathPhysical", {
    name: t("VAESEN_ADH.Settings.BrokenPathPhysical.Name"),
    hint: t("VAESEN_ADH.Settings.BrokenPathPhysical.Hint"),
    scope: "world", config: true, type: String,
    default: "system.condition.physical.isBroken"
  });
  game.settings.register(MODID, "brokenPathMental", {
    name: t("VAESEN_ADH.Settings.BrokenPathMental.Name"),
    hint: t("VAESEN_ADH.Settings.BrokenPathMental.Hint"),
    scope: "world", config: true, type: String,
    default: "system.condition.mental.isBroken"
  });

  game.settings.register(MODID, "conditionsPreferBoolean", {
    name: t("VAESEN_ADH.Settings.ConditionsPreferBoolean.Name"),
    hint: t("VAESEN_ADH.Settings.ConditionsPreferBoolean.Hint"),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "conditionObjectBoolKey", {
    name: t("VAESEN_ADH.Settings.ConditionObjectBoolKey.Name"),
    hint: t("VAESEN_ADH.Settings.ConditionObjectBoolKey.Hint"),
    scope: "world", config: true, type: String, default: "isChecked"
  });

  // NPC/Vaesen: Items + numeric fallback
  game.settings.register(MODID, "npcUseConditionItems", {
    name: t("VAESEN_ADH.Settings.NpcUseConditionItems.Name"),
    hint: t("VAESEN_ADH.Settings.NpcUseConditionItems.Hint"),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "npcConditionActivePath", {
    name: t("VAESEN_ADH.Settings.NpcConditionActivePath.Name"),
    hint: t("VAESEN_ADH.Settings.NpcConditionActivePath.Hint"),
    scope: "world", config: true, type: String, default: "system.active"
  });
  game.settings.register(MODID, "npcNumericPhysicalCandidates", {
    name: t("VAESEN_ADH.Settings.NpcNumericPhysicalCandidates.Name"),
    hint: t("VAESEN_ADH.Settings.NpcNumericPhysicalCandidates.Hint"),
    scope: "world", config: true, type: String,
    default: "system.health.value,system.toughness.value,system.attributes.health.value"
  });
  game.settings.register(MODID, "npcNumericMentalCandidates", {
    name: t("VAESEN_ADH.Settings.NpcNumericMentalCandidates.Name"),
    hint: t("VAESEN_ADH.Settings.NpcNumericMentalCandidates.Hint"),
    scope: "world", config: true, type: String,
    default: "system.mental.value,system.attributes.mental.value"
  });

  // Chat
  game.settings.register(MODID, "chatButtonSelector", {
    name: t("VAESEN_ADH.Settings.ChatButtonSelector.Name"),
    hint: t("VAESEN_ADH.Settings.ChatButtonSelector.Hint"),
    scope: "client", config: true, type: String, default: ".message .message-content"
  });
}

/* ============ Apply Damage: injector semplice e infallibile ============ */
function labelApply() {
  const loc = (game.i18n?.localize?.("VAESEN_ADH.UI.ApplyDamage") ?? "").trim();
  if (loc && loc !== "VAESEN_ADH.UI.ApplyDamage") return loc;
  return (game.i18n?.lang ?? "en").toLowerCase().startsWith("it") ? "Applica Danno" : "Apply Damage";
}

function buildApplyButton(msg, mimicBtn) {
  // Copia le classi del bottone di riferimento se c'è
  const cls = mimicBtn ? mimicBtn.className : "button";
  const $btn = $(`<button type="button" class="${cls} ${MODID}-apply-dmg">${labelApply()}</button>`);

  // CSS: centrato, con margine e font ereditato
  $btn.css({
    display: "block",
    margin: "0.25rem auto", // centrato orizzontalmente
    textAlign: "center",
    font: "inherit"
  });

  $btn.on("click", () => openDamageDialog(msg));
  return $btn;
}

function injectButtonIntoMessage($li, msg) {
  if (!$li?.length) return;
  if ($li.find(`button.${MODID}-apply-dmg`).length) return;

  // Host preferito: card-buttons; fallback: message-content; ultimissimo: il <li> stesso
  let $host = $li.find(".message-content .card-buttons").last();
  if (!$host.length) $host = $li.find(".message-content").last();
  if (!$host.length) $host = $li;

  // Prova a ereditare classi dal primo bottone presente (coerenza grafica)
  const mimic = $host.find("button").first()[0];

  const $apply = buildApplyButton(msg, mimic);
  $host.append($apply);
}

/* — Inserisci SEMPRE all’evento di render/update della singola card — */
Hooks.on("renderChatMessage", (msg, html) => {
  try { injectButtonIntoMessage(html, msg); } catch (e) { console.error(`[${MODID}] renderChatMessage`, e); }
});

Hooks.on("updateChatMessage", (msg) => {
  try {
    // attende il nuovo DOM dopo il Push
    requestAnimationFrame(() => {
      const $li = ui.chat?.element?.find(`li.chat-message[data-message-id="${msg.id}"]`);
      if ($li?.length) injectButtonIntoMessage($li, msg);
    });
  } catch (e) { console.error(`[${MODID}] updateChatMessage`, e); }
});

/* — Observer GLOBALE: ogni nuovo/ricostruito messaggio riceve il bottone — */
let __adhChatLogObserver = null;
function attachChatLogObserver($log) {
  if (!($log?.length) || __adhChatLogObserver) return;
  __adhChatLogObserver = new MutationObserver((mutList) => {
    for (const m of mutList) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const $n = $(n);
        if (!$n.is("li.chat-message")) continue;
        const id = $n.attr("data-message-id");
        const msg = id ? game.messages?.get(id) : null;
        if (msg) requestAnimationFrame(() => injectButtonIntoMessage($n, msg));
      }
    }
  });
  __adhChatLogObserver.observe($log[0], { childList: true, subtree: true });
}

Hooks.on("renderChatLog", (_app, html) => {
  const $log = html.find("ol#chat-log, .chat-log").first();
  if ($log?.length) {
    attachChatLogObserver($log);
    // pass iniziale su tutti i messaggi già presenti
    $log.children("li.chat-message").each((_, li) => {
      const $li = $(li);
      const id = $li.attr("data-message-id");
      const msg = id ? game.messages?.get(id) : null;
      if (msg) injectButtonIntoMessage($li, msg);
    });
  }
});

Hooks.on("ready", () => {
  // alcuni temi hanno già il log pronto prima di renderChatLog
  const $log = ui.chat?.element?.find("ol#chat-log, .chat-log")?.first();
  if ($log?.length) attachChatLogObserver($log);
});

/* ============ Damage Dialog ============ */
async function openDamageDialog(_chatMessage) {
  const defender = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  const dlg = document.createElement("form");
  dlg.innerHTML = `
    <div class="form-group">
      <label>${safeLabel("VAESEN_ADH.Dialog.BaseDamage", "Danno Base", "Base Damage")}</label>
      <input type="number" name="baseDamage" value="1"/>
    </div>
    <div class="form-group">
      <label>${safeLabel("VAESEN_ADH.Dialog.ExtraToDamage", "Successi extra in Danno", "Extra Successes to Damage")}</label>
      <input type="number" name="extraToDamage" value="0"/>
    </div>
    <div class="form-group">
      <label><input type="checkbox" name="isMental"/> ${safeLabel("VAESEN_ADH.Dialog.IsMental", "Danno Mentale", "Mental Damage")}</label>
    </div>`;

  new Dialog({
    title: safeLabel("VAESEN_ADH.Dialog.Title", "Applica Danno (Vaesen)", "Apply Damage (Vaesen)"),
    content: dlg,
    buttons: {
      apply: {
        label: safeLabel("VAESEN_ADH.UI.Apply", "Applica", "Apply"),
        callback: async (dlgHtml) => {
          const base = Number(dlgHtml.find('input[name="baseDamage"]').val() || 0);
          const extra = Number(dlgHtml.find('input[name="extraToDamage"]').val() || 0);
          const isMental = dlgHtml.find('input[name="isMental"]').is(":checked");
          const tokens = canvas?.tokens?.controlled?.length ? canvas.tokens.controlled : (defender ? [defender.token] : []);
          if (!tokens?.length) return uiWarn(safeLabel("VAESEN_ADH.Warn.SelectTarget", "Seleziona almeno un bersaglio.", "Select at least one target."));
          for (const tkn of tokens) await applyDamageToActor(tkn.actor, base + extra, { isMental });
          uiInfo(safeLabel("VAESEN_ADH.Info.DamageApplied", "Danno applicato.", "Damage applied."));
        }
      },
      cancel: { label: safeLabel("VAESEN_ADH.UI.Cancel", "Annulla", "Cancel") }
    },
    default: "apply"
  }).render(true);
}

/* ============ Apply Damage: PC vs NPC ============ */
async function applyDamageToActor(actor, amount, { isMental = false } = {}) {
  const n = Number(amount) || 0;
  if (n <= 0) return;
  const isPC = actor?.type === "character" || actor?.type === "player";
  if (isPC) return applyDamageToPC(actor, n, { isMental });
  else return applyDamageToNPC(actor, n, { isMental });
}

/* ---------- PC: states + broken ---------- */
async function applyDamageToPC(actor, n, { isMental }) {
  const mode = game.settings.get(MODID, "damageMode");
  const preferBool = game.settings.get(MODID, "conditionsPreferBoolean");
  const customKey = (game.settings.get(MODID, "conditionObjectBoolKey") || "").trim();
  const candidateKeys = customKey ? [customKey, "isChecked", "checked", "value", "active", "marked", "taken"]
                                  : ["isChecked", "checked", "value", "active", "marked", "taken"];

  const statesPath = isMental ? game.settings.get(MODID, "targetPathMental")
                              : game.settings.get(MODID, "targetPathPhysical");
  const brokenPath = isMental ? game.settings.get(MODID, "brokenPathMental")
                              : game.settings.get(MODID, "brokenPathPhysical");
  const states = get(actor.toObject(), statesPath);

  if (states === undefined) return applyDamageToFlags(actor, n, { isMental });
  if (mode === "numeric" || !preferBool) return applyDamageToFlags(actor, n, { isMental });

  let left = n, changed = false;
  const next = foundry.utils.duplicate(states);

  if (Array.isArray(next)) {
    for (const node of next) {
      if (left <= 0) break;
      if (node && typeof node === "object") {
        const k = candidateKeys.find(k => typeof node[k] === "boolean");
        if (k && !node[k]) { node[k] = true; left--; changed = true; }
      }
    }
  } else if (next && typeof next === "object") {
    for (const k of Object.keys(next)) {
      if (left <= 0) break;
      const node = next[k];
      const kk = candidateKeys.find(x => node && typeof node[x] === "boolean");
      if (kk && !node[kk]) { node[kk] = true; left--; changed = true; }
    }
  }

  if (changed) {
    await actor.update({ [statesPath]: next });
    await maybeSetBroken(actor, statesPath, brokenPath, candidateKeys);
  }
  if (left > 0) uiWarn(safeLabel("VAESEN_ADH.Warn.NoMoreBoxes", `${n-left}/${n} caselle spuntate; non ce ne sono altre.`, `${n-left}/${n} boxes ticked; no more available.`));
}

/* ---------- NPC / Vaesen: prefer condition Items ---------- */
function isVaesenConditionItem(it) {
  try {
    if (typeof it?.type === "string" && it.type.toLowerCase() === "condition") return true;
    if (it.getFlag?.("vaesen", "isCondition")) return true;
    const raw = it.toObject?.();
    if (raw?.isCondition === true) return true;
    if (get(raw, "flags.vaesen.isCondition") === true) return true;
  } catch (_) {}
  return false;
}

async function applyDamageToNPC(actor, n, { isMental }) {
  if (game.settings.get(MODID, "npcUseConditionItems")) {
    const activePath = (game.settings.get(MODID, "npcConditionActivePath") || "system.active").trim();
    const allCond = actor.items.filter(isVaesenConditionItem);
    const inactive = allCond.filter(it => {
      const docActive = !!get(it, activePath);
      const rawActive = !!get((it.toObject?.() ?? {}), activePath);
      return !(docActive || rawActive);
    });

    dbg("Vaesen cond-items", { total: allCond.length, inactive: inactive.map(i => ({ id: i.id, name: i.name })) });

    if (inactive.length > 0) {
      const slice = inactive.slice(0, n);
      const updates = slice.map(it => ({ _id: it.id, [activePath]: true }));
      await actor.updateEmbeddedDocuments("Item", updates);
      uiInfo(safeLabel("VAESEN_ADH.Info.ItemsActivated", `Attivate ${updates.length} condizioni.`, `${updates.length} condition(s) activated.`));
      const left = n - updates.length;
      if (left > 0) return applyDamageToNPCNumeric(actor, left, { isMental });
      return;
    }
  }
  return applyDamageToNPCNumeric(actor, n, { isMental });
}

async function applyDamageToNPCNumeric(actor, n, { isMental }) {
  const csv = isMental ? game.settings.get(MODID, "npcNumericMentalCandidates")
                       : game.settings.get(MODID, "npcNumericPhysicalCandidates");
  const candidates = String(csv || "").split(",").map(s => s.trim()).filter(Boolean);
  const data = actor.toObject();
  for (const path of candidates) {
    const cur = Number(get(data, path));
    if (Number.isFinite(cur)) {
      const next = Math.max(0, cur - n);
      await actor.update({ [path]: next });
      uiInfo(safeLabel("VAESEN_ADH.Info.NumericReduced", `${actor.name}: ${cur} → ${next} (${path})`, `${actor.name}: ${cur} → ${next} (${path})`));
      return;
    }
  }
  return applyDamageToFlags(actor, n, { isMental });
}

/* ---------- Broken helper (PC) ---------- */
async function maybeSetBroken(actor, statesPath, brokenPath, keys) {
  const st = get(actor.toObject(), statesPath);
  let total = 0, marked = 0;
  const isTrue = node => node && typeof node === "object" && keys.some(k => node[k] === true);

  if (Array.isArray(st)) { total = st.length; marked = st.filter(isTrue).length; }
  else if (st && typeof st === "object") { const vals = Object.values(st); total = vals.length; marked = vals.filter(isTrue).length; }

  if (total > 0 && marked >= total) {
    await actor.update({ [brokenPath]: true });
    uiInfo(safeLabel("VAESEN_ADH.Info.Broken", `${actor.name} è Broken.`, `${actor.name} is Broken.`));
  }
}

/* ---------- Flags fallback ---------- */
async function applyDamageToFlags(actor, n, { isMental }) {
  const key = isMental ? "mental" : "physical";
  const path = `flags.${MODID}.${key}.ticks`;
  const cur = Number(get(actor.toObject(), path, 0)) || 0;
  await actor.update({ [path]: cur + n });
  const kind = isMental ? safeLabel("VAESEN_ADH.Mental", "mentali", "mental") : safeLabel("VAESEN_ADH.Physical", "fisiche", "physical");
  uiInfo(safeLabel("VAESEN_ADH.Info.FlagsIncreased", `${actor.name}: +${n} ${kind} (flags).`, `${actor.name}: +${n} ${kind} (flags).`));
}

/* ============ Init/Ready ============ */
Hooks.once("init", registerSettings);
Hooks.once("ready", () => console.log(`${MODID} | Ready`));