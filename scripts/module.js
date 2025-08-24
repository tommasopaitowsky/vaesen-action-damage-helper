// Vaesen – Action & Damage Helper (v0.2.8)
// PC: tick condition boxes + set isBroken (conteggio corretto delle box tickabili)
// NPC/Vaesen: (1) activate condition Items (system.active) → (2) numeric fallback → (3) flags
//             + setting per fermarsi quando le condizioni sono esaurite (warning)
// Chat: "Apply Damage" sotto alla card; resiliente ai re-render; i18n con fallback

const MODID = "vaesen-action-damage-helper";
const DEBUG_ADH = false;

/* ============ Utils ============ */
function get(obj, path, fallback = undefined) {
  try { return path.split(".").reduce((o, k) => (o && k in o) ? o[k] : undefined, obj) ?? fallback; }
  catch { return fallback; }
}
function dbg(...a) { if (DEBUG_ADH) console.debug(`[${MODID}]`, ...a); }
function uiWarn(msg) { ui.notifications?.warn(`[${MODID}] ${msg}`); }
function uiInfo(msg) { ui.notifications?.info(`[${MODID}] ${msg}`); }
/** i18n con fallback: evita chiavi grezze a schermo */
function safeLabel(key, fallbackIt, fallbackEn) {
  try {
    const loc = (game.i18n?.localize?.(key) ?? "").trim();
    if (loc && loc !== key) return loc;
  } catch {}
  const lang = (game.i18n?.lang ?? "en").toLowerCase();
  return lang.startsWith("it") ? fallbackIt : fallbackEn;
}
const L = (key, en, it) => safeLabel(key, it, en);

/* ============ Settings ============ */
function registerSettings() {
  game.settings.register(MODID, "damageMode", {
    name: L("VAESEN_ADH.Settings.DamageMode.Name", "Damage Mode (PC)", "Modalità Danno (PG)"),
    hint: L("VAESEN_ADH.Settings.DamageMode.Hint", "For PCs: 'conditions' ticks boxes; 'numeric' uses flags counter.", "Per i PG: 'condizioni' spunta caselle; 'numerico' usa i flags come contatore."),
    scope: "world", config: true, type: String,
    choices: {
      "conditions": L("VAESEN_ADH.Settings.DamageMode.Choices.Conditions", "Conditions (states + broken)", "Condizioni (states + broken)"),
      "numeric":    L("VAESEN_ADH.Settings.DamageMode.Choices.Numeric",    "Numeric (flags)",             "Numerico (flags)")
    },
    default: "conditions"
  });

  // PC paths
  game.settings.register(MODID, "targetPathPhysical", {
    name: L("VAESEN_ADH.Settings.TargetPathPhysical.Name", "PC – Physical conditions path (states)", "PG – Path condizioni FISICHE (states)"),
    hint: L("VAESEN_ADH.Settings.TargetPathPhysical.Hint", "e.g., system.condition.physical.states", "Es.: system.condition.physical.states"),
    scope: "world", config: true, type: String, default: "system.condition.physical.states"
  });
  game.settings.register(MODID, "targetPathMental", {
    name: L("VAESEN_ADH.Settings.TargetPathMental.Name", "PC – Mental conditions path (states)", "PG – Path condizioni MENTALI (states)"),
    hint: L("VAESEN_ADH.Settings.TargetPathMental.Hint", "e.g., system.condition.mental.states", "Es.: system.condition.mental.states"),
    scope: "world", config: true, type: String, default: "system.condition.mental.states"
  });
  game.settings.register(MODID, "brokenPathPhysical", {
    name: L("VAESEN_ADH.Settings.BrokenPathPhysical.Name", "PC – Physical isBroken path", "PG – Path FISICO isBroken"),
    hint: L("VAESEN_ADH.Settings.BrokenPathPhysical.Hint", "e.g., system.condition.physical.isBroken", "Es.: system.condition.physical.isBroken"),
    scope: "world", config: true, type: String, default: "system.condition.physical.isBroken"
  });
  game.settings.register(MODID, "brokenPathMental", {
    name: L("VAESEN_ADH.Settings.BrokenPathMental.Name", "PC – Mental isBroken path", "PG – Path MENTALE isBroken"),
    hint: L("VAESEN_ADH.Settings.BrokenPathMental.Hint", "e.g., system.condition.mental.isBroken", "Es.: system.condition.mental.isBroken"),
    scope: "world", config: true, type: String, default: "system.condition.mental.isBroken"
  });

  game.settings.register(MODID, "conditionsPreferBoolean", {
    name: L("VAESEN_ADH.Settings.ConditionsPreferBoolean.Name", "PC – Tick boolean boxes (states)", "PG – Spunta caselle booleane (states)"),
    hint: L("VAESEN_ADH.Settings.ConditionsPreferBoolean.Hint", "If enabled, PCs use boolean condition boxes.", "Se attivo, i PG usano caselle booleane."),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "conditionObjectBoolKey", {
    name: L("VAESEN_ADH.Settings.ConditionObjectBoolKey.Name", "PC – Boolean key inside states", "PG – Chiave booleana dentro le states"),
    hint: L("VAESEN_ADH.Settings.ConditionObjectBoolKey.Hint", "Primary key for object states (default: isChecked).", "Chiave primaria per gli oggetti in states (default: isChecked)."),
    scope: "world", config: true, type: String, default: "isChecked"
  });

  // NPC/Vaesen: Items + numeric fallback
  game.settings.register(MODID, "npcUseConditionItems", {
    name: L("VAESEN_ADH.Settings.NpcUseConditionItems.Name", "NPC/Vaesen – Use condition Items", "Vaesen/NPC – Usa Item condizione"),
    hint: L("VAESEN_ADH.Settings.NpcUseConditionItems.Hint", "Before numeric tracks, activate condition Items (system.active).", "Prima dei tracciati numerici, attiva le condizioni come Item (system.active)."),
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODID, "npcConditionActivePath", {
    name: L("VAESEN_ADH.Settings.NpcConditionActivePath.Name", "NPC – Item active path", "NPC – Path attivazione sull'Item"),
    hint: L("VAESEN_ADH.Settings.NpcConditionActivePath.Hint", "Boolean path on Item (default: system.active).", "Percorso booleano sull'Item (default: system.active)."),
    scope: "world", config: true, type: String, default: "system.active"
  });
  game.settings.register(MODID, "npcNumericPhysicalCandidates", {
    name: L("VAESEN_ADH.Settings.NpcNumericPhysicalCandidates.Name", "NPC/Vaesen – Physical numeric candidates (CSV)", "Vaesen/NPC – Candidati numerici FISICO (CSV)"),
    hint: L("VAESEN_ADH.Settings.NpcNumericPhysicalCandidates.Hint", "Examples: system.health.value, system.toughness.value", "Esempi: system.health.value, system.toughness.value"),
    scope: "world", config: true, type: String,
    default: "system.health.value,system.toughness.value,system.attributes.health.value"
  });
  game.settings.register(MODID, "npcNumericMentalCandidates", {
    name: L("VAESEN_ADH.Settings.NpcNumericMentalCandidates.Name", "NPC/Vaesen – Mental numeric candidates (CSV)", "Vaesen/NPC – Candidati numerici MENTALE (CSV)"),
    hint: L("VAESEN_ADH.Settings.NpcNumericMentalCandidates.Hint", "Add a path if your sheet has a mental track.", "Aggiungi un path se il tuo sheet ha un track mentale."),
    scope: "world", config: true, type: String,
    default: "system.mental.value,system.attributes.mental.value"
  });

  // Nuova: stop su esaurimento condizioni NPC
  game.settings.register(MODID, "npcStopWhenNoConditions", {
    name: L("VAESEN_ADH.Settings.NpcStopWhenNoConditions.Name",
            "NPC/Vaesen – Stop when no conditions left",
            "Vaesen/NPC – Fermati se non restano condizioni"),
    hint: L("VAESEN_ADH.Settings.NpcStopWhenNoConditions.Hint",
            "If enabled, when all condition Items are active the module warns and stops (no numeric fallback).",
            "Se attivo, quando tutte le condizioni (Item) sono attive il modulo avvisa e si ferma (niente fallback numerico)."),
    scope: "world", config: true, type: Boolean, default: true
  });

  // Chat
  game.settings.register(MODID, "chatButtonSelector", {
    name: L("VAESEN_ADH.Settings.ChatButtonSelector.Name", "Chat selector (Apply Damage)", "Selettore chat (Applica Danno)"),
    hint: L("VAESEN_ADH.Settings.ChatButtonSelector.Hint", "CSS selector for the chat card container.", "Selettore CSS del contenitore della chat card."),
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
  const cls = mimicBtn ? mimicBtn.className : "button";
  const $btn = $(`<button type="button" class="${cls} ${MODID}-apply-dmg">${labelApply()}</button>`);
  $btn.css({
    display: "block",
    margin: "0.25rem auto",      // centrato
    textAlign: "center",
    font: "inherit"
  });
  $btn.on("click", () => openDamageDialog(msg));
  return $btn;
}
function injectButtonIntoMessage($li, msg) {
  if (!$li?.length) return;
  if ($li.find(`button.${MODID}-apply-dmg`).length) return;

  let $host = $li.find(".message-content .card-buttons").last();
  if (!$host.length) $host = $li.find(".message-content").last();
  if (!$host.length) $host = $li;

  const mimic = $host.find("button, a.button, a.btn").first()[0];
  const $apply = buildApplyButton(msg, mimic);
  $host.append($apply);

  dbg("inject", { id: msg?.id, host: $host[0]?.className || $host[0]?.nodeName, mimicClass: mimic?.className });
}
Hooks.on("renderChatMessage", (msg, html) => {
  try { injectButtonIntoMessage(html, msg); } catch (e) { console.error(`[${MODID}] renderChatMessage`, e); }
});
Hooks.on("updateChatMessage", (msg) => {
  try {
    requestAnimationFrame(() => {
      const $li = ui.chat?.element?.find(`li.chat-message[data-message-id="${msg.id}"]`);
      if ($li?.length) injectButtonIntoMessage($li, msg);
    });
  } catch (e) { console.error(`[${MODID}] updateChatMessage`, e); }
});
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
    $log.children("li.chat-message").each((_, li) => {
      const $li = $(li);
      const id = $li.attr("data-message-id");
      const msg = id ? game.messages?.get(id) : null;
      if (msg) injectButtonIntoMessage($li, msg);
    });
  }
});
Hooks.on("ready", () => {
  const $log = ui.chat?.element?.find("ol#chat-log, .chat-log")?.first();
  if ($log?.length) attachChatLogObserver($log);
});

/* ============ Damage Dialog (HTML string, compat v13) ============ */
async function openDamageDialog(_chatMessage) {
  const defender = canvas?.tokens?.controlled?.[0]?.actor ?? null;

  const content = `
<form>
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
  </div>
</form>`.trim();

  new Dialog({
    title: safeLabel("VAESEN_ADH.Dialog.Title", "Applica Danno (Vaesen)", "Apply Damage (Vaesen)"),
    content,
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

/* ---------- PC helpers ---------- */
// Raccoglie SOLO le box tickabili (che contengono almeno una chiave booleana tra candidateKeys)
function collectTickableBoxes(states, candidateKeys) {
  const boxes = [];
  const pushIfTickable = (node, path) => {
    if (!node || typeof node !== "object") return;
    const key = candidateKeys.find(k => typeof node[k] === "boolean");
    if (key) boxes.push({ path, key, checked: !!node[key] });
  };
  if (Array.isArray(states)) {
    states.forEach((node, i) => pushIfTickable(node, i));
  } else if (states && typeof states === "object") {
    Object.keys(states).forEach(k => pushIfTickable(states[k], k));
  }
  return boxes;
}

/* ---------- PC: states + broken (usando collectTickableBoxes) ---------- */
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
  const data = actor.toObject();
  const states = get(data, statesPath);

  if (states === undefined || mode === "numeric" || !preferBool) {
    return applyDamageToFlags(actor, n, { isMental });
  }

  const boxes = collectTickableBoxes(states, candidateKeys);
  if (!boxes.length) {
    return applyDamageToFlags(actor, n, { isMental });
  }

  let left = n;
  const next = foundry.utils.duplicate(states);

  for (const b of boxes) {
    if (left <= 0) break;
    if (!b.checked) {
      if (Array.isArray(next)) next[b.path][b.key] = true;
      else next[b.path][b.key] = true;
      left--;
    }
  }

  await actor.update({ [statesPath]: next });

  // Ricalcola e valuta Broken solo sulle box tickabili
  const updated = get(actor.toObject(), statesPath);
  const boxesAfter = collectTickableBoxes(updated, candidateKeys);
  const total = boxesAfter.length;
  const marked = boxesAfter.filter(b => b.checked).length;

  if (total > 0 && marked >= total) {
    await actor.update({ [brokenPath]: true });
    uiInfo(safeLabel("VAESEN_ADH.Info.Broken", `${actor.name} è Broken.`, `${actor.name} is Broken.`));
  }

  if (left > 0) {
    uiWarn(safeLabel(
      "VAESEN_ADH.Warn.NoMoreBoxes",
      `${n-left}/${n} caselle spuntate; non ce ne sono altre.`,
      `${n-left}/${n} boxes ticked; no more available.`
    ));
  }
}

/* ---------- NPC / Vaesen ---------- */
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
  const stopOnExhaust = game.settings.get(MODID, "npcStopWhenNoConditions");

  if (game.settings.get(MODID, "npcUseConditionItems")) {
    const activePath = (game.settings.get(MODID, "npcConditionActivePath") || "system.active").trim();

    const allCond = actor.items.filter(isVaesenConditionItem);
    const inactive = allCond.filter(it => {
      const docActive = !!get(it, activePath);
      const rawActive = !!get((it.toObject?.() ?? {}), activePath);
      return !(docActive || rawActive);
    });

    if (inactive.length > 0) {
      const slice = inactive.slice(0, n);
      const updates = slice.map(it => ({ _id: it.id, [activePath]: true }));
      await actor.updateEmbeddedDocuments("Item", updates);

      const activated = updates.length;
      const left = n - activated;

      if (left > 0) {
        if (stopOnExhaust) {
          uiWarn(safeLabel(
            "VAESEN_ADH.Warn.NoMoreBoxes",
            `${activated}/${n} condizioni attivate; non ne restano altre.`,
            `${activated}/${n} conditions activated; no more available.`
          ));
          return;
        }
        return applyDamageToNPCNumeric(actor, left, { isMental });
      }
      return; // tutto il danno assorbito da condizioni
    }

    if (stopOnExhaust) {
      uiWarn(safeLabel(
        "VAESEN_ADH.Warn.NoMoreBoxes",
        `0/${n} condizioni attivate; non ne restano altre.`,
        `0/${n} conditions activated; no more available.`
      ));
      return;
    }
  }

  // fallback numerico
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

/* ---------- Flags fallback ---------- */
async function applyDamageToFlags(actor, n, { isMental }) {
  const key = isMental ? "mental" : "physical";
  const path = `flags.${MODID}.${key}.ticks`;
  const cur = Number(get(actor.toObject(), path, 0)) || 0;
  await actor.update({ [path]: cur + n });
  const kind = (isMental ? safeLabel("VAESEN_ADH.Mental", "mentali", "mental") : safeLabel("VAESEN_ADH.Physical", "fisiche", "physical"));
  uiInfo(`${actor.name}: +${n} ${kind} (flags).`);
}

/* ============ Init/Ready ============ */
Hooks.once("init", registerSettings);
Hooks.once("ready", () => console.log(`${MODID} | Ready`));