// Vaesen – Action & Damage Helper (v0.2.3)
// PG: spunta condition.states + set isBroken
// NPC/Vaesen: 1) attiva Item-condizioni (type "condition" o flag isCondition; toggla system.active)
//             2) altrimenti riduce un campo numerico (health/toughness) configurabile
//             3) ultimo fallback: flags del modulo
// Chat: bottone "Applica Danno" sotto a "Push", allineato in colonna

const MODID = "vaesen-action-damage-helper";

/* ============ Utils ============ */
function get(obj, path, fallback = undefined) {
  return path.split(".").reduce((o, k) => (o && k in o) ? o[k] : undefined, obj) ?? fallback;
}
function uiWarn(msg) { ui.notifications?.warn(`[${MODID}] ${msg}`); }
function uiInfo(msg) { ui.notifications?.info(`[${MODID}] ${msg}`); }
function dbg(...a) { console.debug(`[${MODID}]`, ...a); }

/* ============ Settings ============ */
function registerSettings() {
  game.settings.register(MODID, "damageMode", {
    name: "Modalità Danno (PG)",
    hint: "Per i PG: 'conditions' spunta caselle; 'numeric' usa flags come contatore.",
    scope: "world", config: true, type: String,
    choices: { "conditions": "Condizioni (states + broken)", "numeric": "Numerico (flags)" },
    default: "conditions"
  });

  // PG paths
  game.settings.register(MODID, "targetPathPhysical", {
    name: "PG – Path condizioni FISICHE (states)",
    scope: "world", config: true, type: String,
    default: "system.condition.physical.states"
  });
  game.settings.register(MODID, "targetPathMental", {
    name: "PG – Path condizioni MENTALI (states)",
    scope: "world", config: true, type: String,
    default: "system.condition.mental.states"
  });
  game.settings.register(MODID, "brokenPathPhysical", {
    name: "PG – Path FISICO isBroken",
    scope: "world", config: true, type: String,
    default: "system.condition.physical.isBroken"
  });
  game.settings.register(MODID, "brokenPathMental", {
    name: "PG – Path MENTALE isBroken",
    scope: "world", config: true, type: String,
    default: "system.condition.mental.isBroken"
  });

  game.settings.register(MODID, "conditionsPreferBoolean", {
    name: "PG – Spunta caselle booleane (states)",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "conditionObjectBoolKey", {
    name: "Chiave booleana nelle states (PG)",
    scope: "world", config: true, type: String, default: "isChecked"
  });

  // NPC/Vaesen: Item condizione
  game.settings.register(MODID, "npcUseConditionItems", {
    name: "Vaesen/NPC – usa Item condizione",
    hint: "Prima di scalare campi numerici, attiva condizioni rappresentate come Item (system.active).",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "npcConditionActivePath", {
    name: "NPC – path attivazione condizione",
    hint: "Percorso booleano sull'Item per attivare la condizione (default: system.active).",
    scope: "world", config: true, type: String, default: "system.active"
  });

  // NPC/Vaesen: fallback numerico
  game.settings.register(MODID, "npcNumericPhysicalCandidates", {
    name: "Vaesen/NPC – candidati FISICO (CSV)",
    hint: "Esempi: system.health.value, system.toughness.value",
    scope: "world", config: true, type: String,
    default: "system.health.value,system.toughness.value,system.attributes.health.value"
  });
  game.settings.register(MODID, "npcNumericMentalCandidates", {
    name: "Vaesen/NPC – candidati MENTALE (CSV)",
    scope: "world", config: true, type: String,
    default: "system.mental.value,system.attributes.mental.value"
  });

  // Chat
  game.settings.register(MODID, "chatButtonSelector", {
    name: "Selettore chat (Applica Danno)",
    scope: "client", config: true, type: String, default: ".message .message-content"
  });
}

/* ============ Pulsante “Applica Danno” sotto a Push (colonna allineata) ============ */
Hooks.on("renderChatMessage", (msg, html) => {
  if (html.find(`button.${MODID}-apply-dmg`).length) return;

  const pushBtn =
    html.find('button[data-action="push"]').last()[0] ||
    html.find('button[aria-label*="Push" i]').last()[0] ||
    html.find('button:contains("Push")').last()[0] ||
    null;

  function buildApplyButtonLike(btnToMimic) {
    const cls = btnToMimic ? btnToMimic.className : "";
    const $btn = $(`<button type="button" class="${cls} ${MODID}-apply-dmg">Applica Danno</button>`);
    // Colonna allineata sotto Push
    $btn.css({ display: "block", marginTop: "0.25rem" });
    $btn.on("click", () => openDamageDialog(msg));
    return $btn;
  }

  if (pushBtn) {
    const $apply = buildApplyButtonLike(pushBtn);
    $(pushBtn).after($apply); // subito sotto Push
    return;
  }

  // Fallback se non esiste Push in questa carta
  const host = html.find(".message-content .card-buttons").last().length ? html.find(".message-content .card-buttons").last() : html;
  const anyBtn = host.find("button").first()[0];
  const $apply = buildApplyButtonLike(anyBtn);
  host.append($apply);
});

/* ============ Damage Dialog ============ */
async function openDamageDialog(_chatMessage) {
  const defender = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  const dlgData = { baseDamage: 1, extraToDamage: 0, isMental: false };

  const html = await renderTemplate(`modules/${MODID}/templates/damage-dialog.hbs`, dlgData);

  new Dialog({
    title: "Applica Danno (Vaesen)",
    content: html,
    buttons: {
      apply: {
        label: "Applica",
        callback: async (dlgHtml) => {
          const base = Number(dlgHtml.find('input[name="baseDamage"]').val() || 0);
          const extra = Number(dlgHtml.find('input[name="extraToDamage"]').val() || 0);
          const isMental = dlgHtml.find('input[name="isMental"]').is(":checked");

          const tokens = canvas?.tokens?.controlled?.length ? canvas.tokens.controlled : (defender ? [defender.token] : []);
          if (!tokens?.length) return uiWarn("Seleziona almeno un bersaglio.");

          for (const tkn of tokens) await applyDamageToActor(tkn.actor, base + extra, { isMental });
          uiInfo("Danno applicato.");
        }
      },
      cancel: { label: "Annulla" }
    },
    default: "apply"
  }).render(true);
}

/* ============ Applica Danno: PG vs NPC ============ */
async function applyDamageToActor(actor, amount, { isMental = false } = {}) {
  const n = Number(amount) || 0;
  if (n <= 0) return;

  const isPC = actor?.type === "character" || actor?.type === "player";
  if (isPC) return applyDamageToPC(actor, n, { isMental });
  else return applyDamageToNPC(actor, n, { isMental });
}

/* ---------- PG: spunta states + set broken ---------- */
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
  if (left > 0) uiWarn(`${actor.name}: finite le caselle (${n - left}/${n} spuntate).`);
}

/* ---------- NPC / Vaesen: priorità a Item-condizioni ---------- */

// Riconosce un Item-condizione Vaesen in modo robusto
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
  // 1) Prova ad attivare Item-condizioni (system.active: true)
  if (game.settings.get(MODID, "npcUseConditionItems")) {
    const activePath = (game.settings.get(MODID, "npcConditionActivePath") || "system.active").trim();

    const allCond = actor.items.filter(isVaesenConditionItem);
    const inactive = allCond.filter(it => {
      const docActive = !!get(it, activePath);
      const rawActive = !!get((it.toObject?.() ?? {}), activePath);
      return !(docActive || rawActive);
    });

    dbg("Vaesen cond-items", {
      total: allCond.length,
      inactive: inactive.map(i => ({ id: i.id, name: i.name, active: get(i, activePath) }))
    });

    if (inactive.length > 0) {
      const slice = inactive.slice(0, n);
      const updates = slice.map(it => ({ _id: it.id, [activePath]: true })); // es.: {"system.active": true}
      await actor.updateEmbeddedDocuments("Item", updates);
      uiInfo(`${actor.name}: attivata${updates.length > 1 ? "e" : ""} ${updates.length} condizion${updates.length > 1 ? "i" : "e"}.`);

      const left = n - updates.length;
      if (left > 0) return applyDamageToNPCNumeric(actor, left, { isMental });
      return;
    }
    // Se non ci sono condizioni inattive → numerico
  }

  // 2) Fallback: riduci un campo numerico
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
      uiInfo(`${actor.name}: ${cur} → ${next} (${path})`);
      return;
    }
  }

  // 3) Ultimo fallback: flags
  return applyDamageToFlags(actor, n, { isMental });
}

/* ---------- Broken helper (solo PG) ---------- */
async function maybeSetBroken(actor, statesPath, brokenPath, keys) {
  const st = get(actor.toObject(), statesPath);
  let total = 0, marked = 0;

  const isTrue = node => node && typeof node === "object" && keys.some(k => node[k] === true);

  if (Array.isArray(st)) {
    total = st.length;
    marked = st.filter(isTrue).length;
  } else if (st && typeof st === "object") {
    const vals = Object.values(st);
    total = vals.length;
    marked = vals.filter(isTrue).length;
  }

  if (total > 0 && marked >= total) {
    await actor.update({ [brokenPath]: true });
    uiInfo(`${actor.name} è Broken.`);
  }
}

/* ---------- Fallback su flags ---------- */
async function applyDamageToFlags(actor, n, { isMental }) {
  const key = isMental ? "mental" : "physical";
  const path = `flags.${MODID}.${key}.ticks`;
  const cur = Number(get(actor.toObject(), path, 0)) || 0;
  await actor.update({ [path]: cur + n });
  uiInfo(`${actor.name}: +${n} ${isMental ? "mentali" : "fisiche"} (flags).`);
}

/* ============ Avvio ============ */
Hooks.once("init", registerSettings);
Hooks.once("ready", () => console.log(`${MODID} | Ready`));