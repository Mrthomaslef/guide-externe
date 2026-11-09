#!/usr/bin/env python3
"""
Génère les données hors-ligne (`data/externes_data.json` & `data/embedded_data.js`)
et extrait le moteur de résolution exact (`js/schedule_engine.js`) depuis `planning-interne`
afin que l'application Externes Radio B soit 100 % synchronisée (en ligne ET hors-ligne)
avec le planning officiel des internes & seniors de Radiologie B — Hôpital Cochin.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
PLANNING_INTERNE_DIR = Path("/Users/thomaslefevre/Documents/planning-interne")
SOURCE_JSON = PLANNING_INTERNE_DIR / "internes_data.json"
SOURCE_GENERATOR = PLANNING_INTERNE_DIR / "generate_internes_app.py"

WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxLGqUevVWi36mNQ7WNoY2uhRsYLdsG_gQcscMPkP1GcQEt0LgdhGIuzYL2SM-uTcPq/exec"
CLOUD_PROP_KEY = "cochin_internes_state_v1"
LIVE_INTERNES_JSON_URL = "https://mrthomaslef.github.io/agenda-internes/internes_data.json"


def fetch_live_cloud_state() -> dict | None:
    eval_code = f"""
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('{CLOUD_PROP_KEY}');
    return {{ cloudState: raw ? JSON.parse(raw) : null }};
    """
    try:
        req = urllib.request.Request(
            WEBHOOK_URL,
            data=json.dumps({"eval_code": eval_code}).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            return (res.get("evalResult") or {}).get("cloudState")
    except Exception as exc:
        print(f"[WARN] Impossible de joindre le cloud en direct ({exc}), conservation des données locales.")
        return None


def extract_schedule_engine() -> str:
    txt = SOURCE_GENERATOR.read_text(encoding="utf-8")

    s_merge = txt.index("function mergePresentationsList")
    e_merge = txt.index("function mergeMeetingsList")
    merge_pres_js = txt[s_merge:e_merge].strip()

    s_abs = txt.index("function normalizeAbsencesList")
    e_abs = txt.index("function markChefValidationStamp")
    merge_abs_js = txt[s_abs:e_abs].replace("let localMutationSeq = 0;", "").strip()

    s_sched = txt.index("const MANDATORY_WEEKLY_POSTES_MAP =")
    e_sched = txt.index("function computeStatsByInterne")
    sched_js = txt[s_sched:e_sched].strip()

    # Supprimer uniquement les 2 petites fonctions de rendu HTML non utilisées côté externes
    idx_render = sched_js.find("function renderPosteWithChefInitials")
    idx_recomp = sched_js.find("function recomputeScheduleInPlace")
    if idx_render != -1 and idx_recomp != -1 and idx_render < idx_recomp:
        sched_js = sched_js[:idx_render].rstrip() + "\n\n    " + sched_js[idx_recomp:]

    return f"""/* Auto-généré depuis planning-interne — Moteur de résolution strictement identique */
(function (global) {{
  "use strict";

  function getMondayOfWeek(isoDate) {{
    const parts = String(isoDate).split("-").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = dt.getDay();
    const diff = day === 0 ? 1 : (1 - day);
    dt.setDate(dt.getDate() + diff);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }}

  let INITIAL_DATA = null;
  let STATE = null;

  {merge_pres_js}

  {merge_abs_js}

  {sched_js}

  global.ScheduleEngine = {{
    getMondayOfWeek: getMondayOfWeek,
    CHEF_TO_INTERNE_POSTE_MAP: CHEF_TO_INTERNE_POSTE_MAP,
    mergePresentationsList: function (baseData, baseList, savedList) {{
      INITIAL_DATA = baseData;
      return mergePresentationsList(baseList, savedList);
    }},
    mergeAbsencesList: mergeAbsencesList,
    recompute: function (baseData, stateObj) {{
      INITIAL_DATA = baseData;
      STATE = stateObj;
      recomputeScheduleInPlace(stateObj);
      return stateObj;
    }}
  }};
}})(window);
"""


def main() -> None:
    raw = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    cloud = fetch_live_cloud_state()

    payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUpdatedAt": raw.get("updatedAt"),
        "liveInternesJsonUrl": LIVE_INTERNES_JSON_URL,
        "webhookUrl": WEBHOOK_URL,
        "cloudPropKey": CLOUD_PROP_KEY,
        "semester": raw.get("semester", {}),
        "internes": raw.get("internes", []),
        "chefs": raw.get("chefs", []),
        "postesMeta": raw.get("postesMeta", []),
        "deletedAbsenceIds": raw.get("deletedAbsenceIds", []),
        "deletedCustomKeys": raw.get("deletedCustomKeys", []),
        "absences": raw.get("absences", []),
        "customVacations": raw.get("customVacations", {}),
        "lockedWeeks": raw.get("lockedWeeks", {}),
        "baseSchedule": raw.get("baseSchedule", {}),
        "schedule": raw.get("schedule", {}),
        "presentations": raw.get("presentations", []),
        "chefsPlanning": raw.get("chefsPlanning", {}),
        "cloudSnapshot": cloud,
    }

    data_dir = PROJECT_DIR / "data"
    js_dir = PROJECT_DIR / "js"
    data_dir.mkdir(parents=True, exist_ok=True)
    js_dir.mkdir(parents=True, exist_ok=True)

    json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (data_dir / "externes_data.json").write_text(json_str, encoding="utf-8")
    (data_dir / "embedded_data.js").write_text(
        f"window.EXTERNES_EMBEDDED_DATA = {json_str};\n",
        encoding="utf-8",
    )

    engine_js = extract_schedule_engine()
    (js_dir / "schedule_engine.js").write_text(engine_js, encoding="utf-8")

    print(
        f"[OK] Données générées : {len(payload['internes'])} internes, "
        f"{len(payload['chefs'])} chefs, {len(payload['chefsPlanning'])} jours, "
        f"{len(payload['presentations'])} présentations (Cloud snapshot: {'OUI' if cloud else 'NON'})."
    )


if __name__ == "__main__":
    main()
