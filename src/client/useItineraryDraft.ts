import { useEffect, useRef, useState } from "react";
import type {
  ItineraryParseResult,
  Language,
  Place,
  Preference,
} from "../shared/contracts";
import { api, searchPlaces } from "./api";
import { newClientId } from "./clientId";

export interface DraftPlace {
  id: string;
  originalText: string;
  query: string;
  note: string;
  noteKind?: "source_context";
  selected: Place | null;
  candidates: Place[];
  hasMore: boolean;
  status: "idle" | "loading" | "complete" | "error";
}
interface Draft {
  id: string;
  sourceText: string;
  preference: Preference | null;
  manual: boolean;
  rows: DraftPlace[];
  warnings: string[];
  unsupportedNeeds: string[];
}
function newRow(
  query = "",
  originalText = "",
  note = "",
  noteKind?: "source_context",
): DraftPlace {
  return {
    id: newClientId("draft"),
    query,
    originalText,
    note,
    ...(noteKind ? { noteKind } : {}),
    selected: null,
    candidates: [],
    hasMore: false,
    status: "idle",
  };
}
export function useItineraryDraft(context: {
  language: Language;
  preference: Preference;
  revision: number;
  active: boolean;
}) {
  const [text, setTextValue] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    "unavailable" | "changed" | "invalid" | null
  >(null);
  const parseVersion = useRef(0);
  const parseRequest = useRef<AbortController | null>(null);
  const lookups = useRef(new Map<string, AbortController>());
  const lookupEpoch = useRef(0);
  const key = JSON.stringify(context);
  const live = useRef({ text, draft, key, active: context.active });
  live.current = { text, draft, key, active: context.active };
  function interruptParse() {
    parseVersion.current++;
    parseRequest.current?.abort();
    parseRequest.current = null;
    setBusy(false);
  }
  function abortLookups() {
    lookupEpoch.current++;
    for (const controller of lookups.current.values()) controller.abort();
    lookups.current.clear();
  }
  useEffect(() => {
    const wasParsing = !!parseRequest.current;
    interruptParse();
    abortLookups();
    setDraft((value) =>
      value
        ? {
            ...value,
            rows: value.rows.map((row) =>
              row.status === "loading" ? { ...row, status: "idle" } : row,
            ),
          }
        : value,
    );
    if (wasParsing) setMessage("changed");
    return () => {
      parseVersion.current++;
      parseRequest.current?.abort();
      abortLookups();
    };
  }, [key]);
  function updateRow(id: string, change: (row: DraftPlace) => DraftPlace) {
    setDraft((value) =>
      value
        ? {
            ...value,
            rows: value.rows.map((row) => (row.id === id ? change(row) : row)),
          }
        : value,
    );
  }
  function editText(value: string) {
    interruptParse();
    abortLookups();
    setTextValue(value);
    setMessage(null);
    setDraft((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.status === "loading" ? { ...row, status: "idle" } : row,
            ),
          }
        : current,
    );
  }
  async function parse() {
    if (!text.trim() || text.length > 2000 || !context.active) return;
    interruptParse();
    abortLookups();
    setDraft((value) =>
      value
        ? {
            ...value,
            rows: value.rows.map((row) =>
              row.status === "loading" ? { ...row, status: "idle" } : row,
            ),
          }
        : value,
    );
    const version = ++parseVersion.current;
    const controller = new AbortController();
    parseRequest.current = controller;
    const snapshot = { text, key };
    setBusy(true);
    setMessage(null);
    const timeout = setTimeout(() => {
      controller.abort();
      if (
        version === parseVersion.current &&
        live.current.key === snapshot.key &&
        live.current.active
      ) {
        parseVersion.current++;
        parseRequest.current = null;
        setBusy(false);
        setMessage("unavailable");
      }
    }, 15_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
      once: true,
    });
    try {
      const { data } = await api<ItineraryParseResult>("/assist/parse", {
        method: "POST",
        body: JSON.stringify({
          text,
          mode: "itinerary",
          language: context.language,
          preference: context.preference,
        }),
        signal: controller.signal,
      });
      if (
        version !== parseVersion.current ||
        controller.signal.aborted ||
        live.current.text !== snapshot.text ||
        live.current.key !== snapshot.key ||
        !live.current.active
      )
        return;
      if (data.status === "fallback") {
        setMessage("unavailable");
        return;
      }
      if (data.originalText !== snapshot.text) {
        setMessage("invalid");
        return;
      }
      setDraft({
        id: newClientId("proposal"),
        sourceText: text,
        preference: data.proposedPreference,
        manual: false,
        rows: data.placeQueries.map((place) =>
          newRow(
            place.queryZh,
            place.originalText,
            place.note ?? "",
            place.noteKind,
          ),
        ),
        warnings: data.warnings,
        unsupportedNeeds: data.unsupportedNeeds,
      });
    } catch {
      if (
        version === parseVersion.current &&
        live.current.key === snapshot.key &&
        live.current.active
      )
        setMessage("unavailable");
    } finally {
      clearTimeout(timeout);
      if (version === parseVersion.current) {
        parseRequest.current = null;
        setBusy(false);
      }
    }
  }
  async function lookup(id: string) {
    const current = live.current.draft;
    const row = current?.rows.find((row) => row.id === id);
    if (
      !current ||
      !row?.query.trim() ||
      !live.current.active ||
      live.current.key !== key
    )
      return;
    lookups.current.get(id)?.abort();
    const controller = new AbortController();
    lookups.current.set(id, controller);
    const snapshot = {
      draftId: current.id,
      query: row.query,
      key: live.current.key,
    };
    const valid = () =>
      !controller.signal.aborted &&
      lookups.current.get(id) === controller &&
      live.current.active &&
      live.current.key === snapshot.key &&
      live.current.draft?.id === snapshot.draftId &&
      live.current.draft.rows.some(
        (row) => row.id === id && row.query === snapshot.query,
      );
    updateRow(id, (row) => ({ ...row, status: "loading" }));
    // Allow the shared provider queue (90s), HTTP request (5s), and transit.
    const timeout = setTimeout(() => {
      controller.abort();
      if (
        lookups.current.get(id) === controller &&
        live.current.key === snapshot.key &&
        live.current.draft?.id === snapshot.draftId
      )
        updateRow(id, (row) => ({ ...row, status: "error" }));
    }, 100_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
      once: true,
    });
    try {
      const reply = await searchPlaces(
        row.query,
        context.language,
        controller.signal,
      );
      if (valid())
        updateRow(id, (row) => ({
          ...row,
          candidates: reply.data.places,
          hasMore: reply.data.hasMore,
          status: "complete",
        }));
    } catch {
      if (
        lookups.current.get(id) === controller &&
        live.current.key === snapshot.key &&
        live.current.draft?.id === snapshot.draftId
      )
        updateRow(id, (row) => ({ ...row, status: "error" }));
    } finally {
      clearTimeout(timeout);
      if (lookups.current.get(id) === controller) lookups.current.delete(id);
    }
  }
  async function searchUnresolved() {
    interruptParse();
    const current = live.current.draft;
    if (!current || current.rows.length > 10) return;
    const rows = current.rows.filter(
      (row) => !row.selected && row.query.trim() && row.status !== "loading",
    );
    let index = 0;
    const batchKey = live.current.key;
    const batchEpoch = lookupEpoch.current;
    await Promise.all(
      [0, 1].map(async () => {
        while (
          index < rows.length &&
          live.current.draft?.id === current.id &&
          live.current.active &&
          live.current.key === batchKey &&
          lookupEpoch.current === batchEpoch
        ) {
          const row = rows[index++];
          if (
            live.current.draft.rows.find((item) => item.id === row.id)?.selected
          )
            continue;
          await lookup(row.id);
        }
      }),
    );
  }
  useEffect(() => {
    if (draft && draft.rows.length <= 10) void searchUnresolved();
  }, [draft?.id]);
  function editQuery(id: string, query: string) {
    interruptParse();
    lookups.current.get(id)?.abort();
    lookups.current.delete(id);
    updateRow(id, (row) => ({
      ...row,
      query,
      selected: null,
      candidates: [],
      status: "idle",
      hasMore: false,
    }));
  }
  function editNote(id: string, note: string) {
    interruptParse();
    updateRow(id, (row) => ({ ...row, note, noteKind: undefined }));
  }
  function choose(id: string, place: Place) {
    if (place.originType === "geolocation") return;
    interruptParse();
    lookups.current.get(id)?.abort();
    lookups.current.delete(id);
    updateRow(id, (row) => ({ ...row, selected: place, status: "complete" }));
  }
  function remove(id: string) {
    interruptParse();
    lookups.current.get(id)?.abort();
    lookups.current.delete(id);
    setDraft((value) =>
      value
        ? { ...value, rows: value.rows.filter((row) => row.id !== id) }
        : value,
    );
  }
  function move(id: string, delta: number) {
    interruptParse();
    setDraft((value) => {
      if (!value) return value;
      const rows = [...value.rows];
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0 || index + delta < 0 || index + delta >= rows.length)
        return value;
      [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
      return { ...value, rows };
    });
  }
  function add() {
    interruptParse();
    setDraft((value) =>
      value
        ? { ...value, rows: [...value.rows, newRow()] }
        : {
            id: newClientId("proposal"),
            sourceText: text,
            preference: null,
            manual: true,
            rows: [newRow()],
            warnings: [],
            unsupportedNeeds: [],
          },
    );
  }
  function setPreference(preference: Preference | null) {
    interruptParse();
    setDraft((value) => (value ? { ...value, preference } : value));
  }
  function discard() {
    interruptParse();
    abortLookups();
    setDraft(null);
    setMessage(null);
  }
  function useManualDraft() {
    interruptParse();
    abortLookups();
    setMessage(null);
    setDraft((value) =>
      value
        ? {
            ...value,
            sourceText: text,
            manual: true,
            preference: null,
            warnings: [],
            unsupportedNeeds: [],
            rows: value.rows.map((row) =>
              row.status === "loading" ? { ...row, status: "idle" } : row,
            ),
          }
        : value,
    );
  }
  return {
    text,
    draft,
    busy,
    message,
    editText,
    parse,
    interruptParse,
    lookup: (id: string) => {
      interruptParse();
      void lookup(id);
    },
    searchUnresolved,
    editQuery,
    editNote,
    choose,
    remove,
    move,
    add,
    setPreference,
    discard,
    useManualDraft,
  };
}
