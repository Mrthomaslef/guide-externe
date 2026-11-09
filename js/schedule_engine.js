/* Auto-généré depuis planning-interne — Moteur de résolution strictement identique */
(function (global) {
  "use strict";

  function getMondayOfWeek(isoDate) {
    const parts = String(isoDate).split("-").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = dt.getDay();
    const diff = day === 0 ? 1 : (1 - day);
    dt.setDate(dt.getDate() + diff);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  let INITIAL_DATA = null;
  let STATE = null;

  function mergePresentationsList(baseList, savedList) {
      const rgSet = new Set(
        ((INITIAL_DATA && INITIAL_DATA.absences) || [])
          .filter(a => a && a.type === "Repos de garde")
          .map(a => a.date + "__" + a.interneId)
      );
      const map = {};
      (baseList || []).forEach(p => { if (p && p.id) map[p.id] = Object.assign({}, p); });
      (savedList || []).forEach(p => {
        if (!p || !p.id || !map[p.id]) return;
        const baseP = map[p.id];
        if (baseP.updatedAt && p.updatedAt && baseP.updatedAt > p.updatedAt) return;
        if (baseP.type === "cours_internes") {
          if (p.userEditedCours) {
            if (p.chefIntervenant !== undefined) baseP.chefIntervenant = p.chefIntervenant;
            if (p.coursChef !== undefined) baseP.coursChef = p.coursChef;
            if (p.sujet !== undefined) baseP.sujet = p.sujet;
            baseP.pasDeCours = (baseP.coursChef === "Pas de cours" || baseP.sujet === "Pas de cours");
            baseP.userEditedCours = true;
            if (p.updatedAt) baseP.updatedAt = p.updatedAt;
          }
          return;
        }
        if (p.sujet !== undefined && (p.sujet !== "Dossier ostéo-articulaire inaugural (choix libre)") && (p.sujet || p.userEditedPres || p.isUserSwap)) {
          baseP.sujet = p.sujet;
        }
        const isExplicitSwap = Boolean(p.isUserSwap || p.updatedAt);
        if (p.userEditedPres && (isExplicitSwap || !(p.interneId && rgSet.has(baseP.date + "__" + p.interneId) && !p.sujet))) {
          if (p.interneId) baseP.interneId = p.interneId;
          if (p.interneName) baseP.interneName = p.interneName;
          baseP.userEditedPres = true;
          if (p.isUserSwap) baseP.isUserSwap = true;
          if (p.updatedAt) baseP.updatedAt = p.updatedAt;
        }
      });
      return Object.values(map).sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    }

  function normalizeAbsencesList(list) {
      return (list || []).map(a => {
        if (!a) return a;
        const copy = Object.assign({}, a);
        if (!copy.status) copy.status = (copy.type === "Repos de garde" && copy.isOfficialGardeRg) ? "approved" : "pending";
        return copy;
      });
    }

    

    function mergeAbsencesList(baseList, savedList, deletedIds) {
      const delSet = new Set(deletedIds || []);
      const mapByPair = {};
      normalizeAbsencesList(baseList || []).forEach(a => {
        if (!a || !a.date || !a.interneId || delSet.has(a.id)) return;
        mapByPair[a.date + "__" + a.interneId] = Object.assign({}, a);
      });
      normalizeAbsencesList(savedList || []).forEach(a => {
        if (!a || !a.date || !a.interneId || delSet.has(a.id)) return;
        const k = a.date + "__" + a.interneId;
        const existing = mapByPair[k];
        if (existing && existing.isOfficialGardeRg) {
          // Conserver le Repos de garde officiel (sauf si son statut a été explicitement modifié en rejected)
          if (a.status === "rejected") {
            existing.status = "rejected";
            existing.validatedBy = a.validatedBy || "Chef";
            existing.validatedAt = a.validatedAt || new Date().toISOString();
          } else if (a.status === "approved" && a.validatedAt) {
            existing.status = "approved";
            existing.validatedBy = a.validatedBy || "Chef";
            existing.validatedAt = a.validatedAt;
          }
          return;
        }
        if (existing) {
          // Une validation ou un refus par le Chef ("approved" / "rejected") prime toujours sur un statut "pending"
          const exDecided = existing.status === "approved" || existing.status === "rejected";
          const inDecided = a.status === "approved" || a.status === "rejected";
          if (exDecided && !inDecided) {
            return;
          }
          if (exDecided && inDecided && existing.validatedAt && a.validatedAt && existing.validatedAt > a.validatedAt) {
            return;
          }
        }
        mapByPair[k] = Object.assign({}, existing || {}, a);
      });
      return Object.values(mapByPair).sort((a, b) => a.date.localeCompare(b.date) || a.interneId.localeCompare(b.interneId));
    }

  const MANDATORY_WEEKLY_POSTES_MAP = {
      "1_am": ["ECHO"],
      "1_pm": ["IRM"],
      "2_am": ["GESTES (C)", "IRM 3T", "IRM 1,5T"],
      "2_pm": ["LECTURE"],
      "3_am": ["IRM 3T", "IRM 1,5T", "TDM OLLIER DIAG", "ECHO"],
      "3_pm": ["GESTES (C)", "IRM", "SCAN ACHARD", "ECHO"],
      "4_am": ["ECHO", "GESTES (C)"],
      "4_pm": ["IRM"],
      "5_am": ["IRM 3T"],
      "5_pm": []
    };

    const CHEF_TO_INTERNE_POSTE_MAP = {
      "TDM OLLIER 4 (SAU)": "TDM SAU",
      "TDM OLLIER 4": "TDM SAU",
      "ECHO": "ECHO",
      "GESTES (C)": "GESTES (C)",
      "POSTE C": "GESTES (C)",
      "TDM ACHARD 1": "SCAN ACHARD",
      "TDM OLLIER 3": "TDM OLLIER DIAG",
      "IRM 3T": "IRM 3T",
      "IRM 1,5T": "IRM 1,5T",
      "IRM": "IRM",
      "ALLURA": "ALLURA"
    };

    function isNoDrapeRelectureTuesday(iso, jsDay) {
      if (!iso) return false;
      if (jsDay === undefined || jsDay === null) {
        const [yy, mm, dd] = String(iso).split("-").map(Number);
        jsDay = new Date(yy, mm - 1, dd).getDay();
      }
      return jsDay === 2 && String(iso).startsWith("2026-12") && String(iso) > "2026-12-06";
    }

    function getOpenMandatoryPostesForHalfDay(iso, halfKey, stRef) {
      stRef = stRef || STATE;
      if (!iso || !stRef) return new Set();
      if (iso === "2026-11-02" && halfKey === "am") return new Set(["FORMATION / ACCUEIL"]);
      const dObj = stRef.schedule ? stRef.schedule[iso] : null;
      if (dObj && dObj.holiday) return new Set();
      const [yy, mm, dd] = iso.split("-").map(Number);
      const jsDay = new Date(yy, mm - 1, dd).getDay();
      if (jsDay < 1 || jsDay > 5) return new Set();
      const noInterneTheveninNov = (halfKey === "am" && jsDay === 3 && iso.startsWith("2026-11"));
      const noDrapeTueDec = (halfKey === "pm" && isNoDrapeRelectureTuesday(iso, jsDay));
      const baseReq = new Set(MANDATORY_WEEKLY_POSTES_MAP[`${jsDay}_${halfKey}`] || []);
      if (noInterneTheveninNov) baseReq.delete("ECHO");
      if (noDrapeTueDec) baseReq.delete("LECTURE");
      const chDay = (stRef.chefsPlanning || {})[iso];
      if (!chDay || !Array.isArray(chDay[halfKey])) {
        baseReq.add("TDM SAU");
        return baseReq;
      }
      const openPostes = new Set();
      chDay[halfKey].forEach(entry => {
        const docVal = String(entry.doc || "").trim();
        const pChef = String(entry.poste || "").trim();
        const isClosed = Boolean(entry.closed) || docVal.toUpperCase().startsWith("FERM") || docVal.toUpperCase() === "MAINTENANCE";
        if (isClosed) return;
        if (CHEF_TO_INTERNE_POSTE_MAP[pChef]) {
          openPostes.add(CHEF_TO_INTERNE_POSTE_MAP[pChef]);
        } else if (pChef === "CONSULTATION" && halfKey === "pm" && (jsDay === 2 || jsDay === 5)) {
          openPostes.add("CONSULTATION");
          if (!noDrapeTueDec) openPostes.add("LECTURE");
        }
      });
      if (halfKey === "pm" && (jsDay === 2 || jsDay === 5) && !noDrapeTueDec) {
        openPostes.add("LECTURE");
      }
      const res = new Set(["TDM SAU"]);
      baseReq.forEach(p => {
        if (openPostes.has(p)) res.add(p);
      });
      return res;
    }

    function isMandatoryVacationSlot(iso, halfKey, posteName, stRef) {
      if (!posteName || !iso || !halfKey) return false;
      const reqSet = getOpenMandatoryPostesForHalfDay(iso, halfKey, stRef);
      return reqSet.has(posteName);
    }

    function getOpenChefDocsForInternePoste(iso, halfKey, posteName, stRef) {
      stRef = stRef || STATE;
      if (!iso || !halfKey || !posteName || !stRef) return [];
      const dObj = stRef.schedule ? stRef.schedule[iso] : null;
      if (dObj && dObj.holiday) return [];
      const [yy, mm, dd] = iso.split("-").map(Number);
      const jsDay = new Date(yy, mm - 1, dd).getDay();
      if (jsDay < 1 || jsDay > 5) return [];
      const chDay = (stRef.chefsPlanning || {})[iso];
      if (!chDay || !Array.isArray(chDay[halfKey])) return [];
      const docs = [];
      chDay[halfKey].forEach(entry => {
        const docVal = String(entry.doc || "").trim();
        const pChef = String(entry.poste || "").trim();
        const isClosed = Boolean(entry.closed) || docVal.toUpperCase().startsWith("FERM") || docVal.toUpperCase() === "MAINTENANCE";
        if (isClosed || !docVal) return;
        let mappedPoste = CHEF_TO_INTERNE_POSTE_MAP[pChef] || null;
        if (!mappedPoste && pChef === "CONSULTATION" && halfKey === "pm" && (jsDay === 2 || jsDay === 5)) {
          mappedPoste = "CONSULTATION";
        }
        if (mappedPoste === posteName) {
          docs.push(docVal);
        }
      });
      return docs;
    }

    function getChefWithoutInterneDocsForPoste(iso, halfKey, posteName, stRef) {
      stRef = stRef || STATE;
      const docs = getOpenChefDocsForInternePoste(iso, halfKey, posteName, stRef);
      if (!docs.length) return [];
      const dObj = (stRef && stRef.schedule) ? stRef.schedule[iso] : null;
      const periodList = (dObj && Array.isArray(dObj[halfKey])) ? dObj[halfKey] : [];
      const noDrapeTueDec = (halfKey === "pm" && isNoDrapeRelectureTuesday(iso));
      const hasInterne = periodList.some(x => !x.closed && x.interneId && (
        x.poste === posteName ||
        (posteName === "CONSULTATION" && x.poste === "LECTURE" && !noDrapeTueDec)
      ));
      return hasInterne ? [] : docs;
    }

    const CHEF_TOKEN_TO_INITIALS = {
      "TL": "TL", "HM": "HM", "MH": "MH", "SL": "SL", "YA": "YA",
      "MP": "MP", "AL": "AL", "AC": "AC", "MD": "MD",
      "MIHOUBI": "FM", "FEYDY": "AF", "DRAPE": "JD", "DRAPÉ": "JD",
      "YANG": "YG", "THEVENIN": "FT", "THÉVENIN": "FT",
      "MOUTOUNET": "LM", "RUBINI": "AR", "SEROR": "PS",
      "HAMMOUD": "SH", "GUERINI": "HG"
    };

    function formatDocStringToChefInitials(docStr) {
      const cleaned = String(docStr || "").replace(/\([^)]*\)/g, "").trim();
      if (!cleaned) return [];
      const parts = cleaned.split(/\s*(?:\/|\bET\b)\s*/i);
      const res = [];
      parts.forEach(p => {
        const up = p.trim().toUpperCase();
        if (!up || up === "INTERNES" || up === "INTERNE" || up.startsWith("FERM") || up === "MAINTENANCE") return;
        const ini = CHEF_TOKEN_TO_INITIALS[up] || up;
        if (!res.includes(ini)) res.push(ini);
      });
      return res;
    }

    function getChefInitialsInfoForInternePoste(iso, halfKey, posteName, stRef) {
      stRef = stRef || STATE;
      if (!iso || !halfKey || !posteName || !stRef) return null;
      const dObj = stRef.schedule ? stRef.schedule[iso] : null;
      if (dObj && dObj.holiday) return null;
      const [yy, mm, dd] = iso.split("-").map(Number);
      const jsDay = new Date(yy, mm - 1, dd).getDay();
      if (jsDay < 1 || jsDay > 5) return null;
      const chDay = (stRef.chefsPlanning || {})[iso];
      if (!chDay || !Array.isArray(chDay[halfKey])) return null;
      const noDrapeTueDec = (halfKey === "pm" && isNoDrapeRelectureTuesday(iso, jsDay));
      const initials = [];
      const rawDocs = [];
      chDay[halfKey].forEach(entry => {
        const docVal = String(entry.doc || "").trim();
        const pChef = String(entry.poste || "").trim();
        const isClosed = Boolean(entry.closed) || docVal.toUpperCase().startsWith("FERM") || docVal.toUpperCase() === "MAINTENANCE";
        if (isClosed || !docVal) return;
        let mappedPoste = CHEF_TO_INTERNE_POSTE_MAP[pChef] || null;
        if (!mappedPoste && pChef === "CONSULTATION") {
          if (posteName === "CONSULTATION") {
            mappedPoste = "CONSULTATION";
          } else if (posteName === "LECTURE" && halfKey === "pm" && jsDay === 2 && !noDrapeTueDec) {
            mappedPoste = "LECTURE";
          }
        }
        if (mappedPoste === posteName) {
          rawDocs.push(docVal);
          formatDocStringToChefInitials(docVal).forEach(ini => {
            if (!initials.includes(ini)) initials.push(ini);
          });
        }
      });
      if (!initials.length) return null;
      return {
        initialsLabel: initials.join("/"),
        rawLabel: rawDocs.join(", ")
      };
    }

    function recomputeScheduleInPlace(st) {
      st = st || STATE;
      if (!st) return;
      // Utiliser baseSchedule (pré-équilibré autour des Repos de garde officiels, avec preRgAm/preRgPm en cas d'annulation)
      const baseSched = INITIAL_DATA.baseSchedule || INITIAL_DATA.schedule;
      const absLookup = {};
      (st.absences || []).forEach(a => {
        if (!a || !a.date || !a.interneId) return;
        if (a.status === "rejected") return; // Les vacances refusées par le chef ne bloquent plus le planning
        absLookup[a.date + "__" + a.interneId] = {
          type: a.type || "CA 1",
          status: a.status || "pending",
          comment: a.comment || "",
          id: a.id
        };
      });
      const custom = st.customVacations || {};
      const lockedWeeks = st.lockedWeeks || {};
      const seniorIds = ["gabriel", "marwane", "milan", "nathanael", "oussama"];
      const phDocTokens = new Set([
        "FEYDY", "DRAPE", "DRAPÉ", "MIHOUBI", "MD", "AL", "LAPORTE",
        "AC", "COSTEA", "YANG", "RUBINI", "SEROR", "MOUTOUNET", "HAMMOUD"
      ]);
      const chefToInterneMap = {
        "TDM OLLIER 4 (SAU)": "TDM SAU",
        "TDM OLLIER 4": "TDM SAU",
        "ECHO": "ECHO",
        "GESTES (C)": "GESTES (C)",
        "POSTE C": "GESTES (C)",
        "TDM ACHARD 1": "SCAN ACHARD",
        "TDM OLLIER 3": "TDM OLLIER DIAG",
        "IRM 3T": "IRM 3T",
        "IRM 1,5T": "IRM 1,5T",
        "IRM": "IRM",
        "ALLURA": "ALLURA"
      };
      const mandatoryWeeklyPostes = {
        "1_am": ["ECHO"],
        "1_pm": ["IRM"],
        "2_am": ["GESTES (C)", "IRM 3T", "IRM 1,5T"],
        "2_pm": ["LECTURE"],
        "3_am": ["IRM 3T", "IRM 1,5T", "TDM OLLIER DIAG", "ECHO"],
        "3_pm": ["GESTES (C)", "IRM", "SCAN ACHARD", "ECHO"],
        "4_am": ["ECHO", "GESTES (C)"],
        "4_pm": ["IRM"],
        "5_am": ["IRM 3T"],
        "5_pm": []
      };
      const fixedOffHalfDays = {
        oussama: "1_am", // Lundi matin
        gabriel: "2_am", // Mardi matin
        marwane: "4_am"  // Jeudi matin
      };
      function isProtectedFixedOff(iid, dIso, halfKey) {
        if (!dIso || dIso < "2026-11-09") return false;
        const target = fixedOffHalfDays[iid];
        if (!target) return false;
        const [yyF, mmF, ddF] = dIso.split("-").map(Number);
        const jsDayF = new Date(yyF, mmF - 1, ddF).getDay();
        return `${jsDayF}_${halfKey}` === target;
      }
      function getPhInternePostesForHalfDay(iso, halfKey, jsDay) {
        const noInterneTheveninNov = (halfKey === "am" && jsDay === 3 && iso.startsWith("2026-11"));
        const noDrapeTueDec = (halfKey === "pm" && isNoDrapeRelectureTuesday(iso, jsDay));
        const baseReq = new Set(mandatoryWeeklyPostes[`${jsDay}_${halfKey}`] || []);
        if (noInterneTheveninNov) baseReq.delete("ECHO");
        if (noDrapeTueDec) baseReq.delete("LECTURE");
        const chDay = (st.chefsPlanning || {})[iso];
        if (!chDay || !Array.isArray(chDay[halfKey])) return baseReq;
        const openPostes = new Set();
        chDay[halfKey].forEach(entry => {
          const docVal = String(entry.doc || "").trim();
          const pChef = String(entry.poste || "").trim();
          const isClosed = Boolean(entry.closed) || docVal.toUpperCase().startsWith("FERM") || docVal.toUpperCase() === "MAINTENANCE";
          if (isClosed) return;
          if (chefToInterneMap[pChef]) {
            openPostes.add(chefToInterneMap[pChef]);
          } else if (pChef === "CONSULTATION" && halfKey === "pm" && (jsDay === 2 || jsDay === 5)) {
            openPostes.add("CONSULTATION");
            if (!noDrapeTueDec) openPostes.add("LECTURE");
          }
        });
        if (halfKey === "pm" && (jsDay === 2 || jsDay === 5) && !noDrapeTueDec) {
          openPostes.add("LECTURE");
        }
        const phSet = new Set();
        baseReq.forEach(p => {
          if (openPostes.has(p)) phSet.add(p);
        });
        return phSet;
      }

      // 1. Appliquer customVacations et absences jour par jour
      const weeksMap = {};
      const weekHasLeaveChange = {};
      Object.keys(baseSched).sort().forEach(iso => {
        const dayObj = JSON.parse(JSON.stringify(baseSched[iso]));
        const [yy, mm, dd] = iso.split("-").map(Number);
        const dt = new Date(yy, mm - 1, dd);
        const jsDay = dt.getDay(); // 1=Mon, 2=Tue, ..., 5=Fri
        const monIso = getMondayOfWeek(iso);
        const isWeekLocked = Boolean(lockedWeeks[monIso] && lockedWeeks[monIso].locked);
        if (!weeksMap[monIso]) weeksMap[monIso] = [];
        weeksMap[monIso].push(iso);

        let dayHasLeaveChange = false;

        if (!dayObj.holiday && dayObj.byInterne) {
          Object.keys(dayObj.byInterne).forEach(iid => {
            const intObj = st.internes.find(x => x.id === iid);
            const origSlot = dayObj.byInterne[iid] || {};
            const cKey = iso + "__" + iid;
            const noDrapeTueDec = isNoDrapeRelectureTuesday(iso, jsDay);
            let am = origSlot.am === "LECTURE/CS" ? "LECTURE" : origSlot.am;
            let pm = origSlot.pm === "LECTURE/CS" ? ((jsDay === 5 || noDrapeTueDec) ? "CONSULTATION" : "LECTURE") : origSlot.pm;
            let noteAm = origSlot.noteAm || "";
            let notePm = origSlot.notePm || "";
            let note = origSlot.note || noteAm || notePm || "";
            let absStatus = (am === "RG" || pm === "RG" || am === "VACANCES" || pm === "VACANCES") ? "approved" : null;
            const isSocle = Boolean(origSlot.isSocle || (intObj && intObj.isSocle));

            // Si un Repos de garde officiel avait été pré-intégré mais a été supprimé/refusé, restaurer le poste pré-RG (sauf semaine déjà validée/fixée)
            if (!isWeekLocked && !absLookup[cKey] && origSlot.am === "RG" && origSlot.preRgAm) {
              am = origSlot.preRgAm === "LECTURE/CS" ? "LECTURE" : origSlot.preRgAm;
              const rawPrePm = origSlot.preRgPm || origSlot.preRgAm;
              pm = rawPrePm === "LECTURE/CS" ? ((jsDay === 5 || noDrapeTueDec) ? "CONSULTATION" : "LECTURE") : rawPrePm;
              note = "";
              noteAm = "";
              notePm = "";
              absStatus = null;
              dayHasLeaveChange = true;
              weekHasLeaveChange[monIso] = true;
            }

            if (custom[cKey]) {
              const [yyC, mmC, ddC] = iso.split("-").map(Number);
              const jsDayC = new Date(yyC, mmC - 1, ddC).getDay();
              const isChefCustom = Boolean(custom[cKey].status === "approved" || custom[cKey].validatedBy === "Chef");
              if (custom[cKey].am) {
                am = custom[cKey].am === "LECTURE/CS" ? "LECTURE" : custom[cKey].am;
              }
              if (custom[cKey].pm && (isChefCustom || !((jsDayC === 2 || jsDayC === 5) && custom[cKey].pm === "1/2 journée libre"))) {
                pm = custom[cKey].pm === "LECTURE/CS" ? ((jsDayC === 5 || noDrapeTueDec) ? "CONSULTATION" : "LECTURE") : custom[cKey].pm;
              }
              if (custom[cKey].note !== undefined) {
                note = custom[cKey].note;
                noteAm = custom[cKey].note;
              }
              absStatus = (am === "RG" || pm === "RG" || am === "VACANCES" || pm === "VACANCES") ? (custom[cKey].status || "approved") : null;
            }

            // Si la semaine est déjà validée et fixée par le Chef, un congé posé ne modifie pas le planning validé de la semaine
            if (!isWeekLocked && absLookup[cKey]) {
              const absInfo = absLookup[cKey];
              const hasApprovedCustomOverride = Boolean(
                custom[cKey] &&
                custom[cKey].status === "approved" &&
                custom[cKey].am !== "VACANCES" &&
                custom[cKey].pm !== "VACANCES" &&
                (absInfo.status !== "approved" || (custom[cKey].validatedAt && (!absInfo.validatedAt || custom[cKey].validatedAt > absInfo.validatedAt)))
              );
              if (!hasApprovedCustomOverride) {
                const at = absInfo.type;
                const badge = (at.toLowerCase().includes("garde") || at.toUpperCase() === "RG") ? "RG" : "VACANCES";
                if (origSlot.am !== badge || origSlot.pm !== badge) {
                  dayHasLeaveChange = true;
                  weekHasLeaveChange[monIso] = true;
                }
                am = badge;
                pm = badge;
                absStatus = absInfo.status || "pending";
                const noteTxt = (badge === "RG" && absInfo.comment) ? absInfo.comment : at;
                note = noteTxt;
                noteAm = noteTxt;
                notePm = noteTxt;
              }
            }

            dayObj.byInterne[iid] = { am, pm, note, noteAm, notePm, isSocle, absStatus };
          });

          if (!isWeekLocked && dayHasLeaveChange) {
            // Garantie impérative : il doit TOUJOURS y avoir au moins un interne senior au Scanner du SAU (TDM SAU) Matin & Après-midi
            // (sauf le Mardi matin où Noé assure le TDM SAU en solo sans doublure avec Dr Macil HAMADOUCHE, sauf absence/RG de Noé)
            // en prélevant d'abord sur une vacation non obligatoire (hors 13 vacations prioritaires), sans écraser les postes validés par le Chef
            const baseSauDonors = ["ALLURA", "TDM OLLIER DIAG", "IRM 1,5T", "SCAN ACHARD", "GESTES (C)", "ECHO", "IRM 3T", "IRM", "CONSULTATION", "LECTURE"];
            ["am", "pm"].forEach(hSau => {
              if (iso === "2026-11-02" && hSau === "am") return;
              if (jsDay === 2 && hSau === "am" && dayObj.byInterne.noe && !["RG", "VACANCES"].includes(dayObj.byInterne.noe.am)) {
                const cKeyNoe = iso + "__noe";
                if (!(custom[cKeyNoe] && custom[cKeyNoe].am)) {
                  dayObj.byInterne.noe.am = "TDM SAU";
                  dayObj.byInterne.noe.noteAm = "Avec Dr Macil HAMADOUCHE (MH) — Solo SAU (exceptionnellement sans doublure)";
                  if (!dayObj.byInterne.noe.note) dayObj.byInterne.noe.note = dayObj.byInterne.noe.noteAm;
                }
              }
              const noeSoloTueAm = (jsDay === 2 && hSau === "am" && dayObj.byInterne.noe && dayObj.byInterne.noe.am === "TDM SAU");
              const hasSauSenior = noeSoloTueAm || seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId][hSau] === "TDM SAU");
              if (!hasSauSenior) {
                const nkSau = hSau === "am" ? "noteAm" : "notePm";
                const phSauSet = getPhInternePostesForHalfDay(iso, hSau, jsDay);
                const sauDonorOrder = [
                  ...baseSauDonors.filter(d => !phSauSet.has(d)),
                  ...baseSauDonors.filter(d => phSauSet.has(d)),
                  "1/2 journée libre"
                ];
                let replacedSau = false;
                for (const donorP of sauDonorOrder) {
                  for (const sId of seniorIds) {
                    const cKeySau = iso + "__" + sId;
                    if (custom[cKeySau] && custom[cKeySau][hSau]) continue;
                    const sl = dayObj.byInterne[sId];
                    if (sl && sl[hSau] === donorP) {
                      sl[hSau] = "TDM SAU";
                      sl[nkSau] = "Remplacement TDM SAU (permanence obligatoire)";
                      if (!sl.note) sl.note = sl[nkSau];
                      replacedSau = true;
                      break;
                    }
                  }
                  if (replacedSau) break;
                }
              }
            });

            // Si un Repos de garde (RG) supplémentaire est posé un Mardi ou Vendredi, couvrir automatiquement LECTURE (Mardi) / CONSULTATION (Vendredi)
            // en prélevant d'abord sur une vacation non obligatoire
            if (jsDay === 2 && !isNoDrapeRelectureTuesday(iso, jsDay)) {
              const hasTueCs = Object.keys(dayObj.byInterne).some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId].pm === "LECTURE");
              const anyRgToday = seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId].pm === "RG");
              const anyVacToday = seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId].pm === "VACANCES");
              if (!hasTueCs && anyRgToday && !anyVacToday) {
                const phTuePm = getPhInternePostesForHalfDay(iso, "pm", jsDay);
                const tueDonors = ["GESTES (C)", "ECHO", "SCAN ACHARD", "CONSULTATION"];
                const orderedTueDonors = [...tueDonors.filter(d => !phTuePm.has(d)), ...tueDonors.filter(d => phTuePm.has(d))];
                for (const donorP of orderedTueDonors) {
                  let rep = false;
                  for (const sId of seniorIds) {
                    if (custom[iso + "__" + sId] && custom[iso + "__" + sId].pm) continue;
                    const sl = dayObj.byInterne[sId];
                    if (sl && sl.pm === donorP) {
                      sl.pm = "LECTURE";
                      sl.notePm = "Relecture avec Pr Drapé (systématique)";
                      if (!sl.note) sl.note = sl.notePm;
                      rep = true;
                      break;
                    }
                  }
                  if (rep) break;
                }
              }
            }
            if (jsDay === 5) {
              const hasFriCs = seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId].pm === "CONSULTATION");
              const anyRgToday = seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId].pm === "RG");
              if (!hasFriCs && anyRgToday) {
                const phFriPm = getPhInternePostesForHalfDay(iso, "pm", jsDay);
                for (const donorP of ["GESTES (C)", "IRM", "SCAN ACHARD", "LECTURE"]) {
                  if (phFriPm.has(donorP)) continue;
                  let rep = false;
                  for (const sId of seniorIds) {
                    if (custom[iso + "__" + sId] && custom[iso + "__" + sId].pm) continue;
                    const sl = dayObj.byInterne[sId];
                    if (sl && sl.pm === donorP) {
                      sl.pm = "CONSULTATION";
                      sl.notePm = "Consultation Internes (Vendredi PM)";
                      if (!sl.note) sl.note = sl.notePm;
                      rep = true;
                      break;
                    }
                  }
                  if (rep) break;
                }
              }
            }
          }
        }
        st.schedule[iso] = dayObj;
      });

      // 2. Garantie hebdomadaire :
      //    - Couverture stricte du TDM SAU permanent et des 13 vacations obligatoires prioritaires
      //    - Pose des 2 demi-offs en fonction (avec demi-journée fixe pour Oussama Lundi AM, Gabriel Mardi AM, Marwane Jeudi AM)
      //    - Isolation par semaine : un congé posé sur une semaine X ne modifie jamais une semaine déjà validée ni une autre semaine Y != X
      const nonMandatoryPriority = [
        "ALLURA",
        "GESTES (C)",
        "ECHO",
        "IRM 1,5T",
        "SCAN ACHARD",
        "TDM OLLIER DIAG",
        "IRM 3T",
        "IRM",
        "CONSULTATION",
        "LECTURE"
      ];
      const nonActivePostes = ["1/2 journée libre", "RG", "VACANCES", "FÉRIÉ", "FORMATION / ACCUEIL"];
      const carryOverOffs = {};
      const totalAmOffs = {};
      const totalPmOffs = {};
      const totalSauAmCounts = {};
      const totalSauPmCounts = {};
      const totalGestesCounts = {};
      const totalGestesAmCounts = {};
      const totalGestesPmCounts = {};
      const totalCsCounts = {};
      const totalLectureCounts = {};
      (st.internes || []).forEach(intObj => {
        carryOverOffs[intObj.id] = 0;
        totalAmOffs[intObj.id] = 0;
        totalPmOffs[intObj.id] = 0;
        totalSauAmCounts[intObj.id] = 0;
        totalSauPmCounts[intObj.id] = 0;
        totalGestesCounts[intObj.id] = 0;
        totalGestesAmCounts[intObj.id] = 0;
        totalGestesPmCounts[intObj.id] = 0;
        totalCsCounts[intObj.id] = 0;
        totalLectureCounts[intObj.id] = 0;
      });

      Object.keys(weeksMap).sort().forEach(monIso => {
        const isWeekLocked = Boolean(lockedWeeks[monIso] && lockedWeeks[monIso].locked);
        const shouldRebalanceWeek = !isWeekLocked && Boolean(weekHasLeaveChange[monIso]);
        const activeIsos = weeksMap[monIso].filter(dIso => st.schedule[dIso] && !st.schedule[dIso].holiday && st.schedule[dIso].byInterne);
        const countWeekHalfOffsJs = (interneId, halfKey) => {
          let cnt = 0;
          activeIsos.forEach(dChk => {
            const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
            if (sl && sl[halfKey] === "1/2 journée libre") cnt++;
          });
          return cnt;
        };

        // 2A. Couverture des vacations obligatoires (TDM SAU + 13 vacations) sur chaque jour de la semaine (uniquement si semaine non verrouillée et modifiée par un congé/RG)
        if (shouldRebalanceWeek) {
          activeIsos.forEach(iso => {
            const dayObj = st.schedule[iso];
            const [yy, mm, dd] = iso.split("-").map(Number);
            const jsDay = new Date(yy, mm - 1, dd).getDay();
            ["am", "pm"].forEach(h => {
              if (iso === "2026-11-02" && h === "am") return;
              const nk = h === "am" ? "noteAm" : "notePm";
              const phSet = getPhInternePostesForHalfDay(iso, h, jsDay);
              const noeSoloTueAm2A = (jsDay === 2 && h === "am" && dayObj.byInterne.noe && dayObj.byInterne.noe.am === "TDM SAU");
              const hasSeniorSau = noeSoloTueAm2A || seniorIds.some(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId][h] === "TDM SAU");
              if (!hasSeniorSau) {
                const finalSauDonors = [
                  ...nonMandatoryPriority.filter(d => !phSet.has(d)),
                  "1/2 journée libre",
                  ...nonMandatoryPriority.filter(d => phSet.has(d))
                ];
                const orderedSeniors = [
                  ...seniorIds.filter(sId => !isProtectedFixedOff(sId, iso, h)),
                  ...seniorIds.filter(sId => isProtectedFixedOff(sId, iso, h))
                ];
                let replaced = false;
                for (const donorP of finalSauDonors) {
                  for (const sId of orderedSeniors) {
                    const cKeySau = iso + "__" + sId;
                    if (custom[cKeySau] && custom[cKeySau][h]) continue;
                    const sl = dayObj.byInterne[sId];
                    if (sl && sl[h] === donorP) {
                      sl[h] = "TDM SAU";
                      sl[nk] = "Remplacement TDM SAU (permanence obligatoire)";
                      if (!sl.note) sl.note = sl[nk];
                      replaced = true;
                      break;
                    }
                  }
                  if (replaced) break;
                }
              }

              if (!(iso === "2026-11-02" && h === "am")) {
                Array.from(phSet).sort().forEach(phPoste => {
                  const allIds = Object.keys(dayObj.byInterne);
                  const isCovered = allIds.some(anyId => dayObj.byInterne[anyId] && dayObj.byInterne[anyId][h] === phPoste);
                  if (isCovered) return;
                  let reassignedPh = false;
                  const candIids = (phPoste !== "TDM SAU" && !(jsDay === 2 && h === "am")) ? [...seniorIds, "noe"] : [...seniorIds];
                  // A) Prélever sur une vacation non obligatoire
                  for (const donorP of nonMandatoryPriority) {
                    if (phSet.has(donorP)) continue;
                    for (const candId of candIids) {
                      if (custom[iso + "__" + candId] && custom[iso + "__" + candId][h]) continue;
                      const sl = dayObj.byInterne[candId];
                      if (sl && sl[h] === donorP) {
                        sl[h] = phPoste;
                        sl[nk] = `Vacation obligatoire (${phPoste})`;
                        if (!sl.note) sl.note = sl[nk];
                        reassignedPh = true;
                        break;
                      }
                    }
                    if (reassignedPh) break;
                  }
                  // B) Binôme au TDM SAU (en respectant les vacations fixées par le Chef)
                  if (!reassignedPh && phPoste !== "TDM SAU") {
                    const sauSeniors = seniorIds.filter(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId][h] === "TDM SAU");
                    const movableSauSeniors = sauSeniors.filter(sId => !(custom[iso + "__" + sId] && custom[iso + "__" + sId][h]));
                    if (sauSeniors.length >= 2 && movableSauSeniors.length >= 1) {
                      const donorSid = movableSauSeniors[movableSauSeniors.length - 1];
                      dayObj.byInterne[donorSid][h] = phPoste;
                      dayObj.byInterne[donorSid][nk] = `Vacation obligatoire (${phPoste})`;
                      reassignedPh = true;
                    } else if (!(jsDay === 2 && h === "am") && sauSeniors.length >= 1 && dayObj.byInterne.noe && dayObj.byInterne.noe[h] === "TDM SAU" && !(custom[iso + "__noe"] && custom[iso + "__noe"][h])) {
                      if (["ECHO", "IRM 3T", "IRM 1,5T", "IRM", "TDM OLLIER DIAG"].includes(phPoste)) {
                        dayObj.byInterne.noe[h] = phPoste;
                        dayObj.byInterne.noe[nk] = `Vacation obligatoire (${phPoste})`;
                        reassignedPh = true;
                      }
                    }
                  }
                  // C) Demi-off disponible (en sollicitant d'abord un interne ayant >1 off sur cette période AM/PM ou 2 offs le même jour)
                  if (!reassignedPh) {
                    const otherH = h === "am" ? "pm" : "am";
                    const orderedOffCands = candIids
                      .filter(cid => dayObj.byInterne[cid] && dayObj.byInterne[cid][h] === "1/2 journée libre")
                      .sort((a, b) => {
                        const pa = isProtectedFixedOff(a, iso, h) ? 1 : 0;
                        const pb = isProtectedFixedOff(b, iso, h) ? 1 : 0;
                        if (pa !== pb) return pa - pb;
                        const sa = dayObj.byInterne[a][otherH] === "1/2 journée libre" ? 0 : 1;
                        const sb = dayObj.byInterne[b][otherH] === "1/2 journée libre" ? 0 : 1;
                        if (sa !== sb) return sa - sb;
                        const diffA = countWeekHalfOffsJs(a, h) - countWeekHalfOffsJs(a, otherH);
                        const diffB = countWeekHalfOffsJs(b, h) - countWeekHalfOffsJs(b, otherH);
                        return diffB - diffA;
                      });
                    for (const candId of orderedOffCands) {
                      if (custom[iso + "__" + candId] && custom[iso + "__" + candId][h]) continue;
                      const sl = dayObj.byInterne[candId];
                      if (sl && sl[h] === "1/2 journée libre") {
                        sl[h] = phPoste;
                        sl[nk] = `Vacation obligatoire (${phPoste})`;
                        if (!sl.note) sl.note = sl[nk];
                        reassignedPh = true;
                        break;
                      }
                    }
                  }
                });
              }
            });
          });
        }

        // 2B. Ajustement des demi-offs (maximum 2 demi-offs par semaine par interne, en alternant Matin / Après-midi : 1 AM + 1 PM)
        if (shouldRebalanceWeek) {
          (st.internes || []).forEach(intObj => {
            const iid = intObj.id;
            let vacHalfDays = 0;
            let offCnt = 0;
            activeIsos.forEach(dIso => {
              const slot = st.schedule[dIso].byInterne[iid];
              if (!slot) return;
              ["am", "pm"].forEach(h => {
                if (slot[h] === "VACANCES" || slot[h] === "RG") vacHalfDays++;
                else if (slot[h] === "1/2 journée libre") offCnt++;
              });
            });
            const targetOffs = vacHalfDays >= 6 ? 0 : 2;

            // Si l'interne dépasse 2 demi-offs (ou targetOffs), remplacer les demi-offs en excès par un poste actif ouvert
            if (offCnt > targetOffs) {
              const excessSlots = [];
              activeIsos.forEach(dIso => {
                if (dIso === "2026-11-02") return;
                const slot = st.schedule[dIso].byInterne[iid];
                if (!slot) return;
                ["am", "pm"].forEach(h => {
                  if (slot[h] === "1/2 journée libre" && !(custom[dIso + "__" + iid] && custom[dIso + "__" + iid][h])) {
                    excessSlots.push([dIso, h]);
                  }
                });
              });
              excessSlots.sort((a, b) => {
                const fixA = isProtectedFixedOff(iid, a[0], a[1]) ? 1 : 0;
                const fixB = isProtectedFixedOff(iid, b[0], b[1]) ? 1 : 0;
                return fixA - fixB;
              });
              for (const [dIso, h] of excessSlots) {
                if (offCnt <= targetOffs) break;
                const [yy, mm, dd] = dIso.split("-").map(Number);
                const jsDay = new Date(yy, mm - 1, dd).getDay();
                const otherH = h === "am" ? "pm" : "am";
                const byInt = st.schedule[dIso].byInterne;
                const slot = byInt[iid];
                const otherP = slot[otherH];
                const usedSet = new Set(Object.values(byInt).map(s => s && s[h]).filter(Boolean));
                const phSet = getPhInternePostesForHalfDay(dIso, h, jsDay);
                const noDrapeTueDec = (h === "pm" && isNoDrapeRelectureTuesday(dIso, jsDay));
                const candPostes = [...Array.from(phSet), ...nonMandatoryPriority].filter(p => !(noDrapeTueDec && p === "LECTURE"));
                const chosen = candPostes.find(p => !usedSet.has(p) && p !== otherP) || candPostes.find(p => p !== otherP) || "TDM OLLIER DIAG";
                const nk = h === "am" ? "noteAm" : "notePm";
                slot[h] = chosen;
                slot[nk] = "";
                offCnt--;
              }
            }

            if (vacHalfDays >= 6) return;

            while (offCnt < targetOffs) {
              let freed = false;
              const wAm = countWeekHalfOffsJs(iid, "am");
              const wPm = countWeekHalfOffsJs(iid, "pm");
              let preferredH = "pm";
              if (wAm < wPm) preferredH = "am";
              else if (wPm < wAm) preferredH = "pm";
              else if ((totalAmOffs[iid] || 0) + wAm < (totalPmOffs[iid] || 0) + wPm) preferredH = "am";
              else if ((totalPmOffs[iid] || 0) + wPm < (totalAmOffs[iid] || 0) + wAm) preferredH = "pm";
              else preferredH = fixedOffHalfDays[iid] ? "am" : "pm";

              const rawCands = [];
              for (let i = activeIsos.length - 1; i >= 0; i--) {
                const dIso = activeIsos[i];
                if (dIso === "2026-11-02") continue;
                const [yy, mm, dd] = dIso.split("-").map(Number);
                const jsDay = new Date(yy, mm - 1, dd).getDay();
                for (const h of ["pm", "am"]) {
                  if (h === "pm" && (jsDay === 2 || jsDay === 5)) continue;
                  if (iid === "noe" && jsDay === 2 && h === "am") continue;
                  const slChk = st.schedule[dIso].byInterne[iid];
                  if (!slChk || nonActivePostes.includes(slChk[h])) continue;
                  rawCands.push([dIso, h, jsDay]);
                }
              }

              const slotCandidates = rawCands.slice().sort((a, b) => {
                const othA = a[1] === "am" ? "pm" : "am";
                const othB = b[1] === "am" ? "pm" : "am";
                const sameDayA = st.schedule[a[0]].byInterne[iid][othA] === "1/2 journée libre" ? 1 : 0;
                const sameDayB = st.schedule[b[0]].byInterne[iid][othB] === "1/2 journée libre" ? 1 : 0;
                if (sameDayA !== sameDayB) return sameDayA - sameDayB;
                const prefA = a[1] === preferredH ? 0 : 1;
                const prefB = b[1] === preferredH ? 0 : 1;
                if (prefA !== prefB) return prefA - prefB;
                const fixA = isProtectedFixedOff(iid, a[0], a[1]) ? 0 : 1;
                const fixB = isProtectedFixedOff(iid, b[0], b[1]) ? 0 : 1;
                return fixA - fixB;
              });

              for (const [dIso, h, jsDay] of slotCandidates) {
                const cKey = dIso + "__" + iid;
                if (custom[cKey] && custom[cKey][h]) continue;
                const phSet = getPhInternePostesForHalfDay(dIso, h, jsDay);
                const byInt = st.schedule[dIso].byInterne;
                const slot = byInt[iid];
                if (!slot || nonActivePostes.includes(slot[h])) continue;

                // Passe 1 : libérer directement une vacation non obligatoire
                for (const candPoste of nonMandatoryPriority) {
                  if (phSet.has(candPoste)) continue;
                  if (slot[h] === candPoste) {
                    const nk = h === "am" ? "noteAm" : "notePm";
                    slot[h] = "1/2 journée libre";
                    slot[nk] = isProtectedFixedOff(iid, dIso, h)
                      ? "Demi-journée off fixe hebdomadaire"
                      : "Demi-off hebdomadaire (hors vacations obligatoires)";
                    if (!slot.note) slot.note = slot[nk];
                    offCnt++;
                    freed = true;
                    break;
                  }
                }
                if (freed) break;

                // Passe 2 : échanger sur la même demi-journée avec un co-interne senior occupant une vacation non obligatoire
                if (seniorIds.includes(iid)) {
                  for (const candNonMand of nonMandatoryPriority) {
                    if (phSet.has(candNonMand)) continue;
                    for (const otherId of seniorIds) {
                      if (otherId === iid) continue;
                      if (custom[dIso + "__" + otherId] && custom[dIso + "__" + otherId][h]) continue;
                      if (byInt[otherId] && byInt[otherId][h] === candNonMand) {
                        const nk = h === "am" ? "noteAm" : "notePm";
                        byInt[otherId][h] = slot[h];
                        slot[h] = "1/2 journée libre";
                        slot[nk] = isProtectedFixedOff(iid, dIso, h)
                          ? "Demi-journée off fixe hebdomadaire"
                          : "Demi-off hebdomadaire (équilibré)";
                        if (!slot.note) slot.note = slot[nk];
                        offCnt++;
                        freed = true;
                        break;
                      }
                    }
                    if (freed) break;
                  }
                }
                if (freed) break;
              }
              if (!freed) break;
            }
          });

          // 2B-bis. Quotas hebdomadaires (TDM SAU & IRM d'après-midi max 1/sem) + Règle Matin != Après-midi :
          //   - 2 TDM SAU / semaine pour les 5 internes seniors (3 uniquement à titre exceptionnel en cas de congés/RG)
          //   - 3 TDM SAU / semaine pour Noé (Phase Socle), plus uniquement exceptionnellement
          //   - Maximum 1 IRM d'après-midi ("IRM" en PM) par semaine par interne (sauf exception)
          //   - Interdiction pour un interne de faire le même poste toute la journée (am !== pm)
          const countWeekSauJs = (interneId) => {
            let cnt = 0;
            activeIsos.forEach(dChk => {
              const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
              if (!sl) return;
              if (sl.am === "TDM SAU") cnt++;
              if (sl.pm === "TDM SAU") cnt++;
            });
            return cnt;
          };

          const countWeekSauHalfJs = (interneId, halfKey) => {
            let cnt = 0;
            activeIsos.forEach(dChk => {
              const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
              if (sl && sl[halfKey] === "TDM SAU") cnt++;
            });
            return cnt;
          };

          const countWeekIrmPmJs = (interneId) => {
            let cnt = 0;
            activeIsos.forEach(dChk => {
              const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
              if (sl && sl.pm === "IRM") cnt++;
            });
            return cnt;
          };

          const isSamePosteDayJs = (pAm, pPm) => {
            if (!pAm || !pPm || nonActivePostes.includes(pAm) || nonActivePostes.includes(pPm)) return false;
            return pAm === pPm;
          };

          for (let iter = 0; iter < 25; iter++) {
            const sauCounts = {};
            seniorIds.forEach(sId => { sauCounts[sId] = countWeekSauJs(sId); });
            const overSids = seniorIds.filter(sId => sauCounts[sId] > 2).sort((a, b) => sauCounts[b] - sauCounts[a]);
            if (!overSids.length) break;
            let swappedSau = false;

            for (const overSid of overSids) {
              let underSids = seniorIds.filter(sId => sauCounts[sId] < 2).sort((a, b) => sauCounts[a] - sauCounts[b]);
              if (sauCounts[overSid] > 3) {
                underSids = [...underSids, ...seniorIds.filter(sId => sauCounts[sId] === 2)];
              }
              const overHalves = countWeekSauHalfJs(overSid, "am") >= countWeekSauHalfJs(overSid, "pm") ? ["am", "pm"] : ["pm", "am"];
              // 1. Échange direct sur la même demi-journée
              for (const underSid of underSids) {
                for (const dIso of activeIsos) {
                  if (dIso === "2026-11-02") continue;
                  const byInt = st.schedule[dIso].byInterne;
                  for (const h of overHalves) {
                    const otherH = h === "am" ? "pm" : "am";
                    if (custom[dIso + "__" + overSid] && custom[dIso + "__" + overSid][h]) continue;
                    if (custom[dIso + "__" + underSid] && custom[dIso + "__" + underSid][h]) continue;
                    if (!byInt[overSid] || byInt[overSid][h] !== "TDM SAU") continue;
                    const otherP = byInt[underSid] ? byInt[underSid][h] : "";
                    if (!otherP || nonActivePostes.includes(otherP) || otherP === "TDM SAU") continue;
                    if (isSamePosteDayJs(otherP, byInt[overSid][otherH]) || isSamePosteDayJs("TDM SAU", byInt[underSid][otherH])) continue;
                    if (h === "pm" && otherP === "IRM" && countWeekIrmPmJs(overSid) >= 1) continue;
                    const nk = h === "am" ? "noteAm" : "notePm";
                    const otherNote = byInt[underSid][nk] || "";
                    byInt[overSid][h] = otherP;
                    byInt[overSid][nk] = otherNote;
                    byInt[underSid][h] = "TDM SAU";
                    byInt[underSid][nk] = "";
                    swappedSau = true;
                    break;
                  }
                  if (swappedSau) break;
                }
                if (swappedSau) break;
              }
              if (swappedSau) break;

              // 2. Échange en 2 étapes via un senior intermédiaire (midSid)
              for (const underSid of underSids) {
                for (const midSid of seniorIds) {
                  if (midSid === overSid || midSid === underSid) continue;
                  let step1 = null;
                  for (const dIso of activeIsos) {
                    if (dIso === "2026-11-02") continue;
                    const byInt = st.schedule[dIso].byInterne;
                    for (const h of overHalves) {
                      const otherH = h === "am" ? "pm" : "am";
                      if (custom[dIso + "__" + overSid] && custom[dIso + "__" + overSid][h]) continue;
                      if (custom[dIso + "__" + midSid] && custom[dIso + "__" + midSid][h]) continue;
                      if (byInt[overSid] && byInt[overSid][h] === "TDM SAU" && byInt[midSid] && !nonActivePostes.includes(byInt[midSid][h]) && byInt[midSid][h] !== "TDM SAU") {
                        const pMid = byInt[midSid][h];
                        if (isSamePosteDayJs(pMid, byInt[overSid][otherH]) || isSamePosteDayJs("TDM SAU", byInt[midSid][otherH])) continue;
                        if (h === "pm" && pMid === "IRM" && countWeekIrmPmJs(overSid) >= 1) continue;
                        step1 = [dIso, h];
                        break;
                      }
                    }
                    if (step1) break;
                  }
                  if (!step1) continue;
                  let step2 = null;
                  for (const dIso of activeIsos) {
                    if (dIso === "2026-11-02") continue;
                    const byInt = st.schedule[dIso].byInterne;
                    for (const h of ["am", "pm"]) {
                      if (dIso === step1[0] && h === step1[1]) continue;
                      const otherH = h === "am" ? "pm" : "am";
                      if (custom[dIso + "__" + midSid] && custom[dIso + "__" + midSid][h]) continue;
                      if (custom[dIso + "__" + underSid] && custom[dIso + "__" + underSid][h]) continue;
                      if (byInt[midSid] && byInt[midSid][h] === "TDM SAU" && byInt[underSid] && !nonActivePostes.includes(byInt[underSid][h]) && byInt[underSid][h] !== "TDM SAU") {
                        const pUnd = byInt[underSid][h];
                        if (isSamePosteDayJs(pUnd, byInt[midSid][otherH]) || isSamePosteDayJs("TDM SAU", byInt[underSid][otherH])) continue;
                        if (h === "pm" && pUnd === "IRM" && countWeekIrmPmJs(midSid) >= 1) continue;
                        step2 = [dIso, h];
                        break;
                      }
                    }
                    if (step2) break;
                  }
                  if (step1 && step2) {
                    const [d1, h1] = step1;
                    const nk1 = h1 === "am" ? "noteAm" : "notePm";
                    const by1 = st.schedule[d1].byInterne;
                    const p1 = by1[midSid][h1], n1 = by1[midSid][nk1] || "";
                    by1[overSid][h1] = p1;
                    by1[overSid][nk1] = n1;
                    by1[midSid][h1] = "TDM SAU";
                    by1[midSid][nk1] = "";

                    const [d2, h2] = step2;
                    const nk2 = h2 === "am" ? "noteAm" : "notePm";
                    const by2 = st.schedule[d2].byInterne;
                    const p2 = by2[underSid][h2], n2 = by2[underSid][nk2] || "";
                    by2[midSid][h2] = p2;
                    by2[midSid][nk2] = n2;
                    by2[underSid][h2] = "TDM SAU";
                    by2[underSid][nk2] = "";
                    swappedSau = true;
                    break;
                  }
                }
                if (swappedSau) break;
              }
              if (swappedSau) break;
            }
            if (!swappedSau) break;
          }

          // 2B-ter. Règle des IRM d'après-midi : maximum 1 IRM PM par semaine par interne (sauf exception)
          const allIidsJs = (st.internes || []).map(x => x.id);
          for (let iterIrm = 0; iterIrm < 20; iterIrm++) {
            const irmCounts = {};
            allIidsJs.forEach(id => { irmCounts[id] = countWeekIrmPmJs(id); });
            const overIrmIds = allIidsJs.filter(id => irmCounts[id] > 1);
            if (!overIrmIds.length) break;
            let swappedIrm = false;
            for (const overId of overIrmIds) {
              const zeroIrmIds = allIidsJs.filter(id => irmCounts[id] === 0 && id !== overId);
              for (const dIso of activeIsos) {
                if (dIso === "2026-11-02") continue;
                if (custom[dIso + "__" + overId] && custom[dIso + "__" + overId].pm) continue;
                const byInt = st.schedule[dIso].byInterne;
                if (!byInt[overId] || byInt[overId].pm !== "IRM") continue;
                for (const candId of zeroIrmIds) {
                  if (custom[dIso + "__" + candId] && custom[dIso + "__" + candId].pm) continue;
                  if (!byInt[candId]) continue;
                  const candPm = byInt[candId].pm;
                  if (!candPm || nonActivePostes.includes(candPm) || candPm === "IRM") continue;
                  if (candPm === "TDM SAU" && (candId === "noe" || overId === "noe" || countWeekSauJs(overId) >= 2)) continue;
                  if (isSamePosteDayJs(byInt[overId].am, candPm) || isSamePosteDayJs(byInt[candId].am, "IRM")) continue;
                  const nOver = byInt[overId].notePm || "";
                  const nCand = byInt[candId].notePm || "";
                  byInt[overId].pm = candPm;
                  byInt[overId].notePm = nCand;
                  byInt[candId].pm = "IRM";
                  byInt[candId].notePm = nOver;
                  swappedIrm = true;
                  break;
                }
                if (swappedIrm) break;
              }
              if (swappedIrm) break;
            }
            if (!swappedIrm) break;
          }

          // 2B-quater. Règle stricte : un interne ne peut pas faire le même poste toute la journée (am !== pm)
          for (let iterSame = 0; iterSame < 25; iterSame++) {
            let fixedSame = false;
            for (const dIso of activeIsos) {
              const byInt = st.schedule[dIso].byInterne;
              for (const iid of allIidsJs) {
                const sl = byInt[iid];
                if (!sl || !isSamePosteDayJs(sl.am, sl.pm)) continue;
                for (const h of ["pm", "am"]) {
                  if (dIso === "2026-11-02" && h === "am") continue;
                  if (custom[dIso + "__" + iid] && custom[dIso + "__" + iid][h]) continue;
                  const otherH = h === "am" ? "pm" : "am";
                  const curP = sl[h];
                  const swapPool = seniorIds.includes(iid) ? seniorIds : allIidsJs;
                  for (const otherId of swapPool) {
                    if (otherId === iid) continue;
                    if (custom[dIso + "__" + otherId] && custom[dIso + "__" + otherId][h]) continue;
                    const oSl = byInt[otherId];
                    if (!oSl) continue;
                    const candP = oSl[h];
                    if (!candP || nonActivePostes.includes(candP) || candP === curP) continue;
                    if ((curP === "TDM SAU" || candP === "TDM SAU") && (iid === "noe" || otherId === "noe")) continue;
                    if (isSamePosteDayJs(candP, sl[otherH]) || isSamePosteDayJs(curP, oSl[otherH])) continue;
                    if (h === "pm" && candP === "IRM" && countWeekIrmPmJs(iid) >= 1) continue;
                    if (h === "pm" && curP === "IRM" && countWeekIrmPmJs(otherId) >= 1) continue;
                    const nk = h === "am" ? "noteAm" : "notePm";
                    const n1 = sl[nk] || "";
                    const n2 = oSl[nk] || "";
                    sl[h] = candP;
                    sl[nk] = n2;
                    oSl[h] = curP;
                    oSl[nk] = n1;
                    fixedSame = true;
                    break;
                  }
                  if (fixedSame) break;
                }
                if (fixedSame) break;
              }
              if (fixedSame) break;
            }
            if (!fixedSame) break;
          }

          // 2B-quinquies. Équilibrage des vacations TDM SAU Matin (am) et Après-midi (pm) dans la limite du possible
          const canSwapSauHalfJs = (dIso, hKey, fromSid, toSid) => {
            if (dIso === "2026-11-02") return false;
            if (custom[dIso + "__" + fromSid] && custom[dIso + "__" + fromSid][hKey]) return false;
            if (custom[dIso + "__" + toSid] && custom[dIso + "__" + toSid][hKey]) return false;
            const byS = st.schedule[dIso].byInterne;
            if (!byS[fromSid] || byS[fromSid][hKey] !== "TDM SAU" || !byS[toSid]) return false;
            const otherP = byS[toSid][hKey];
            if (!otherP || nonActivePostes.includes(otherP) || otherP === "TDM SAU") return false;
            const otherH = hKey === "am" ? "pm" : "am";
            if (isSamePosteDayJs(otherP, byS[fromSid][otherH]) || isSamePosteDayJs("TDM SAU", byS[toSid][otherH])) return false;
            if (hKey === "pm" && otherP === "IRM" && countWeekIrmPmJs(fromSid) >= 1) return false;
            return true;
          };
          const execSwapSauHalfJs = (dIso, hKey, fromSid, toSid) => {
            const byS = st.schedule[dIso].byInterne;
            const nk = hKey === "am" ? "noteAm" : "notePm";
            const pOther = byS[toSid][hKey];
            const nOther = byS[toSid][nk] || "";
            byS[fromSid][hKey] = pOther;
            byS[fromSid][nk] = nOther;
            byS[toSid][hKey] = "TDM SAU";
            byS[toSid][nk] = "";
          };
          for (let iterSauBal = 0; iterSauBal < 20; iterSauBal++) {
            let swappedBal = false;
            for (const sidA of seniorIds) {
              const wAmA = countWeekSauHalfJs(sidA, "am");
              const wPmA = countWeekSauHalfJs(sidA, "pm");
              if (wAmA - wPmA < 2) continue;
              for (const sidB of seniorIds) {
                if (sidB === sidA) continue;
                const wAmB = countWeekSauHalfJs(sidB, "am");
                const wPmB = countWeekSauHalfJs(sidB, "pm");
                if (wPmB - wAmB < 2) continue;
                const dAm = activeIsos.find(d => canSwapSauHalfJs(d, "am", sidA, sidB));
                if (!dAm) continue;
                const dPm = activeIsos.find(d => d !== dAm && canSwapSauHalfJs(d, "pm", sidB, sidA));
                if (dAm && dPm) {
                  execSwapSauHalfJs(dAm, "am", sidA, sidB);
                  execSwapSauHalfJs(dPm, "pm", sidB, sidA);
                  swappedBal = true;
                  break;
                }
              }
              if (swappedBal) break;
            }
            if (!swappedBal) break;
          }

          // 2B-sexies. Équilibrage des vacations de Poste C (GESTES (C) / RI) entre les internes
          const countWeekGestesJs = (interneId) => {
            let cnt = 0;
            activeIsos.forEach(dChk => {
              const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
              if (!sl) return;
              if (sl.am === "GESTES (C)" || sl.am === "ALLURA") cnt++;
              if (sl.pm === "GESTES (C)" || sl.pm === "ALLURA") cnt++;
            });
            return cnt;
          };
          const countWeekGestesHalfJs = (interneId, halfKey) => {
            let cnt = 0;
            activeIsos.forEach(dChk => {
              const sl = st.schedule[dChk] && st.schedule[dChk].byInterne && st.schedule[dChk].byInterne[interneId];
              if (sl && sl[halfKey] === "GESTES (C)") cnt++;
            });
            return cnt;
          };
          const canSwapGestesSlotJs = (dIso, hKey, fromSid, toSid) => {
            if (dIso === "2026-11-02") return false;
            if (custom[dIso + "__" + fromSid] && custom[dIso + "__" + fromSid][hKey]) return false;
            if (custom[dIso + "__" + toSid] && custom[dIso + "__" + toSid][hKey]) return false;
            const byS = st.schedule[dIso].byInterne;
            if (!byS[fromSid] || byS[fromSid][hKey] !== "GESTES (C)" || !byS[toSid]) return false;
            const otherP = byS[toSid][hKey];
            if (!otherP || nonActivePostes.includes(otherP) || ["TDM SAU", "GESTES (C)", "ALLURA"].includes(otherP)) return false;
            const otherH = hKey === "am" ? "pm" : "am";
            if (isSamePosteDayJs(otherP, byS[fromSid][otherH]) || isSamePosteDayJs("GESTES (C)", byS[toSid][otherH])) return false;
            if (hKey === "pm" && otherP === "IRM" && countWeekIrmPmJs(fromSid) >= 1) return false;
            return true;
          };
          const execSwapGestesSlotJs = (dIso, hKey, fromSid, toSid) => {
            const byS = st.schedule[dIso].byInterne;
            const nk = hKey === "am" ? "noteAm" : "notePm";
            const pOther = byS[toSid][hKey];
            const nFrom = byS[fromSid][nk] || "";
            const nTo = byS[toSid][nk] || "";
            byS[fromSid][hKey] = pOther;
            byS[fromSid][nk] = nTo;
            byS[toSid][hKey] = "GESTES (C)";
            byS[toSid][nk] = nFrom;
          };
          for (let iterG = 0; iterG < 30; iterG++) {
            let swappedG = false;
            const sortedSeniorsG = seniorIds.slice().sort((a, b) => {
              const wa = countWeekGestesJs(a), wb = countWeekGestesJs(b);
              const hiA = wa >= 2 ? 1 : 0, hiB = wb >= 2 ? 1 : 0;
              if (hiA !== hiB) return hiB - hiA;
              const ca = (totalGestesCounts[a] || 0) + wa, cb = (totalGestesCounts[b] || 0) + wb;
              if (ca !== cb) return cb - ca;
              return wb - wa;
            });
            for (const sidOver of sortedSeniorsG) {
              const wOver = countWeekGestesJs(sidOver);
              if (wOver === 0) continue;
              const cOver = (totalGestesCounts[sidOver] || 0) + wOver;
              for (let uIdx = sortedSeniorsG.length - 1; uIdx >= 0; uIdx--) {
                const sidUnder = sortedSeniorsG[uIdx];
                if (sidUnder === sidOver) continue;
                const wUnder = countWeekGestesJs(sidUnder);
                const cUnder = (totalGestesCounts[sidUnder] || 0) + wUnder;
                if (!(
                  (wOver >= 2 && wUnder === 0 && cOver >= cUnder) ||
                  (wOver >= 3 && wUnder <= 1) ||
                  (cOver >= cUnder + 2 && wUnder + 1 <= Math.max(2, wOver))
                )) continue;
                const overAmDiff = ((totalGestesAmCounts[sidOver] || 0) + countWeekGestesHalfJs(sidOver, "am")) - ((totalGestesPmCounts[sidOver] || 0) + countWeekGestesHalfJs(sidOver, "pm"));
                const underAmDiff = ((totalGestesAmCounts[sidUnder] || 0) + countWeekGestesHalfJs(sidUnder, "am")) - ((totalGestesPmCounts[sidUnder] || 0) + countWeekGestesHalfJs(sidUnder, "pm"));
                const prefHalves = overAmDiff >= underAmDiff ? ["am", "pm"] : ["pm", "am"];
                for (const hG of prefHalves) {
                  for (const dIso of activeIsos) {
                    if (canSwapGestesSlotJs(dIso, hG, sidOver, sidUnder)) {
                      execSwapGestesSlotJs(dIso, hG, sidOver, sidUnder);
                      swappedG = true;
                      break;
                    }
                  }
                  if (swappedG) break;
                }
                if (swappedG) break;
              }
              if (swappedG) break;
            }
            if (!swappedG) break;
          }

        }

        // Accumuler les compteurs inter-semaines sur baseSched (et non st.schedule)
        // afin qu'un congé posé sur une semaine X ne modifie jamais le planning d'une autre semaine Y != X.
        (st.internes || []).forEach(intObj => {
          const iid = intObj.id;
          let bVacHalf = 0, bOffAm = 0, bOffPm = 0, bSauAm = 0, bSauPm = 0, bGestes = 0, bGestesAm = 0, bGestesPm = 0, bCs = 0, bLecture = 0;
          activeIsos.forEach(dChk => {
            const bSl = baseSched[dChk] && baseSched[dChk].byInterne && baseSched[dChk].byInterne[iid];
            if (!bSl) return;
            if (bSl.am === "VACANCES" || bSl.am === "RG") bVacHalf++;
            else if (bSl.am === "1/2 journée libre") bOffAm++;
            if (bSl.pm === "VACANCES" || bSl.pm === "RG") bVacHalf++;
            else if (bSl.pm === "1/2 journée libre") bOffPm++;
            if (bSl.am === "TDM SAU") bSauAm++;
            if (bSl.pm === "TDM SAU") bSauPm++;
            if (bSl.am === "GESTES (C)" || bSl.am === "ALLURA") bGestes++;
            if (bSl.pm === "GESTES (C)" || bSl.pm === "ALLURA") bGestes++;
            if (bSl.am === "GESTES (C)") bGestesAm++;
            if (bSl.pm === "GESTES (C)") bGestesPm++;
            if (bSl.am === "CONSULTATION" || bSl.pm === "CONSULTATION") bCs++;
            if (bSl.am === "LECTURE" || bSl.pm === "LECTURE") bLecture++;
          });
          const bOffTotal = bOffAm + bOffPm;
          totalAmOffs[iid] = (totalAmOffs[iid] || 0) + bOffAm;
          totalPmOffs[iid] = (totalPmOffs[iid] || 0) + bOffPm;
          if (bVacHalf < 6) {
            carryOverOffs[iid] = Math.max(0, (carryOverOffs[iid] || 0) + (2 - bOffTotal));
          }
          totalSauAmCounts[iid] = (totalSauAmCounts[iid] || 0) + bSauAm;
          totalSauPmCounts[iid] = (totalSauPmCounts[iid] || 0) + bSauPm;
          totalGestesCounts[iid] = (totalGestesCounts[iid] || 0) + bGestes;
          totalGestesAmCounts[iid] = (totalGestesAmCounts[iid] || 0) + bGestesAm;
          totalGestesPmCounts[iid] = (totalGestesPmCounts[iid] || 0) + bGestesPm;
          totalCsCounts[iid] = (totalCsCounts[iid] || 0) + bCs;
          totalLectureCounts[iid] = (totalLectureCounts[iid] || 0) + bLecture;
        });

        // 2C. Mise à jour des notes de binôme de Noé (Phase Socle) — uniquement sur semaine non verrouillée
        if (!isWeekLocked) {
          activeIsos.forEach(iso => {
            const dayObj = st.schedule[iso];
            const [yy, mm, dd] = iso.split("-").map(Number);
            const jsDay = new Date(yy, mm - 1, dd).getDay();
            ["am", "pm"].forEach(h => {
              const nk = h === "am" ? "noteAm" : "notePm";
              if (!dayObj.byInterne.noe) return;
              const noeSlot = dayObj.byInterne.noe;
              const noeP = noeSlot[h];
              if (!noeP || nonActivePostes.includes(noeP)) return;
              if (noeP === "TDM SAU") {
                const sauPartners = seniorIds
                  .filter(sId => dayObj.byInterne[sId] && dayObj.byInterne[sId][h] === "TDM SAU")
                  .map(sId => {
                    const iObj = (st.internes || []).find(x => x.id === sId);
                    return iObj ? iObj.shortName : sId;
                  });
                if (sauPartners.length > 0) {
                  const pStr = sauPartners.join(" & ");
                  if (h === "am" && (jsDay === 2 || jsDay === 4)) {
                    noeSlot[nk] = `Avec Dr Macil HAMADOUCHE (MH) • Binôme SAU avec ${pStr}`;
                  } else {
                    noeSlot[nk] = `Posté Socle Urgences • Binôme SAU avec ${pStr}`;
                  }
                } else if (jsDay === 2 && h === "am") {
                  noeSlot[nk] = "Avec Dr Macil HAMADOUCHE (MH) — Solo SAU (exceptionnellement sans doublure)";
                }
              }
            });
            if (dayObj.byInterne.noe) {
              const noeSlot = dayObj.byInterne.noe;
              const cKeyNoe = iso + "__noe";
              if (iso !== "2026-11-02" && !nonActivePostes.includes(noeSlot.am) && !nonActivePostes.includes(noeSlot.pm) && !(custom[cKeyNoe] && custom[cKeyNoe].note)) {
                noeSlot.note = [noeSlot.noteAm, noeSlot.notePm].filter(Boolean).join(" • ");
              }
            }
          });
        }
      });

      // 2D. Équilibrage global des Consultations (CONSULTATION : max 1/semaine, Noé uniquement les 2 derniers mois Mars-Avril, égalisation totale et équilibre Mardi/Vendredi)
      //     et 2E. Équilibrage global des vacations d'ÉCHOGRAPHIE et d'IRM sur les semaines non verrouillées
      {
        const allIidsGlobal = (st.internes || []).map(x => x.id);
        const seniorIidsGlobal = allIidsGlobal.filter(x => x !== "noe");
        const targetCsGlobal = (iid) => (iid === "noe" ? 3 : 9);
        const isSamePosteDayGlobal = (p1, p2) => {
          if (!p1 || !p2) return false;
          if (nonActivePostes.includes(p1) || nonActivePostes.includes(p2)) return false;
          if (p1 === p2) return true;
          const irmSet = ["IRM", "IRM 1,5T", "IRM 3T"];
          if (irmSet.includes(p1) && irmSet.includes(p2)) return true;
          return false;
        };
        const formatPmNoteForPosteGlobal = (dIso, iid, pCode) => {
          const [yy, mm, dd] = dIso.split("-").map(Number);
          const jsDay = new Date(yy, mm - 1, dd).getDay();
          if (pCode === "CONSULTATION") {
            return jsDay === 2 ? "Consultation Internes (Mardi PM)" : "Consultation Internes (Vendredi PM)";
          }
          if (pCode === "LECTURE") {
            if (jsDay === 2 && !isNoDrapeRelectureTuesday(dIso, jsDay)) return iid === "noe" ? "Relecture avec Pr Drapé" : "Relecture avec Pr Drapé (systématique)";
            return "Lecture (Vendredi PM)";
          }
          if (iid === "noe") return `Phase Socle (${pCode})`;
          return "";
        };
        const unlockedWeekMons = Object.keys(weeksMap).sort().filter(monIso => {
          return !(st.lockedWeeks && st.lockedWeeks[monIso] && st.lockedWeeks[monIso].locked);
        });
        // Si un Vendredi PM n'a pas de CONSULTATION mais a une LECTURE disponible (ex: interne en VACANCES), convertir LECTURE -> CONSULTATION
        unlockedWeekMons.forEach(monIso => {
          weeksMap[monIso].forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const [yy, mm, dd] = dIso.split("-").map(Number);
            const jsDay = new Date(yy, mm - 1, dd).getDay();
            if (jsDay !== 5) return;
            const byS = st.schedule[dIso].byInterne;
            const hasCs = allIidsGlobal.some(iid => byS[iid] && byS[iid].pm === "CONSULTATION");
            if (!hasCs) {
              for (const iid of allIidsGlobal) {
                if (iid === "noe" && dIso < "2027-03-01") continue;
                if (custom[dIso + "__" + iid] && custom[dIso + "__" + iid].pm) continue;
                const sl = byS[iid];
                if (sl && sl.pm === "LECTURE" && !isSamePosteDayGlobal(sl.am, "CONSULTATION")) {
                  sl.pm = "CONSULTATION";
                  sl.notePm = formatPmNoteForPosteGlobal(dIso, iid, "CONSULTATION");
                  if (!(custom[dIso + "__" + iid] && custom[dIso + "__" + iid].note)) {
                    sl.note = [sl.noteAm, sl.notePm].filter(Boolean).join(" • ");
                  }
                  break;
                }
              }
            }
          });
        });
        const getWeekCsCountGlobal = (monIso, iid) => {
          let c = 0;
          (weeksMap[monIso] || []).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "CONSULTATION") c++;
            if (sl.pm === "CONSULTATION") c++;
          });
          return c;
        };
        const getTotalCsCountGlobal = (iid) => {
          let c = 0;
          Object.keys(st.schedule).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "CONSULTATION") c++;
            if (sl.pm === "CONSULTATION") c++;
          });
          return c;
        };
        const getTotalCsDayCountGlobal = (iid, targetJsDay) => {
          let c = 0;
          Object.keys(st.schedule).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const [yy, mm, dd] = dIso.split("-").map(Number);
            if (new Date(yy, mm - 1, dd).getDay() !== targetJsDay) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "CONSULTATION") c++;
            if (sl.pm === "CONSULTATION") c++;
          });
          return c;
        };
        const canSwapCsGlobal = (dIso, fromId, toId, allowedPostes) => {
          if (dIso === "2026-11-02") return false;
          if (toId === "noe" && dIso < "2027-03-01") return false;
          if (!st.schedule[dIso] || st.schedule[dIso].holiday) return false;
          if (custom[dIso + "__" + fromId] && custom[dIso + "__" + fromId].pm) return false;
          if (custom[dIso + "__" + toId] && custom[dIso + "__" + toId].pm) return false;
          const [yy, mm, dd] = dIso.split("-").map(Number);
          const jsDay = new Date(yy, mm - 1, dd).getDay();
          const byS = st.schedule[dIso].byInterne;
          if (!byS[fromId] || byS[fromId].pm !== "CONSULTATION" || !byS[toId]) return false;
          const pOther = byS[toId].pm;
          if (!pOther || !allowedPostes.includes(pOther)) return false;
          if (jsDay === 2 && pOther === "LECTURE" && fromId === "noe") return false;
          if ((fromId === "noe" || toId === "noe") && pOther !== "LECTURE" && fromId !== "noe") {
            if (seniorIidsGlobal.some(sId => sId !== fromId && byS[sId] && byS[sId].pm === pOther)) return false;
          }
          if (isSamePosteDayGlobal(byS[fromId].am, pOther) || isSamePosteDayGlobal(byS[toId].am, "CONSULTATION")) return false;
          return true;
        };
        const execSwapCsGlobal = (dIso, fromId, toId) => {
          const byS = st.schedule[dIso].byInterne;
          const pOther = byS[toId].pm;
          byS[fromId].pm = pOther;
          byS[fromId].notePm = formatPmNoteForPosteGlobal(dIso, fromId, pOther);
          if (!(custom[dIso + "__" + fromId] && custom[dIso + "__" + fromId].note)) {
            byS[fromId].note = [byS[fromId].noteAm, byS[fromId].notePm].filter(Boolean).join(" • ");
          }
          byS[toId].pm = "CONSULTATION";
          byS[toId].notePm = formatPmNoteForPosteGlobal(dIso, toId, "CONSULTATION");
          if (!(custom[dIso + "__" + toId] && custom[dIso + "__" + toId].note)) {
            byS[toId].note = [byS[toId].noteAm, byS[toId].notePm].filter(Boolean).join(" • ");
          }
        };

        // 0) Avant le 01/03/2027, Noé ne fait pas de consultation : transférer vers un senior
        unlockedWeekMons.forEach(monIso => {
          (weeksMap[monIso] || []).forEach(dIso => {
            if (dIso >= "2027-03-01" || !st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const byS = st.schedule[dIso].byInterne;
            if (!byS || !byS.noe || byS.noe.pm !== "CONSULTATION") return;
            let swN = false;
            const candsS = seniorIidsGlobal
              .filter(s => getWeekCsCountGlobal(monIso, s) === 0)
              .sort((a, b) => getTotalCsCountGlobal(a) - getTotalCsCountGlobal(b));
            for (const allowedList of [["LECTURE"], ["LECTURE", "ECHO", "SCAN ACHARD", "TDM OLLIER DIAG"]]) {
              for (const uId of candsS) {
                if (canSwapCsGlobal(dIso, "noe", uId, allowedList)) {
                  execSwapCsGlobal(dIso, "noe", uId);
                  swN = true;
                  break;
                }
              }
              if (swN) break;
              for (const midS of seniorIidsGlobal) {
                if (getWeekCsCountGlobal(monIso, midS) !== 1 || !canSwapCsGlobal(dIso, "noe", midS, allowedList)) continue;
                const d2 = (weeksMap[monIso] || []).find(dt => dt !== dIso && st.schedule[dt] && !st.schedule[dt].holiday && st.schedule[dt].byInterne[midS] && st.schedule[dt].byInterne[midS].pm === "CONSULTATION");
                if (!d2) continue;
                for (const uId of candsS) {
                  if (canSwapCsGlobal(d2, midS, uId, allowedList)) {
                    execSwapCsGlobal(d2, midS, uId);
                    execSwapCsGlobal(dIso, "noe", midS);
                    swN = true;
                    break;
                  }
                }
                if (swN) break;
              }
              if (swN) break;
            }
          });
        });

        // 1) Éliminer les semaines avec >= 2 consultations pour un même interne
        unlockedWeekMons.forEach(monIso => {
          for (let it = 0; it < 10; it++) {
            let sw = false;
            for (const allowedList of [["LECTURE"], ["LECTURE", "ECHO", "SCAN ACHARD", "TDM OLLIER DIAG"]]) {
              for (const overId of allIidsGlobal) {
                if (getWeekCsCountGlobal(monIso, overId) < 2) continue;
                const underCandidates = allIidsGlobal
                  .filter(u => u !== overId && getWeekCsCountGlobal(monIso, u) === 0 && !(u === "noe" && monIso < "2027-03-01"))
                  .sort((a, b) => (getTotalCsCountGlobal(a) - targetCsGlobal(a)) - (getTotalCsCountGlobal(b) - targetCsGlobal(b)));
                for (const underId of underCandidates) {
                  for (const dIso of weeksMap[monIso]) {
                    if (canSwapCsGlobal(dIso, overId, underId, allowedList)) {
                      execSwapCsGlobal(dIso, overId, underId);
                      sw = true;
                      break;
                    }
                  }
                  if (sw) break;
                }
                if (sw) break;
              }
              if (sw) break;
            }
            if (!sw) break;
          }
        });

        // 2) Égaliser le total de CONSULTATION sur le semestre (cible 8-9 pour les seniors, 3 pour Noé sur les 2 derniers mois)
        for (let iterG = 0; iterG < 80; iterG++) {
          let swappedG = false;
          const counts = {}, eff = {};
          allIidsGlobal.forEach(iid => {
            counts[iid] = getTotalCsCountGlobal(iid);
            eff[iid] = counts[iid] - targetCsGlobal(iid);
          });
          const sortedIids = allIidsGlobal.slice().sort((a, b) => {
            if (eff[b] !== eff[a]) return eff[b] - eff[a];
            if ((a === "noe") !== (b === "noe")) return a === "noe" ? -1 : 1;
            return counts[b] - counts[a];
          });
          if (eff[sortedIids[0]] - eff[sortedIids[sortedIids.length - 1]] <= 1 && counts.noe <= 3) break;

          for (const allowedList of [["LECTURE"], ["LECTURE", "ECHO", "SCAN ACHARD", "TDM OLLIER DIAG"]]) {
            for (const overId of sortedIids) {
              for (let uIdx = sortedIids.length - 1; uIdx >= 0; uIdx--) {
                const underId = sortedIids[uIdx];
                if (underId === overId) continue;
                if (underId === "noe" && counts.noe >= 3) continue;
                const diffEff = eff[overId] - eff[underId];
                if (!(diffEff >= 2 || (overId === "noe" && counts.noe > 3 && diffEff >= 1))) continue;
                for (const monIso of unlockedWeekMons) {
                  if (underId === "noe" && monIso < "2027-03-01") continue;
                  if (getWeekCsCountGlobal(monIso, overId) === 0 || getWeekCsCountGlobal(monIso, underId) > 0) continue;
                  for (const dIso of weeksMap[monIso]) {
                    if (canSwapCsGlobal(dIso, overId, underId, allowedList)) {
                      execSwapCsGlobal(dIso, overId, underId);
                      swappedG = true;
                      break;
                    }
                  }
                  if (swappedG) break;
                }
                if (swappedG) break;
              }
              if (swappedG) break;
            }
            if (swappedG) break;
          }
          if (!swappedG) break;
        }

        // 3) Équilibrer Mardi PM vs Vendredi PM sans dégrader le total par interne
        for (let iterTF = 0; iterTF < 40; iterTF++) {
          let swappedTF = false;
          const totalC = {}, tueC = {}, friC = {};
          allIidsGlobal.forEach(iid => {
            totalC[iid] = getTotalCsCountGlobal(iid);
            tueC[iid] = getTotalCsDayCountGlobal(iid, 2);
            friC[iid] = getTotalCsDayCountGlobal(iid, 5);
          });
          for (const allowedList of [["LECTURE"], ["LECTURE", "ECHO", "SCAN ACHARD", "TDM OLLIER DIAG"]]) {
            for (const overTueId of allIidsGlobal) {
              if (tueC[overTueId] < friC[overTueId]) continue;
              for (const overFriId of allIidsGlobal) {
                if (overFriId === overTueId) continue;
                if (friC[overFriId] < tueC[overFriId]) continue;
                if ((tueC[overTueId] - friC[overTueId]) + (friC[overFriId] - tueC[overFriId]) < 4) continue;
                if (Math.abs((totalC[overTueId] - targetCsGlobal(overTueId)) - (totalC[overFriId] - targetCsGlobal(overFriId))) > 1) continue;
                for (const monTue of unlockedWeekMons) {
                  if (overFriId === "noe" && monTue < "2027-03-01") continue;
                  if (getWeekCsCountGlobal(monTue, overTueId) === 0 || getWeekCsCountGlobal(monTue, overFriId) > 0) continue;
                  const tueDay = weeksMap[monTue].find(d => {
                    const [y, m, dd] = d.split("-").map(Number);
                    return new Date(y, m - 1, dd).getDay() === 2 && canSwapCsGlobal(d, overTueId, overFriId, allowedList);
                  });
                  if (!tueDay) continue;
                  for (const monFri of unlockedWeekMons) {
                    if (overTueId === "noe" && monFri < "2027-03-01") continue;
                    if (monFri === monTue) continue;
                    if (getWeekCsCountGlobal(monFri, overFriId) === 0 || getWeekCsCountGlobal(monFri, overTueId) > 0) continue;
                    const friDay = weeksMap[monFri].find(d => {
                      const [y, m, dd] = d.split("-").map(Number);
                      return new Date(y, m - 1, dd).getDay() === 5 && canSwapCsGlobal(d, overFriId, overTueId, allowedList);
                    });
                    if (!friDay) continue;
                    execSwapCsGlobal(tueDay, overTueId, overFriId);
                    execSwapCsGlobal(friDay, overFriId, overTueId);
                    swappedTF = true;
                    break;
                  }
                  if (swappedTF) break;
                }
                if (swappedTF) break;
              }
              if (swappedTF) break;
            }
            if (swappedTF) break;
          }
          if (!swappedTF) break;
        }

        // 4) Équilibrage global des vacations d'ÉCHOGRAPHIE (ECHO) et d'IRM (IRM 3T, IRM 1,5T, IRM PM)
        const diagPostesGlobal = ["ECHO", "IRM 3T", "IRM 1,5T", "IRM", "SCAN ACHARD", "TDM OLLIER DIAG"];
        const getWeekIrmPmCntGlobal = (monIso, iid) => {
          let c = 0;
          (weeksMap[monIso] || []).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (sl && sl.pm === "IRM") c++;
          });
          return c;
        };
        const canSwapDiagGlobal = (monIso, dIso, hKey, i1, i2) => {
          if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) return false;
          if (custom[dIso + "__" + i1] && custom[dIso + "__" + i1][hKey]) return false;
          if (custom[dIso + "__" + i2] && custom[dIso + "__" + i2][hKey]) return false;
          const byS = st.schedule[dIso].byInterne;
          if (!byS[i1] || !byS[i2]) return false;
          const p1 = byS[i1][hKey], p2 = byS[i2][hKey];
          if (!p1 || !p2 || p1 === p2 || !diagPostesGlobal.includes(p1) || !diagPostesGlobal.includes(p2)) return false;
          if (i1 === "noe" || i2 === "noe") {
            const senId = i1 === "noe" ? i2 : i1;
            const pNoe = i1 === "noe" ? p1 : p2;
            if (seniorIidsGlobal.some(sOth => sOth !== senId && byS[sOth] && byS[sOth][hKey] === pNoe)) return false;
          }
          const othH = hKey === "am" ? "pm" : "am";
          if (isSamePosteDayGlobal(p2, byS[i1][othH]) || isSamePosteDayGlobal(p1, byS[i2][othH])) return false;
          if (hKey === "pm") {
            if (p2 === "IRM" && p1 !== "IRM" && getWeekIrmPmCntGlobal(monIso, i1) >= 1) return false;
            if (p1 === "IRM" && p2 !== "IRM" && getWeekIrmPmCntGlobal(monIso, i2) >= 1) return false;
          }
          return true;
        };
        const execSwapDiagGlobal = (dIso, hKey, i1, i2) => {
          const byS = st.schedule[dIso].byInterne;
          const nk = hKey === "am" ? "noteAm" : "notePm";
          const p1 = byS[i1][hKey], p2 = byS[i2][hKey];
          byS[i1][hKey] = p2;
          byS[i1][nk] = i1 === "noe" ? `Phase Socle (${p2})` : "";
          if (!(custom[dIso + "__" + i1] && custom[dIso + "__" + i1].note)) {
            byS[i1].note = [byS[i1].noteAm, byS[i1].notePm].filter(Boolean).join(" • ");
          }
          byS[i2][hKey] = p1;
          byS[i2][nk] = i2 === "noe" ? `Phase Socle (${p1})` : "";
          if (!(custom[dIso + "__" + i2] && custom[dIso + "__" + i2].note)) {
            byS[i2].note = [byS[i2].noteAm, byS[i2].notePm].filter(Boolean).join(" • ");
          }
        };
        const evalGlobalDiagScore = (phaseTwo = false) => {
          const echoAm = {}, echoPm = {}, irmAm = {}, irm3t = {}, irm15t = {}, irmPm = {}, ach = {}, oll = {};
          allIidsGlobal.forEach(i => { echoAm[i] = 0; echoPm[i] = 0; irmAm[i] = 0; irm3t[i] = 0; irm15t[i] = 0; irmPm[i] = 0; ach[i] = 0; oll[i] = 0; });
          let wPen = 0;
          Object.keys(weeksMap).forEach(monIso => {
            const we = {}, wi = {};
            allIidsGlobal.forEach(i => { we[i] = 0; wi[i] = 0; });
            (weeksMap[monIso] || []).forEach(dIso => {
              if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
              const byS = st.schedule[dIso].byInterne;
              ["am", "pm"].forEach(hK => {
                allIidsGlobal.forEach(i => {
                  const v = byS[i] && byS[i][hK];
                  if (v === "ECHO") {
                    if (hK === "am") echoAm[i]++; else echoPm[i]++;
                    we[i]++;
                  } else if ((v === "IRM 3T" || v === "IRM 1,5T") && hK === "am") {
                    irmAm[i]++;
                    if (v === "IRM 3T") irm3t[i]++; else irm15t[i]++;
                    wi[i]++;
                  } else if (v === "IRM" && hK === "pm") {
                    irmPm[i]++;
                    wi[i]++;
                  } else if (v === "SCAN ACHARD") {
                    ach[i]++;
                  } else if (v === "TDM OLLIER DIAG") {
                    oll[i]++;
                  }
                });
              });
            });
            const n = allIidsGlobal.length || 1;
            const me = allIidsGlobal.reduce((s, i) => s + we[i], 0) / n;
            const mi = allIidsGlobal.reduce((s, i) => s + wi[i], 0) / n;
            allIidsGlobal.forEach(i => { wPen += (we[i] - me) ** 2 + (wi[i] - mi) ** 2; });
          });
          const varArr = (arr) => {
            const m = arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
            return arr.reduce((s, x) => s + (x - m) ** 2, 0);
          };
          const echoTot = allIidsGlobal.map(i => echoAm[i] + echoPm[i]);
          const irmTot = allIidsGlobal.map(i => irmAm[i] + irmPm[i]);
          if (phaseTwo) {
            return (
              80 * varArr(echoTot) +
              80 * varArr(irmTot) +
              25 * varArr(allIidsGlobal.map(i => irmAm[i])) +
              25 * varArr(allIidsGlobal.map(i => irmPm[i])) +
              4 * varArr(allIidsGlobal.map(i => echoAm[i])) +
              4 * varArr(allIidsGlobal.map(i => echoPm[i])) +
              3 * varArr(allIidsGlobal.map(i => irm3t[i])) +
              3 * varArr(allIidsGlobal.map(i => irm15t[i])) +
              12 * varArr(allIidsGlobal.map(i => ach[i])) +
              12 * varArr(allIidsGlobal.map(i => oll[i])) +
              4 * varArr(allIidsGlobal.map(i => ach[i] + oll[i])) +
              1.5 * wPen
            );
          }
          return (
            16 * varArr(echoTot) +
            16 * varArr(irmTot) +
            10 * varArr(allIidsGlobal.map(i => irmAm[i])) +
            10 * varArr(allIidsGlobal.map(i => irmPm[i])) +
            3 * varArr(allIidsGlobal.map(i => echoAm[i])) +
            3 * varArr(allIidsGlobal.map(i => echoPm[i])) +
            2 * varArr(allIidsGlobal.map(i => irm3t[i])) +
            2 * varArr(allIidsGlobal.map(i => irm15t[i])) +
            4 * varArr(seniorIidsGlobal.map(s => ach[s])) +
            4 * varArr(seniorIidsGlobal.map(s => oll[s])) +
            1.5 * varArr(allIidsGlobal.map(i => ach[i])) +
            1.5 * varArr(allIidsGlobal.map(i => oll[i])) +
            1.5 * wPen
          );
        };
        for (let iterD = 0; iterD < 80; iterD++) {
          let impD = false;
          let curScoreD = evalGlobalDiagScore(false);
          for (const monIso of unlockedWeekMons) {
            for (const dIso of (weeksMap[monIso] || [])) {
              if (!st.schedule[dIso] || st.schedule[dIso].holiday) continue;
              for (const hK of ["am", "pm"]) {
                for (let idx1 = 0; idx1 < allIidsGlobal.length; idx1++) {
                  for (let idx2 = idx1 + 1; idx2 < allIidsGlobal.length; idx2++) {
                    const i1 = allIidsGlobal[idx1], i2 = allIidsGlobal[idx2];
                    if (canSwapDiagGlobal(monIso, dIso, hK, i1, i2)) {
                      execSwapDiagGlobal(dIso, hK, i1, i2);
                      const newScoreD = evalGlobalDiagScore(false);
                      if (newScoreD < curScoreD - 1e-6) {
                        curScoreD = newScoreD;
                        impD = true;
                      } else {
                        execSwapDiagGlobal(dIso, hK, i1, i2);
                      }
                    }
                  }
                }
              }
            }
          }
          if (!impD) break;
        }

        // 4bis) Équilibrage global des vacations de LECTURE et de SCAN ACHARD (notamment pour Noé)
        const getTotalLecCountGlobal = (iid) => {
          let c = 0;
          Object.keys(st.schedule).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "LECTURE") c++;
            if (sl.pm === "LECTURE") c++;
          });
          return c;
        };
        const getTotalAchCountGlobal = (iid) => {
          let c = 0;
          Object.keys(st.schedule).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "SCAN ACHARD") c++;
            if (sl.pm === "SCAN ACHARD") c++;
          });
          return c;
        };
        const getWeekLecCountGlobal = (monIso, iid) => {
          let c = 0;
          (weeksMap[monIso] || []).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "LECTURE") c++;
            if (sl.pm === "LECTURE") c++;
          });
          return c;
        };
        const getWeekAchCountGlobal = (monIso, iid) => {
          let c = 0;
          (weeksMap[monIso] || []).forEach(dIso => {
            if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
            const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[iid];
            if (!sl) return;
            if (sl.am === "SCAN ACHARD") c++;
            if (sl.pm === "SCAN ACHARD") c++;
          });
          return c;
        };
        for (let iterNL = 0; iterNL < 15; iterNL++) {
          const lecC = {}, achC = {};
          allIidsGlobal.forEach(i => { lecC[i] = getTotalLecCountGlobal(i); achC[i] = getTotalAchCountGlobal(i); });
          if ((lecC["noe"] || 0) >= 8) break;
          let bestCand = null;
          let bestSc = -999999;
          for (const monIso of unlockedWeekMons) {
            if (getWeekLecCountGlobal(monIso, "noe") >= 1) continue;
            const noeWAch = getWeekAchCountGlobal(monIso, "noe");
            for (const dIso of (weeksMap[monIso] || [])) {
              if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) continue;
              const [yy, mm, dd] = dIso.split("-").map(Number);
              const jsDay = new Date(yy, mm - 1, dd).getDay();
              if (jsDay !== 2 && jsDay !== 5) continue;
              if (custom[dIso + "__noe"] && custom[dIso + "__noe"].pm) continue;
              const byS = st.schedule[dIso].byInterne;
              if (!byS["noe"] || byS["noe"].pm !== "SCAN ACHARD") continue;
              if (isSamePosteDayGlobal(byS["noe"].am, "LECTURE")) continue;
              for (const sId of seniorIidsGlobal) {
                if (custom[dIso + "__" + sId] && custom[dIso + "__" + sId].pm) continue;
                if (!byS[sId] || byS[sId].pm !== "LECTURE") continue;
                if (isSamePosteDayGlobal(byS[sId].am, "SCAN ACHARD")) continue;
                if (seniorIidsGlobal.some(oId => oId !== sId && byS[oId] && byS[oId].pm === "SCAN ACHARD")) continue;
                const sc = 10 * lecC[sId] - 6 * achC[sId] + 3 * noeWAch - 2 * getWeekAchCountGlobal(monIso, sId);
                if (sc > bestSc) {
                  bestSc = sc;
                  bestCand = [dIso, sId];
                }
              }
            }
          }
          if (!bestCand) break;
          const [dSw, sSw] = bestCand;
          const byS = st.schedule[dSw].byInterne;
          byS["noe"].pm = "LECTURE";
          byS["noe"].notePm = formatPmNoteForPosteGlobal(dSw, "noe", "LECTURE");
          if (!(custom[dSw + "__noe"] && custom[dSw + "__noe"].note)) {
            byS["noe"].note = [byS["noe"].noteAm, byS["noe"].notePm].filter(Boolean).join(" • ");
          }
          byS[sSw].pm = "SCAN ACHARD";
          byS[sSw].notePm = formatPmNoteForPosteGlobal(dSw, sSw, "SCAN ACHARD");
          if (!(custom[dSw + "__" + sSw] && custom[dSw + "__" + sSw].note)) {
            byS[sSw].note = [byS[sSw].noteAm, byS[sSw].notePm].filter(Boolean).join(" • ");
          }
        }
        for (let iterEqL = 0; iterEqL < 30; iterEqL++) {
          const lecC = {}, achC = {};
          allIidsGlobal.forEach(i => { lecC[i] = getTotalLecCountGlobal(i); achC[i] = getTotalAchCountGlobal(i); });
          let swappedL = false;
          const overL = allIidsGlobal.filter(i => lecC[i] >= 8).sort((a, b) => (lecC[b] - lecC[a]) || (achC[a] - achC[b]));
          const underL = allIidsGlobal.filter(i => lecC[i] <= 7).sort((a, b) => (lecC[a] - lecC[b]) || (achC[b] - achC[a]));
          for (const oId of overL) {
            for (const uId of underL) {
              if (lecC[oId] - lecC[uId] < 2 && !(lecC[oId] >= 9 && lecC[uId] <= 7)) continue;
              for (const donorP of ["SCAN ACHARD", "ECHO", "TDM OLLIER DIAG"]) {
                for (const monIso of unlockedWeekMons) {
                  if (getWeekLecCountGlobal(monIso, uId) >= 1) continue;
                  for (const dIso of (weeksMap[monIso] || [])) {
                    if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) continue;
                    const [yy, mm, dd] = dIso.split("-").map(Number);
                    const jsDay = new Date(yy, mm - 1, dd).getDay();
                    if (jsDay !== 2 && jsDay !== 5) continue;
                    if (custom[dIso + "__" + oId] && custom[dIso + "__" + oId].pm) continue;
                    if (custom[dIso + "__" + uId] && custom[dIso + "__" + uId].pm) continue;
                    const byS = st.schedule[dIso].byInterne;
                    if (!byS[oId] || byS[oId].pm !== "LECTURE" || !byS[uId] || byS[uId].pm !== donorP) continue;
                    if (isSamePosteDayGlobal(byS[oId].am, donorP) || isSamePosteDayGlobal(byS[uId].am, "LECTURE")) continue;
                    if (oId === "noe" || uId === "noe") {
                      if (allIidsGlobal.some(k => k !== oId && k !== uId && byS[k] && byS[k].pm === donorP)) continue;
                    }
                    byS[oId].pm = donorP;
                    byS[oId].notePm = formatPmNoteForPosteGlobal(dIso, oId, donorP);
                    if (!(custom[dIso + "__" + oId] && custom[dIso + "__" + oId].note)) {
                      byS[oId].note = [byS[oId].noteAm, byS[oId].notePm].filter(Boolean).join(" • ");
                    }
                    byS[uId].pm = "LECTURE";
                    byS[uId].notePm = formatPmNoteForPosteGlobal(dIso, uId, "LECTURE");
                    if (!(custom[dIso + "__" + uId] && custom[dIso + "__" + uId].note)) {
                      byS[uId].note = [byS[uId].noteAm, byS[uId].notePm].filter(Boolean).join(" • ");
                    }
                    swappedL = true;
                    break;
                  }
                  if (swappedL) break;
                }
                if (swappedL) break;
              }
              if (swappedL) break;
            }
            if (swappedL) break;
          }
          if (!swappedL) break;
        }

        // 4ter) Second passage d'équilibrage diagnostique intégrant le lissage SCAN ACHARD / TDM OLLIER DIAG
        for (let iterD2 = 0; iterD2 < 80; iterD2++) {
          let impD2 = false;
          let curScoreD2 = evalGlobalDiagScore(true);
          for (const monIso of unlockedWeekMons) {
            for (const dIso of (weeksMap[monIso] || [])) {
              if (!st.schedule[dIso] || st.schedule[dIso].holiday) continue;
              for (const hK of ["am", "pm"]) {
                for (let idx1 = 0; idx1 < allIidsGlobal.length; idx1++) {
                  for (let idx2 = idx1 + 1; idx2 < allIidsGlobal.length; idx2++) {
                    const i1 = allIidsGlobal[idx1], i2 = allIidsGlobal[idx2];
                    if (canSwapDiagGlobal(monIso, dIso, hK, i1, i2)) {
                      execSwapDiagGlobal(dIso, hK, i1, i2);
                      const newScoreD2 = evalGlobalDiagScore(true);
                      if (newScoreD2 < curScoreD2 - 1e-6) {
                        curScoreD2 = newScoreD2;
                        impD2 = true;
                      } else {
                        execSwapDiagGlobal(dIso, hK, i1, i2);
                      }
                    }
                  }
                }
              }
            }
          }
          if (!impD2) break;
        }

        // 4ter-bis) Second passage LECTURE <-> SCAN ACHARD après le lissage diagnostique
        for (let iterNL2 = 0; iterNL2 < 15; iterNL2++) {
          const lecC = {}, achC = {};
          allIidsGlobal.forEach(i => { lecC[i] = getTotalLecCountGlobal(i); achC[i] = getTotalAchCountGlobal(i); });
          if ((lecC["noe"] || 0) >= 8) break;
          let bestCand = null;
          let bestSc = -999999;
          for (const monIso of unlockedWeekMons) {
            if (getWeekLecCountGlobal(monIso, "noe") >= 1) continue;
            const noeWAch = getWeekAchCountGlobal(monIso, "noe");
            for (const dIso of (weeksMap[monIso] || [])) {
              if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) continue;
              const [yy, mm, dd] = dIso.split("-").map(Number);
              const jsDay = new Date(yy, mm - 1, dd).getDay();
              if (jsDay !== 2 && jsDay !== 5) continue;
              if (custom[dIso + "__noe"] && custom[dIso + "__noe"].pm) continue;
              const byS = st.schedule[dIso].byInterne;
              if (!byS["noe"] || byS["noe"].pm !== "SCAN ACHARD") continue;
              if (isSamePosteDayGlobal(byS["noe"].am, "LECTURE")) continue;
              for (const sId of seniorIidsGlobal) {
                if (custom[dIso + "__" + sId] && custom[dIso + "__" + sId].pm) continue;
                if (!byS[sId] || byS[sId].pm !== "LECTURE") continue;
                if (isSamePosteDayGlobal(byS[sId].am, "SCAN ACHARD")) continue;
                if (seniorIidsGlobal.some(oId => oId !== sId && byS[oId] && byS[oId].pm === "SCAN ACHARD")) continue;
                const sc = 10 * lecC[sId] - 6 * achC[sId] + 3 * noeWAch - 2 * getWeekAchCountGlobal(monIso, sId);
                if (sc > bestSc) {
                  bestSc = sc;
                  bestCand = [dIso, sId];
                }
              }
            }
          }
          if (!bestCand) break;
          const [dSw, sSw] = bestCand;
          const byS = st.schedule[dSw].byInterne;
          byS["noe"].pm = "LECTURE";
          byS["noe"].notePm = formatPmNoteForPosteGlobal(dSw, "noe", "LECTURE");
          if (!(custom[dSw + "__noe"] && custom[dSw + "__noe"].note)) {
            byS["noe"].note = [byS["noe"].noteAm, byS["noe"].notePm].filter(Boolean).join(" • ");
          }
          byS[sSw].pm = "SCAN ACHARD";
          byS[sSw].notePm = formatPmNoteForPosteGlobal(dSw, sSw, "SCAN ACHARD");
          if (!(custom[dSw + "__" + sSw] && custom[dSw + "__" + sSw].note)) {
            byS[sSw].note = [byS[sSw].noteAm, byS[sSw].notePm].filter(Boolean).join(" • ");
          }
        }
        for (let iterEqL2 = 0; iterEqL2 < 30; iterEqL2++) {
          const lecC = {}, achC = {};
          allIidsGlobal.forEach(i => { lecC[i] = getTotalLecCountGlobal(i); achC[i] = getTotalAchCountGlobal(i); });
          let swappedL = false;
          const overL = allIidsGlobal.filter(i => lecC[i] >= 8).sort((a, b) => (lecC[b] - lecC[a]) || (achC[a] - achC[b]));
          const underL = allIidsGlobal.filter(i => lecC[i] <= 8).sort((a, b) => (lecC[a] - lecC[b]) || (achC[b] - achC[a]));
          for (const oId of overL) {
            for (const uId of underL) {
              if (lecC[oId] - lecC[uId] < 2 && !(lecC[oId] >= 9 && lecC[uId] <= 7)) continue;
              for (const donorP of ["SCAN ACHARD", "ECHO", "TDM OLLIER DIAG"]) {
                for (const monIso of unlockedWeekMons) {
                  if (getWeekLecCountGlobal(monIso, uId) >= 1) continue;
                  for (const dIso of (weeksMap[monIso] || [])) {
                    if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) continue;
                    const [yy, mm, dd] = dIso.split("-").map(Number);
                    const jsDay = new Date(yy, mm - 1, dd).getDay();
                    if (jsDay !== 2 && jsDay !== 5) continue;
                    if (custom[dIso + "__" + oId] && custom[dIso + "__" + oId].pm) continue;
                    if (custom[dIso + "__" + uId] && custom[dIso + "__" + uId].pm) continue;
                    const byS = st.schedule[dIso].byInterne;
                    if (!byS[oId] || byS[oId].pm !== "LECTURE" || !byS[uId] || byS[uId].pm !== donorP) continue;
                    if (isSamePosteDayGlobal(byS[oId].am, donorP) || isSamePosteDayGlobal(byS[uId].am, "LECTURE")) continue;
                    if (oId === "noe" || uId === "noe") {
                      if (allIidsGlobal.some(k => k !== oId && k !== uId && byS[k] && byS[k].pm === donorP)) continue;
                    }
                    byS[oId].pm = donorP;
                    byS[oId].notePm = formatPmNoteForPosteGlobal(dIso, oId, donorP);
                    if (!(custom[dIso + "__" + oId] && custom[dIso + "__" + oId].note)) {
                      byS[oId].note = [byS[oId].noteAm, byS[oId].notePm].filter(Boolean).join(" • ");
                    }
                    byS[uId].pm = "LECTURE";
                    byS[uId].notePm = formatPmNoteForPosteGlobal(dIso, uId, "LECTURE");
                    if (!(custom[dIso + "__" + uId] && custom[dIso + "__" + uId].note)) {
                      byS[uId].note = [byS[uId].noteAm, byS[uId].notePm].filter(Boolean).join(" • ");
                    }
                    swappedL = true;
                    break;
                  }
                  if (swappedL) break;
                }
                if (swappedL) break;
              }
              if (swappedL) break;
            }
            if (swappedL) break;
          }
          if (!swappedL) break;
        }

        // 4quater) Lissage fin GESTES (C) <-> SCAN ACHARD entre seniors lorsque l'écart combiné est >= 2
        for (let iterGA = 0; iterGA < 10; iterGA++) {
          const gestC = {}, achC = {};
          seniorIidsGlobal.forEach(s => {
            let gc = 0;
            Object.keys(st.schedule).forEach(dIso => {
              if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
              const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[s];
              if (!sl) return;
              if (sl.am === "GESTES (C)" || sl.am === "ALLURA") gc++;
              if (sl.pm === "GESTES (C)" || sl.pm === "ALLURA") gc++;
            });
            gestC[s] = gc;
            achC[s] = getTotalAchCountGlobal(s);
          });
          let swappedGA = false;
          const overGList = [...seniorIidsGlobal].sort((a, b) => gestC[b] - gestC[a]);
          const underGList = [...seniorIidsGlobal].sort((a, b) => gestC[a] - gestC[b]);
          for (const overG of overGList) {
            for (const underG of underGList) {
              if (gestC[overG] - gestC[underG] < 2 || achC[underG] - achC[overG] < 2) continue;
              for (const monIso of unlockedWeekMons) {
                let wGU = 0;
                (weeksMap[monIso] || []).forEach(dIso => {
                  if (!st.schedule[dIso] || st.schedule[dIso].holiday) return;
                  const sl = st.schedule[dIso].byInterne && st.schedule[dIso].byInterne[underG];
                  if (!sl) return;
                  if (sl.am === "GESTES (C)" || sl.am === "ALLURA") wGU++;
                  if (sl.pm === "GESTES (C)" || sl.pm === "ALLURA") wGU++;
                });
                if (wGU >= 2) continue;
                for (const dIso of (weeksMap[monIso] || [])) {
                  if (dIso === "2026-11-02" || !st.schedule[dIso] || st.schedule[dIso].holiday) continue;
                  const byS = st.schedule[dIso].byInterne;
                  for (const hK of ["am", "pm"]) {
                    if (custom[dIso + "__" + overG] && custom[dIso + "__" + overG][hK]) continue;
                    if (custom[dIso + "__" + underG] && custom[dIso + "__" + underG][hK]) continue;
                    if (!byS[overG] || byS[overG][hK] !== "GESTES (C)" || !byS[underG] || byS[underG][hK] !== "SCAN ACHARD") continue;
                    const othH = hK === "am" ? "pm" : "am";
                    if (isSamePosteDayGlobal(byS[overG][othH], "SCAN ACHARD") || isSamePosteDayGlobal(byS[underG][othH], "GESTES (C)")) continue;
                    const nk = hK === "am" ? "noteAm" : "notePm";
                    byS[overG][hK] = "SCAN ACHARD";
                    byS[overG][nk] = "";
                    if (!(custom[dIso + "__" + overG] && custom[dIso + "__" + overG].note)) {
                      byS[overG].note = [byS[overG].noteAm, byS[overG].notePm].filter(Boolean).join(" • ");
                    }
                    byS[underG][hK] = "GESTES (C)";
                    byS[underG][nk] = "";
                    if (!(custom[dIso + "__" + underG] && custom[dIso + "__" + underG].note)) {
                      byS[underG].note = [byS[underG].noteAm, byS[underG].notePm].filter(Boolean).join(" • ");
                    }
                    swappedGA = true;
                    break;
                  }
                  if (swappedGA) break;
                }
                if (swappedGA) break;
              }
              if (swappedGA) break;
            }
            if (swappedGA) break;
          }
          if (!swappedGA) break;
        }
      }

      // 3. Reconstruire dayObj.am, dayObj.pm et dayObj.slots
      Object.keys(st.schedule).forEach(iso => {
        const dayObj = st.schedule[iso];
        if (!dayObj || dayObj.holiday || !dayObj.byInterne) return;
        const amCounts = {};
        const pmCounts = {};
        Object.keys(dayObj.byInterne).forEach(iid => {
          const sl = dayObj.byInterne[iid];
          if (sl.am && !["1/2 journée libre", "RG", "VACANCES", "FÉRIÉ", "FORMATION / ACCUEIL"].includes(sl.am)) {
            amCounts[sl.am] = (amCounts[sl.am] || 0) + 1;
          }
          if (sl.pm && !["1/2 journée libre", "RG", "VACANCES", "FÉRIÉ", "FORMATION / ACCUEIL"].includes(sl.pm)) {
            pmCounts[sl.pm] = (pmCounts[sl.pm] || 0) + 1;
          }
        });
        dayObj.am = [];
        dayObj.pm = [];
        Object.keys(dayObj.byInterne).forEach(iid => {
          const intObj = st.internes.find(x => x.id === iid);
          const slot = dayObj.byInterne[iid];
          const isSocle = Boolean(slot.isSocle || (intObj && intObj.isSocle));
          dayObj.am.push({
            poste: slot.am,
            interneId: iid,
            interne: intObj ? intObj.shortName : iid,
            isSocle,
            binome: isSocle && (amCounts[slot.am] > 1),
            note: slot.noteAm || "",
            absStatus: slot.absStatus || null
          });
          dayObj.pm.push({
            poste: slot.pm,
            interneId: iid,
            interne: intObj ? intObj.shortName : iid,
            isSocle,
            binome: isSocle && (pmCounts[slot.pm] > 1),
            note: slot.notePm || "",
            absStatus: slot.absStatus || null
          });
        });
        (dayObj.closedAm || []).forEach(cl => {
          dayObj.am.push({
            poste: cl.poste,
            interneId: null,
            interne: cl.reason || cl.status || "FERMÉ",
            closed: true,
            reason: cl.reason || cl.status || "FERMÉ"
          });
        });
        (dayObj.closedPm || []).forEach(cl => {
          dayObj.pm.push({
            poste: cl.poste,
            interneId: null,
            interne: cl.reason || cl.status || "FERMÉ",
            closed: true,
            reason: cl.reason || cl.status || "FERMÉ"
          });
        });
        dayObj.slots = dayObj.byInterne;
      });
    }

  global.ScheduleEngine = {
    getMondayOfWeek: getMondayOfWeek,
    CHEF_TO_INTERNE_POSTE_MAP: CHEF_TO_INTERNE_POSTE_MAP,
    mergePresentationsList: function (baseData, baseList, savedList) {
      INITIAL_DATA = baseData;
      return mergePresentationsList(baseList, savedList);
    },
    mergeAbsencesList: mergeAbsencesList,
    recompute: function (baseData, stateObj) {
      INITIAL_DATA = baseData;
      STATE = stateObj;
      recomputeScheduleInPlace(stateObj);
      return stateObj;
    }
  };
})(window);
