const MODID = "vaesen-action-damage-helper";

/* ============ Utils ============ */
function get(obj, path, fallback=undefined) {
  return path.split(".").reduce((o,k)=> (o && k in o) ? o[k] : undefined, obj) ?? fallback;
}
async function set(obj, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let ref = obj;
  for (const p of parts) {
    if (!(p in ref)) ref[p] = {};
    ref = ref[p];
  }
  ref[last] = value;
}

function uiWarn(msg) { ui.notifications?.warn(`[${MODID}] ${msg}`); }
function uiInfo(msg) { ui.notifications?.info(`[${MODID}] ${msg}`); }

/* ============ Settings ============ */
function registerSettings() {
  game.settings.register(MODID, "blockIllegalActions", {
    name: "Blocca azioni oltre il consentito",
    hint: "Se attivo, non permette di segnare un'azione se hai già usato quelle disponibili.",
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MODID, "shortActionsPerTurn", {
    name: "Azioni Brevi per turno",
    scope: "world", config: true, type: Number, default: 1
  });

  // Mappatura danni
  game.settings.register(MODID, "damageMode", {
    name: "Modalità Danno",
    hint: "Scegli come applicare il danno: riduci un valore numerico (es. HP) oppure conta condizioni (incremento).",
    scope: "world", config: true, type: String, choices: {
      "numeric": "Numerico (sottrae un valore, es. HP)",
      "conditions": "Condizioni (incrementa un contatore)"
    }, default: "numeric"
  });

  game.settings.register(MODID, "targetPathPhysical", {
    name: "Path attributo FISICO",
    hint: "Path a puntini sull'attore bersaglio (es. system.hp.value oppure system.conditions.physical).",
    scope: "world", config: true, type: String, default: "system.hp.value"
  });

  game.settings.register(MODID, "targetPathMental", {
    name: "Path attributo MENTALE",
    hint: "Se usi danni mentali su campo diverso; altrimenti lascia uguale.",
    scope: "world", config: true, type: String, default: "system.hp.value"
  });

  game.settings.register(MODID, "chatButtonSelector", {
    name: "Selettore chat per aggiungere il pulsante",
    hint: "CSS selector del contenitore delle carte tiro/attacco. Lascia default se non sai.",
    scope: "client", config: true, type: String, default: ".message .message-content"
  });
}

/* ============ Action state per turno ============ */
function isCurrentCombatant(combatant) {
  const combat = game.combat;
  if (!combat) return false;
  return combat.turns[combat.turn]?.id === combatant?.id;
}

function defaultActionState() {
  return { longUsed: false, shortUsed: 0 };
}

async function resetActionsForTurn(combat) {
  const c = combat.turns[combat.turn];
  if (!c) return;
  await c.setFlag(MODID, "actions", defaultActionState());
}

async function markAction(combatant, type) {
  if (!combatant) return;
  const actions = foundry.utils.duplicate(await combatant.getFlag(MODID, "actions") || defaultActionState());

  const maxShort = game.settings.get(MODID, "shortActionsPerTurn");
  const block = game.settings.get(MODID, "blockIllegalActions");

  if (type === "long") {
    if (actions.longUsed && block) return uiWarn("Hai già usato l'Azione Lunga in questo turno.");
    actions.longUsed = true;
  } else {
    if (actions.shortUsed >= maxShort && block) return uiWarn("Hai già usato tutte le Azioni Brevi di questo turno.");
    actions.shortUsed = Math.min(maxShort, actions.shortUsed + 1);
  }
  await combatant.setFlag(MODID, "actions", actions);
  uiInfo(`Segnata ${type === "long" ? "Azione Lunga" : "Azione Breve"}.`);
}

/* ============ UI in Combat Tracker ============ */
Hooks.on("renderCombatTracker", (app, html) => {
  const combat = game.combat;
  if (!combat) return;
  const turn = combat.turns[combat.turn];
  if (!turn) return;

  const actions = turn.getFlag(MODID, "actions") || defaultActionState();
  const maxShort = game.settings.get(MODID, "shortActionsPerTurn");

  // Inserisce i pulsanti sotto l'intestazione del combattente attivo
  const header = html.find(".combatant.active .token-name, .combatant.active .directory-item .name").first();
  if (!header.length) return;

  // Evita duplicazioni
  if (html.find(`.${MODID}-actions-bar`).length) return;

  const bar = $(`
    <div class="${MODID}-actions-bar">
      <button type="button" class="vaesen-long">${actions.longUsed ? "Lunga ✓" : "Segna Lunga"}</button>
      <button type="button" class="vaesen-short">Breve ${actions.shortUsed}/${maxShort}</button>
    </div>
  `);
  bar.find(".vaesen-long").on("click", () => markAction(turn, "long").then(()=> app.render(true)));
  bar.find(".vaesen-short").on("click", () => markAction(turn, "short").then(()=> app.render(true)));
  header.parent().append(bar);
});

/* ============ Reset a ogni cambio turno ============ */
Hooks.on("updateCombat", (combat, changed) => {
  if (("turn" in changed) || ("round" in changed)) {
    resetActionsForTurn(combat);
  }
});

/* ============ Pulsante “Applica Danno” nelle chat ============ */
Hooks.on("renderChatMessage", (msg, html) => {
  const sel = game.settings.get(MODID, "chatButtonSelector");
  const host = html.find(sel);
  if (!host.length) return;

  // Evita duplicati
  if (html.find(`button.${MODID}-apply-dmg`).length) return;

  const btn = $(`<button class="${MODID}-apply-dmg">Applica Danno</button>`);
  btn.on("click", () => openDamageDialog(msg));
  host.append(btn);
});

/* ============ Damage Dialog ============ */
async function openDamageDialog(chatMessage) {
  // Prova a inferire attaccante e bersaglio dal messaggio / speaker
  const speaker = chatMessage.speaker || {};
  const attacker = speaker.actor ? game.actors.get(speaker.actor) : null;

  // Bersaglio: selezione token controllato (fallback)
  let defender = canvas?.tokens?.controlled?.[0]?.actor ?? null;

  const dlgData = {
    baseDamage: 1,
    extraToDamage: 0,
    isMental: false,
    attackerName: attacker?.name ?? "",
    defenderName: defender?.name ?? ""
  };

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
          if (!tokens?.length) return uiWarn("Seleziona almeno un bersaglio sul canvas.");

          for (const tkn of tokens) {
            await applyDamageToActor(tkn.actor, base + extra, { isMental });
          }
          uiInfo("Danno applicato.");
        }
      },
      cancel: { label: "Annulla" }
    },
    default: "apply"
  }).render(true);
}

async function applyDamageToActor(actor, amount, { isMental=false } = {}) {
  const mode = game.settings.get(MODID, "damageMode");
  const path = isMental ? game.settings.get(MODID, "targetPathMental")
                        : game.settings.get(MODID, "targetPathPhysical");

  const data = actor.toObject();
  const current = get(data, path);
  if (current === undefined) {
    return uiWarn(`Path non valido: ${path}`);
  }

  if (mode === "numeric") {
    const next = Math.max(0, Number(current) - Number(amount));
    await actor.update({ [path]: next });
  } else {
    // Modalità condizioni: incrementa di "amount"
    const next = Number(current) + Number(amount);
    await actor.update({ [path]: next });
  }
}

/* ============ Avvio ============ */
Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODID} | Init`);
});

Hooks.once("ready", async () => {
  if (game.combat && game.combat.turns?.length) await resetActionsForTurn(game.combat);
  console.log(`${MODID} | Ready`);
});
