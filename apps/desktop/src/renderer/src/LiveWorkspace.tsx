import { useEffect, useState } from "react";
import { Button, LoadingBoundary } from "@ovelle/ui";
import ScheduleEditor from "./ScheduleEditor";
import ReadinessEvidence from "./ReadinessEvidence";
import ReadinessIntake from "./ReadinessIntake";
import ReadinessAssignment from "./ReadinessAssignment";
import HoursSubmission from "./HoursSubmission";
import OrganizationSetup from "./OrganizationSetup";

type Bridge = {
  status: () => Promise<{ signedIn: boolean }>;
  signIn: () => Promise<{ signedIn: boolean }>;
  signOut: () => Promise<{ revoked: boolean; localCleared: boolean }>;
  request: (input: unknown) => Promise<unknown>;
};
type Named = { id: string; name: string };
type Shift = {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  assigned: number;
  capacity: number;
  held: number;
  status: string;
};
type Case = {
  occurrenceId: string;
  roleId: string;
  personId: string;
  name: string;
  role: string;
  title: string;
  state: string;
  latestDecisionId: string | null;
};
type RosterPerson = {
  assignmentId: string;
  name: string;
  role: string;
  readiness: string;
  presence: string;
};
type Criterion = {
  id: string;
  evidenceId: string | null;
  name: string;
  state: string | null;
  validUntil: number | null;
  note: string | null;
};
type Hours = {
  id: string;
  name: string;
  title: string;
  state: string;
  startAt: number;
  endAt: number;
  breakMinutes: number;
  checkedInAt: number | null;
  checkedOutAt: number | null;
};
type WaitlistEntry = {
  id: string;
  name: string;
  role: string;
  readiness: string | null;
  state: "waiting" | "offered" | "assigned" | "withdrawn";
  offerId: string | null;
  offerExpiresAt: number | null;
};
type Screen = "schedule" | "readiness" | "roster" | "coverage" | "hours";

declare global {
  interface Window {
    ovelleWorkflow?: Bridge;
  }
}
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not reach the workflow service";
const displayTime = (value: number | null) =>
  value === null ? "Not recorded" : new Date(value).toLocaleString();

/** Live data is always fetched through the fixed, main-process native bridge. */
export default function LiveWorkspace({
  onPreview,
}: {
  onPreview: () => void;
}) {
  const api = window.ovelleWorkflow;
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false),
    [mutating, setMutating] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const busy = mutating || loading;
  const [organizationState, setOrganizationState] = useState<"loading" | "ready" | "error">("loading");
  const [organizationRevision, setOrganizationRevision] = useState(0);
  const [organizations, setOrganizations] = useState<Named[]>([]),
    [programs, setPrograms] = useState<Named[]>([]),
    [locations, setLocations] = useState<Named[]>([]);
  const [org, setOrg] = useState(""),
    [program, setProgram] = useState(""),
    [location, setLocation] = useState("");
  const [screen, setScreen] = useState<Screen>("schedule"),
    [shift, setShift] = useState(""),
    [selectedShift, setSelectedShift] = useState<Shift | null>(null),
    [draft, setDraft] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]),
    [cases, setCases] = useState<Case[]>([]),
    [roster, setRoster] = useState<RosterPerson[]>([]),
    [hours, setHours] = useState<Hours[]>([]),
    [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<Hours | null>(null),
    [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);
  const [hoursPerson, setHoursPerson] = useState<RosterPerson | null>(null);
  const [offerEntry, setOfferEntry] = useState<WaitlistEntry | null>(null);
  const [offerDeadline, setOfferDeadline] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offerConfirmation, setOfferConfirmation] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [criteria, setCriteria] = useState<Criterion[] | null>(null);
  const [evidenceCriterion, setEvidenceCriterion] = useState<Criterion | null>(null);
  const [criteriaComplete, setCriteriaComplete] = useState(false);
  const [readinessNote, setReadinessNote] = useState("");
  const [readinessDecision, setReadinessDecision] = useState<
    "ready" | "blocked" | null
  >(null);
  const [decisionId, setDecisionId] = useState<string | null | undefined>(
    undefined,
  );
  const [confirmation, setConfirmation] = useState<
    "approve" | "clarify" | null
  >(null);
  const request = <T,>(input: unknown) => api!.request(input) as Promise<T>;
  useEffect(() => {
    let active = true;
    if (api)
      api
        .status()
        .then((status) => {
          if (active) { setSignedIn(status.signedIn); setBridgeAvailable(true); }
        })
        .catch(() => { if (active) setBridgeAvailable(false); });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    let active = true;
    if (!api || !signedIn) return;
    setError("");
    setOrganizationState("loading");
    setOrganizations([]);
    request<{ organizations: Named[]; nextCursor: string | null }>({
      operation: "organizations",
    })
      .then((data) => {
        if (active) {
          setOrganizations(data.organizations);
          setOrganizationState("ready");
          if (data.nextCursor)
            setError("Only the first page of organizations is shown.");
        }
      })
      .catch((e) => {
        if (active) { setOrganizationState("error"); setError(message(e)); }
      });
    return () => {
      active = false;
    };
  }, [api, signedIn, organizationRevision]);
  useEffect(() => {
    let active = true;
    setDecisionId(undefined);
    setConfirmation(null);
    if (!api || !selected || !org || !program || !location) return;
    request<{ decisions: { id: string }[]; nextCursor: string | null }>({
      operation: "hoursHistory",
      organizationId: org,
      programId: program,
      locationId: location,
      submissionId: selected.id,
    })
      .then((data) => {
        if (!active) return;
        if (data.nextCursor) {
          setError(
            "This submission has more history than this view can safely review.",
          );
          return;
        }
        setDecisionId(data.decisions.at(-1)?.id ?? null);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [api, selected, org, program, location]);
  useEffect(() => {
    let active = true;
    setCriteria(null);
    setEvidenceCriterion(null);
    setCriteriaComplete(false);
    setReadinessDecision(null);
    if (!api || !selectedCase || !org || !program || !location) return;
    request<{ criteria: Criterion[]; truncated: boolean }>({
      operation: "criterionEvidence",
      organizationId: org,
      programId: program,
      locationId: location,
      occurrenceId: selectedCase.occurrenceId,
      roleId: selectedCase.roleId,
      personId: selectedCase.personId,
    })
      .then((data) => {
        if (active) {
          setCriteria(data.criteria);
          setCriteriaComplete(!data.truncated);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [api, selectedCase, org, program, location]);
  useEffect(() => {
    let active = true;
    setPrograms([]);
    setLocations([]);
    setProgram("");
    setLocation("");
    if (!api || !org) return;
    request<{ programs: Named[] }>({
      operation: "programs",
      organizationId: org,
    })
      .then((data) => {
        if (active) setPrograms(data.programs);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [api, org]);
  useEffect(() => {
    let active = true;
    setLocations([]);
    setLocation("");
    if (!api || !org || !program) return;
    request<{ locations: Named[] }>({
      operation: "locations",
      organizationId: org,
      programId: program,
    })
      .then((data) => {
        if (active) setLocations(data.locations);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [api, org, program]);
  useEffect(() => {
    let active = true;
    setLoading(false);
    setCursor(null);
    setShifts([]);
    setCases([]);
    setRoster([]);
    setHoursPerson(null);
    setHours([]);
    setWaitlist([]);
    setOfferEntry(null);
    setOfferConfirmation(false);
    setSelected(null);
    setSelectedCase(null);
    if (
      !api ||
      !org ||
      !program ||
      !location ||
      ((screen === "roster" || screen === "coverage") && !shift)
    )
      return;
    const scope = {
      organizationId: org,
      programId: program,
      locationId: location,
    };
    const now = Date.now();
    const input =
      screen === "schedule"
        ? {
            operation: "schedule",
            ...scope,
            from: now - 30 * 86400000,
            until: now + 90 * 86400000,
          }
        : screen === "roster" || screen === "coverage"
          ? {
              operation: screen === "coverage" ? "waitlist" : "roster",
              ...scope,
              occurrenceId: shift,
            }
          : { operation: screen, ...scope };
    setLoading(true);
    setError("");
    request<Record<string, unknown>>(input)
      .then((data) => {
        if (!active) return;
        setCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        if (screen === "schedule") setShifts(data.occurrences as Shift[]);
        else if (screen === "readiness") setCases(data.cases as Case[]);
        else if (screen === "roster")
          setRoster(data.volunteers as RosterPerson[]);
        else if (screen === "coverage")
          setWaitlist(data.entries as WaitlistEntry[]);
        else setHours(data.submissions as Hours[]);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, org, program, location, screen, shift, revision]);
  const signIn = async () => {
    if (!api) return;
    setMutating(true);
    setError("");
    try {
      setSignedIn((await api.signIn()).signedIn);
    } catch (e) {
      setError(message(e));
    } finally {
      setMutating(false);
    }
  };
  const signOut = async () => {
    if (!api) return;
    setMutating(true);
    try {
      const result = await api.signOut();
      setSignedIn(false);
      setOrganizations([]);
      setOrganizationState("loading");
      setOrg("");
      if (!result.revoked || !result.localCleared)
        setError(
          "Sign-out could not be fully confirmed. Check your connection and account sessions.",
        );
    } catch (e) {
      setError(message(e));
    } finally {
      setMutating(false);
    }
  };
  const action = async (operation: string, fields: Record<string, unknown>) => {
    if (!api) return;
    setMutating(true);
    setError("");
    try {
      await api.request({
        operation,
        organizationId: org,
        programId: program,
        locationId: location,
        ...fields,
        idempotencyKey: crypto.randomUUID(),
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setMutating(false);
    }
  };
  return (
    <div className="workflow-app">
      <header className="workflow-topbar">
        <strong className="workflow-brand">ovelle</strong>
        <span className="workflow-org">Live workspace</span>
        <button className="text-action" onClick={onPreview}>
          Open preview
        </button>
        {signedIn && (
          <button className="text-action" disabled={busy} onClick={signOut}>
            Sign out
          </button>
        )}
      </header>
      <main className="workflow-main">
        <div className="workflow-heading">
          <h1>Live workspace</h1>
          <p>
            Use your organization’s actual schedule, readiness, roster and
            hours.
          </p>
        </div>
        {!api || bridgeAvailable === false ? (
          <section className="workflow-card">
            <h2>Native connection unavailable</h2>
            <p>
              This preview connection cannot access organization data. Open a
              packaged Ovelle build with the native workflow bridge enabled.
            </p>
          </section>
        ) : bridgeAvailable === null ? (
          <p>Checking native connection…</p>
        ) : !signedIn ? (
          <section className="workflow-card">
            <h2>Sign in to Ovelle</h2>
            <p>Continue in your browser to approve this device.</p>
            <Button disabled={busy} onClick={signIn}>
              Sign in
            </Button>
          </section>
        ) : (
          <>
            {organizationState === "loading" && <p role="status">Loading organizations…</p>}
            {organizationState === "ready" && organizations.length === 0 && <OrganizationSetup request={api!.request} onBusyChange={setMutating} onCreated={() => setOrganizationRevision(v => v + 1)} />}
            <section className="workflow-card live-selectors">
              <label>
                Organization
                <select
                  value={org}
                  disabled={busy}
                  onChange={(e) => {
                    setOrg(e.target.value);
                    setShift("");
                    setSelectedShift(null);
                    setDraft(null);
                  }}
                >
                  <option value="">Choose organization</option>
                  {organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Program
                <select
                  value={program}
                  disabled={!org || busy}
                  onChange={(e) => {
                    setProgram(e.target.value);
                    setShift("");
                    setSelectedShift(null);
                    setDraft(null);
                  }}
                >
                  <option value="">Choose program</option>
                  {programs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Location
                <select
                  value={location}
                  disabled={!program || busy}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setShift("");
                    setSelectedShift(null);
                    setDraft(null);
                  }}
                >
                  <option value="">Choose location</option>
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <nav className="workflow-tabs" aria-label="Live workflow">
              {(
                [
                  "schedule",
                  "readiness",
                  "roster",
                  "coverage",
                  "hours",
                ] as Screen[]
              ).map((item) => (
                <button
                  key={item}
                  aria-current={screen === item ? "page" : undefined}
                  disabled={busy}
                  onClick={() => setScreen(item)}
                >
                  {item === "roster"
                    ? "Day-of roster"
                    : item === "hours"
                      ? "Hours review"
                      : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>
            {!org || !program || !location ? (
              <p>Select an organization, program and location to continue.</p>
            ) : (
              <LoadingBoundary loading={busy} label="Loading workflow">
                <section className="workflow-card">
                  <h2>
                    {screen === "roster"
                      ? "Day-of roster"
                      : screen === "hours"
                        ? "Hours review"
                        : screen[0].toUpperCase() + screen.slice(1)}
                  </h2>
                  {screen === "schedule" && (
                    <>
                      <ScheduleEditor key={`${org}:${program}:${location}`} request={api!.request} scope={{ organizationId: org, programId: program, locationId: location }} draft={draft} refresh={() => setRevision(v => v + 1)} onPublished={() => setDraft(null)} onBusyChange={setMutating} />
                      {shifts.length === 0 ? (
                        <p>
                          No occurrences in the next 90 days or previous 30
                          days.
                        </p>
                      ) : (
                        shifts.map((item) => (
                          <button
                            className="row-button"
                            key={item.id}
                            onClick={() => {
                              if (item.status === "draft") { setDraft(item); return; }
                              setShift(item.id);
                              setSelectedShift(item);
                              setScreen("roster");
                            }}
                          >
                            <strong>{item.title}</strong>
                            <span>{displayTime(item.startsAt)}</span>
                            <span>
                              {item.assigned}/{item.capacity} assigned ·{" "}
                              {item.held} held
                            </span>
                            <span>{item.status === "draft" ? "Set up draft" : "Open roster"}</span>
                          </button>
                        ))
                      )}
                    </>
                  )}
                  {screen === "readiness" && (
                    <>
                      {shift ? <ReadinessIntake key={`${org}:${program}:${location}:${shift}`} request={api!.request} scope={{organizationId: org, programId: program, locationId: location}} occurrenceId={shift} onOpened={() => setRevision(v => v + 1)} onBusyChange={setMutating} /> : <p>Select an occurrence from Schedule to start a new review.</p>}
                      {cases.length === 0 ? (
                        <p>No readiness cases in this scope.</p>
                      ) : (
                        cases.map((item) => (
                          <button
                            className="row-button"
                            key={`${item.occurrenceId}:${item.roleId}:${item.personId}`}
                            aria-pressed={selectedCase === item}
                            onClick={() => {
                              setSelectedCase(item);
                              setReadinessNote("");
                            }}
                          >
                            <strong>{item.name}</strong>
                            <span>
                              {item.title} · {item.role}
                            </span>
                            <span>{item.state}</span>
                          </button>
                        ))
                      )}
                      {selectedCase && (
                        <div className="live-review">
                          <h2>Review {selectedCase.name}</h2>
                          <p>
                            {selectedCase.title} · {selectedCase.role}
                          </p>
                          {criteria === null ? (
                            <p>Loading requirements…</p>
                          ) : criteria.length === 0 ? (
                            <p>No role requirements are configured.</p>
                          ) : (
                            criteria.map((item) => (
                              <div key={item.id}>
                                <p><strong>{item.name}:</strong>{" "}
                                  {item.state ?? "No evidence"}
                                  {item.validUntil !== null ? ` · valid until ${displayTime(item.validUntil)}` : ""}
                                  {item.note ? ` · ${item.note}` : ""}
                                </p>
                                <Button variant="secondary" size="compact" onClick={() => setEvidenceCriterion(item)}>Record evidence for {item.name}</Button>
                              </div>
                            ))
                          )}
                          {evidenceCriterion && <ReadinessEvidence key={`${selectedCase.personId}:${evidenceCriterion.id}`} request={api!.request} identity={{ organizationId: org, programId: program, locationId: location, occurrenceId: selectedCase.occurrenceId, roleId: selectedCase.roleId, personId: selectedCase.personId }} criterion={evidenceCriterion} onRecorded={() => { setEvidenceCriterion(null); setRevision(v => v + 1) }} onCancel={() => setEvidenceCriterion(null)} onBusyChange={setMutating} />}
                          {criteria !== null && !criteriaComplete && (
                            <p>
                              More requirements exist than this view can safely
                              show.
                            </p>
                          )}
                          {selectedCase.state === "ready" && <ReadinessAssignment key={`${selectedCase.occurrenceId}:${selectedCase.roleId}:${selectedCase.personId}`} request={api!.request} identity={{organizationId: org, programId: program, locationId: location, occurrenceId: selectedCase.occurrenceId, roleId: selectedCase.roleId, personId: selectedCase.personId}} name={selectedCase.name} onAssigned={() => { setShift(selectedCase.occurrenceId); setSelectedShift(previous => previous?.id === selectedCase.occurrenceId ? previous : null); setScreen("roster"); setRevision(v => v + 1) }} onBusyChange={setMutating} />}
                          <p>
                            A ready decision does not override missing or
                            expired requirements.
                          </p>
                          <label>
                            Review note
                            <textarea
                              value={readinessNote}
                              onChange={(event) =>
                                setReadinessNote(event.target.value)
                              }
                            />
                          </label>
                          <div className="live-actions">
                            <Button
                              disabled={
                                busy ||
                                !criteriaComplete ||
                                !readinessNote.trim()
                              }
                              onClick={() => setReadinessDecision("ready")}
                            >
                              Review ready decision
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={
                                busy ||
                                !criteriaComplete ||
                                !readinessNote.trim()
                              }
                              onClick={() => setReadinessDecision("blocked")}
                            >
                              Review blocked decision
                            </Button>
                          </div>
                          {readinessDecision && (
                            <div
                              className="workflow-card"
                              role="region"
                              aria-label="Confirm readiness decision"
                            >
                              <p>
                                Record {selectedCase.name} as{" "}
                                {readinessDecision} for {selectedCase.role}?
                              </p>
                              <div className="live-actions">
                                <Button
                                  disabled={busy}
                                  onClick={() => {
                                    const state = readinessDecision;
                                    setReadinessDecision(null);
                                    void action("decideReadiness", {
                                      occurrenceId: selectedCase.occurrenceId,
                                      roleId: selectedCase.roleId,
                                      personId: selectedCase.personId,
                                      state,
                                      evidenceNote: readinessNote.trim(),
                                      expectedDecisionId:
                                        selectedCase.latestDecisionId,
                                    });
                                  }}
                                >
                                  Confirm decision
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => setReadinessDecision(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {screen === "roster" &&
                    (!shift ? (
                      <p>
                        Choose an occurrence from Schedule to open its roster.
                      </p>
                    ) : roster.length === 0 ? (
                      <p>No volunteers on this roster.</p>
                    ) : (
                      <>{roster.map((item) => (
                        <div className="table-row" key={item.assignmentId}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.role} · {item.readiness}
                          </span>
                          <span>{item.presence.replace("_", " ")}</span>
                          {(item.presence === "expected" ||
                            item.presence === "on_site") && (
                            <Button
                              size="compact"
                              variant="secondary"
                              disabled={busy || (item.presence === "expected" && item.readiness !== "ready")}
                              onClick={() =>
                                action(
                                  item.presence === "expected"
                                    ? "checkIn"
                                    : "checkOut",
                                  { assignmentId: item.assignmentId },
                                )
                              }
                            >
                              {item.presence === "expected"
                                ? "Check in"
                                : "Check out"}
                            </Button>
                          )}
                          {item.presence === "departed" && <Button size="compact" variant="secondary" onClick={() => setHoursPerson(item)}>Submit hours</Button>}
                        </div>
                      ))}
                      {hoursPerson && <HoursSubmission key={hoursPerson.assignmentId} request={api!.request} scope={{organizationId: org, programId: program, locationId: location}} assignmentId={hoursPerson.assignmentId} name={hoursPerson.name} onSubmitted={() => { setHoursPerson(null); setScreen("hours"); setRevision(v => v + 1) }} onCancel={() => setHoursPerson(null)} onBusyChange={setMutating} />}</>
                    ))}
                  {screen === "coverage" &&
                    (!shift ? (
                      <p>
                        Choose an occurrence from Schedule, then open Coverage.
                      </p>
                    ) : (
                      <>
                        {selectedShift && (
                          <p>
                            <strong>{selectedShift.title}</strong> · {selectedShift.assigned}/{selectedShift.capacity} assigned · {selectedShift.held} held when schedule was loaded. Refresh Schedule for current capacity.
                          </p>
                        )}
                        <p>
                          Waitlist offers hold a place until the deadline.
                          Contact volunteers separately; Ovelle does not send an
                          offer message.
                        </p>
                        {waitlist.length === 0 ? (
                          <p>No waitlist entries for this occurrence.</p>
                        ) : (
                          waitlist.map((item) => (
                            <div className="table-row" key={item.id}>
                              <strong>{item.name}</strong>
                              <span>
                                {item.role} · readiness:{" "}
                                {item.readiness ?? "not recorded"}
                              </span>
                              <span>
                                {item.state}
                                {item.offerExpiresAt
                                  ? ` until ${displayTime(item.offerExpiresAt)}`
                                  : ""}
                              </span>
                              {(item.state === "waiting" ||
                                (item.state === "offered" && item.offerId)) && (
                                <Button
                                  size="compact"
                                  variant="secondary"
                                  onClick={() => {
                                    setOfferEntry(item);
                                    setOfferDeadline("");
                                    setOfferNote("");
                                    setOfferConfirmation(false);
                                  }}
                                >
                                  {item.state === "waiting"
                                    ? "Prepare offer"
                                    : "Record acceptance"}
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                        {offerEntry && (
                          <div className="workflow-card">
                            <h3>
                              {offerEntry.state === "waiting"
                                ? "Prepare offer"
                                : "Record acceptance"}
                              : {offerEntry.name}
                            </h3>
                            {offerEntry.state === "waiting" ? (
                              <>
                                <p>
                                  Contact the volunteer separately. Recording
                                  this offer holds capacity but does not send a
                                  message. The deadline must be within seven
                                  days and no later than the occurrence end.
                                </p>
                                <label>
                                  Offer deadline{" "}
                                  <input
                                    type="datetime-local"
                                    value={offerDeadline}
                                    onChange={(e) => {
                                      setOfferDeadline(e.target.value);
                                      setOfferConfirmation(false);
                                    }}
                                  />
                                </label>
                              </>
                            ) : (
                              <>
                                <p>
                                  Record acceptance only after the volunteer has
                                  agreed through another channel.
                                </p>
                                <label>
                                  Acceptance note{" "}
                                  <input
                                    value={offerNote}
                                    onChange={(e) => {
                                      setOfferNote(e.target.value);
                                      setOfferConfirmation(false);
                                    }}
                                  />
                                </label>
                              </>
                            )}
                            {!offerConfirmation ? (
                              <Button
                                disabled={
                                  busy ||
                                  (offerEntry.state === "waiting"
                                    ? !offerDeadline ||
                                      !Number.isFinite(
                                        new Date(offerDeadline).getTime(),
                                      ) ||
                                      new Date(offerDeadline).getTime() <=
                                        Date.now() ||
                                      new Date(offerDeadline).getTime() >
                                        Date.now() + 7 * 86400000
                                    : !offerNote.trim())
                                }
                                onClick={() => setOfferConfirmation(true)}
                              >
                                Review{" "}
                                {offerEntry.state === "waiting"
                                  ? "offer"
                                  : "acceptance"}
                              </Button>
                            ) : (
                              <>
                                <p>
                                  Confirm{" "}
                                  {offerEntry.state === "waiting"
                                    ? `an offer expiring ${displayTime(new Date(offerDeadline).getTime())}`
                                    : "the volunteer accepted this offer"}
                                  .
                                </p>
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void action(
                                      offerEntry.state === "waiting"
                                        ? "offerWaitlist"
                                        : "confirmOffer",
                                      offerEntry.state === "waiting"
                                        ? {
                                            waitlistId: offerEntry.id,
                                            expiresAt: new Date(
                                              offerDeadline,
                                            ).getTime(),
                                          }
                                        : {
                                            offerId: offerEntry.offerId,
                                            confirmationNote: offerNote.trim(),
                                          },
                                    )
                                  }
                                >
                                  Confirm{" "}
                                  {offerEntry.state === "waiting"
                                    ? "offer"
                                    : "acceptance"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => setOfferConfirmation(false)}
                                >
                                  Back
                                </Button>
                              </>
                            )}
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => setOfferEntry(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </>
                    ))}
                  {screen === "hours" && (
                    <>
                      {hours.length === 0 ? (
                        <p>No submitted hours in this scope.</p>
                      ) : (
                        hours.map((item) => (
                          <button
                            className="row-button"
                            key={item.id}
                            aria-pressed={selected?.id === item.id}
                            onClick={() => {
                              setSelected(item);
                              setReason("");
                            }}
                          >
                            <strong>{item.name}</strong>
                            <span>{item.title}</span>
                            <span>
                              {((item.endAt - item.startAt) / 60000 -
                                item.breakMinutes) /
                                60}{" "}
                              h
                            </span>
                            <span>{item.state}</span>
                          </button>
                        ))
                      )}
                      {selected && (
                        <div className="live-review">
                          <h2>Review {selected.name}</h2>
                          <p>
                            Attendance: {displayTime(selected.checkedInAt)} –{" "}
                            {displayTime(selected.checkedOutAt)}
                          </p>
                          <p>
                            Attendance is evidence and does not approve
                            submitted hours.
                          </p>
                          <label>
                            Reason or clarification
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </label>
                          <p>
                            Clarification is recorded for staff; this action
                            does not send a message.
                          </p>
                          <div className="live-actions">
                            <Button
                              disabled={
                                busy ||
                                selected.state !== "pending" ||
                                decisionId === undefined ||
                                !Number.isSafeInteger(
                                  (selected.endAt - selected.startAt) / 60000 -
                                    selected.breakMinutes,
                                ) ||
                                (selected.endAt - selected.startAt) / 60000 -
                                  selected.breakMinutes <
                                  1
                              }
                              onClick={() => setConfirmation("approve")}
                            >
                              Review approval
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={
                                busy ||
                                selected.state !== "pending" ||
                                decisionId === undefined ||
                                !reason.trim()
                              }
                              onClick={() => setConfirmation("clarify")}
                            >
                              Review clarification
                            </Button>
                          </div>
                          {confirmation && (
                            <div
                              className="workflow-card"
                              role="region"
                              aria-label="Confirm hours decision"
                            >
                              <p>
                                {confirmation === "approve"
                                  ? `Approve ${(selected.endAt - selected.startAt) / 3600000 - selected.breakMinutes / 60} hours for ${selected.name}?`
                                  : `Record this clarification request for ${selected.name}? No message will be sent.`}
                              </p>
                              <div className="live-actions">
                                <Button
                                  disabled={busy}
                                  onClick={() => {
                                    const decision = confirmation;
                                    setConfirmation(null);
                                    void action("reviewHours", {
                                      submissionId: selected.id,
                                      decision,
                                      approvedMinutes:
                                        decision === "approve"
                                          ? (selected.endAt -
                                              selected.startAt) /
                                              60000 -
                                            selected.breakMinutes
                                          : null,
                                      reason:
                                        decision === "approve"
                                          ? null
                                          : reason.trim(),
                                      expectedDecisionId: decisionId,
                                    });
                                  }}
                                >
                                  Confirm{" "}
                                  {confirmation === "approve"
                                    ? "approval"
                                    : "request"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => setConfirmation(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {cursor && (
                    <p>
                      More results are available; pagination is not yet
                      implemented in this view.
                    </p>
                  )}
                </section>
              </LoadingBoundary>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="live-error">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
