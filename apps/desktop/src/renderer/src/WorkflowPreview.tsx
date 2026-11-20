import { useState } from "react";
import { Button } from "@ovelle/ui";
import "./workflow.css";
import LiveWorkspace from "./LiveWorkspace";

type Page =
  | "schedule"
  | "occurrence"
  | "readiness"
  | "coverage"
  | "roster"
  | "hours";
type Person = {
  name: string;
  role: string;
  ready: boolean;
  attendance: "expected" | "on_site" | "departed" | "no_show";
  minutes: number;
  review: "pending" | "approved" | "clarification";
};
const initialPeople: Person[] = [
  {
    name: "Avery Kim",
    role: "General volunteer",
    ready: true,
    attendance: "departed",
    minutes: 240,
    review: "pending",
  },
  {
    name: "Morgan Lee",
    role: "General volunteer",
    ready: true,
    attendance: "on_site",
    minutes: 240,
    review: "pending",
  },
  {
    name: "Riley Torres",
    role: "General volunteer",
    ready: false,
    attendance: "expected",
    minutes: 210,
    review: "clarification",
  },
  {
    name: "Samir Das",
    role: "Site lead",
    ready: true,
    attendance: "no_show",
    minutes: 0,
    review: "pending",
  },
];
const pageNames: Record<Page, string> = {
  schedule: "Schedule",
  occurrence: "Occurrence",
  readiness: "Readiness",
  coverage: "Waitlist & coverage",
  roster: "Day-of roster",
  hours: "Hours review",
};
const time = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;

/** Interactive design preview; no preview action writes to a real organization. */
export default function WorkflowPreview() {
  const [live, setLive] = useState(false);
  const [page, setPage] = useState<Page>("schedule");
  const [people, setPeople] = useState(initialPeople);
  const [selected, setSelected] = useState("Avery Kim");
  const [notice, setNotice] = useState("");
  const [nextWeek, setNextWeek] = useState(false);
  const [waitlist, setWaitlist] = useState([
    { name: "Taylor Reed", status: "Waiting" },
    { name: "Casey Johnson", status: "Waiting" },
  ]);
  const navigate = (next: Page) => {
    setNotice("");
    setPage(next);
  };
  const updatePerson = (name: string, change: Partial<Person>) =>
    setPeople((rows) =>
      rows.map((row) => (row.name === name ? { ...row, ...change } : row)),
    );
  const openPlaces =
    2 - waitlist.filter((person) => person.status === "Offer recorded").length;
  const chosen = people.find((p) => p.name === selected) ?? people[0];
  const counts = {
    onsite: people.filter((p) => p.attendance === "on_site").length,
    expected: people.filter((p) => p.attendance === "expected").length,
    departed: people.filter((p) => p.attendance === "departed").length,
    noShow: people.filter((p) => p.attendance === "no_show").length,
  };
  if (live) return <LiveWorkspace onPreview={() => setLive(false)} />;
  return (
    <div className="workflow-app">
      <header className="workflow-topbar">
        <strong className="workflow-brand">ovelle</strong>
        <span className="workflow-org">Riverside Conservation Network</span>
        <span className="workflow-preview-label">
          Preview data · changes are temporary
        </span>
        <button className="workflow-live-link" onClick={() => setLive(true)}>
          Live workspace
        </button>
        <span className="workflow-account">Jordan Smith</span>
      </header>
      <div className="workflow-layout">
        <nav className="workflow-rail" aria-label="Workflow navigation">
          {(
            ["schedule", "readiness", "coverage", "roster", "hours"] as Page[]
          ).map((item, i) => (
            <button
              key={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => navigate(item)}
              title={pageNames[item]}
            >
              <span aria-hidden="true">{["▦", "✓", "♧", "☷", "▥"][i]}</span>
              <span className="workflow-rail-label">{pageNames[item]}</span>
            </button>
          ))}
        </nav>
        <main className="workflow-main" id="main-content">
          <div className="workflow-notice" role="status">
            {notice ||
              "Interactive preview · no organization data is connected"}
          </div>
          {page === "schedule" && (
            <>
              <div className="workflow-heading">
                <h1>Schedule</h1>
                <p>
                  Coordinate occurrences, places and the people assigned to
                  them.
                </p>
              </div>
              <div className="workflow-columns">
                <section className="workflow-card calendar">
                  <div className="section-heading">
                    <div>
                      <h2>Week of February {nextWeek ? "8" : "1"}</h2>
                      <p>{nextWeek ? "February 8–14" : "February 1–7"}</p>
                    </div>
                    <button
                      className="text-action"
                      onClick={() => setNextWeek((value) => !value)}
                    >
                      {nextWeek ? "← Previous week" : "Next week →"}
                    </button>
                  </div>
                  <div className="calendar-days">
                    {(nextWeek
                      ? [
                          "Mon 8",
                          "Tue 9",
                          "Wed 10",
                          "Thu 11",
                          "Fri 12",
                          "Sat 13",
                          "Sun 14",
                        ]
                      : [
                          "Mon 1",
                          "Tue 2",
                          "Wed 3",
                          "Thu 4",
                          "Fri 5",
                          "Sat 6",
                          "Sun 7",
                        ]
                    ).map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {!nextWeek && (
                      <button
                        className="calendar-event"
                        onClick={() => navigate("occurrence")}
                      >
                        <strong>
                          Riverside
                          <br />
                          clean-up
                        </strong>
                        <span>18 / 20</span>
                      </button>
                    )}
                  </div>
                </section>
                <aside className="workflow-card">
                  <h2>Riverside clean-up</h2>
                  <p>February 1 · 8:00 AM – 12:00 PM</p>
                  <p>Riverside Park</p>
                  <p className="accent">18 / 20 assigned · {openPlaces} open</p>
                  <p>Roles: General volunteer, site lead</p>
                  <div className="link-list">
                    <button onClick={() => navigate("occurrence")}>
                      Open occurrence →
                    </button>
                    <button onClick={() => navigate("roster")}>
                      View roster →
                    </button>
                    <button onClick={() => navigate("coverage")}>
                      Review coverage →
                    </button>
                  </div>
                </aside>
                <section className="workflow-card">
                  <h2>Upcoming occurrences</h2>
                  <button
                    className="row-button"
                    onClick={() => navigate("occurrence")}
                  >
                    <strong>Feb 1 · Riverside clean-up</strong>
                    <span>18 / 20 assigned · {openPlaces} open →</span>
                  </button>
                </section>
                <aside className="workflow-card tint">
                  <h2>Coordination</h2>
                  <p>{openPlaces} places remain for Riverside clean-up.</p>
                  <button
                    className="text-action"
                    onClick={() => navigate("coverage")}
                  >
                    Review coverage →
                  </button>
                </aside>
              </div>
            </>
          )}
          {page === "occurrence" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("schedule")}
              >
                ← Schedule
              </button>
              <div className="workflow-heading">
                <h1>Riverside clean-up</h1>
                <p>February 1 · 8:00 AM – 12:00 PM · Riverside Park</p>
              </div>
              <div className="workflow-tabs">
                <button aria-current="page">Overview</button>
                <button onClick={() => navigate("readiness")}>Readiness</button>
                <button onClick={() => navigate("roster")}>
                  Day-of roster
                </button>
                <button onClick={() => navigate("hours")}>Hours review</button>
              </div>
              <div className="workflow-columns">
                <section className="workflow-card">
                  <h2>Places and roles</h2>
                  <p className="accent">
                    18 of 20 places assigned · {openPlaces} open
                  </p>
                  <div className="table-row">
                    <span>General volunteer</span>
                    <span>16 / 18 assigned</span>
                  </div>
                  <div className="table-row">
                    <span>Site lead</span>
                    <span>2 / 2 assigned</span>
                  </div>
                </section>
                <aside className="workflow-card">
                  <h2>Next actions</h2>
                  <div className="link-list">
                    <button onClick={() => navigate("readiness")}>
                      Review readiness →
                    </button>
                    <button onClick={() => navigate("coverage")}>
                      Waitlist & coverage →
                    </button>
                    <button onClick={() => navigate("roster")}>
                      View roster →
                    </button>
                  </div>
                </aside>
                <section className="workflow-card">
                  <h2>Assigned volunteers</h2>
                  <p>People assigned to this occurrence.</p>
                  {people.map((p) => (
                    <div className="table-row" key={p.name}>
                      <strong>{p.name}</strong>
                      <span>{p.role}</span>
                      <span className="success">Confirmed</span>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
          {page === "readiness" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("occurrence")}
              >
                ← Riverside clean-up
              </button>
              <div className="workflow-heading">
                <h1>Readiness</h1>
                <p>
                  Review whether volunteers are ready for their assigned role.
                </p>
              </div>
              <div className="workflow-columns">
                <section className="workflow-card">
                  <h2>Volunteer readiness</h2>
                  <p>Readiness and attendance are separate decisions.</p>
                  {people.map((p) => (
                    <div className="table-row" key={p.name}>
                      <strong>{p.name}</strong>
                      <span>{p.role}</span>
                      <span className={p.ready ? "success" : "attention"}>
                        {p.ready ? "Ready" : "Needs review"}
                      </span>
                      {!p.ready && (
                        <Button
                          size="compact"
                          variant="secondary"
                          onClick={() => {
                            updatePerson(p.name, { ready: true });
                            setNotice(
                              `${p.name} marked ready in this preview.`,
                            );
                          }}
                        >
                          Mark ready
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
                <aside className="workflow-card tint">
                  <h2>Before assigning</h2>
                  <p>
                    Review requirements and current eligibility for each role.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => navigate("coverage")}
                  >
                    Open waitlist & coverage →
                  </button>
                </aside>
              </div>
            </>
          )}
          {page === "coverage" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("occurrence")}
              >
                ← Riverside clean-up
              </button>
              <div className="workflow-heading">
                <h1>Waitlist & coverage</h1>
                <p>
                  Review waiting volunteers, available places and offers
                  together.
                </p>
              </div>
              <div className="workflow-columns">
                <section className="workflow-card">
                  <h2>Waiting for a place</h2>
                  <p>
                    Riverside clean-up · February 1 · {openPlaces} places
                    currently open
                  </p>
                  {waitlist.map((person) => (
                    <div className="table-row" key={person.name}>
                      <strong>{person.name}</strong>
                      <span>{person.status}</span>
                      <Button
                        size="compact"
                        variant="secondary"
                        disabled={person.status !== "Waiting"}
                        onClick={() => {
                          setWaitlist((rows) =>
                            rows.map((row) =>
                              row.name === person.name
                                ? { ...row, status: "Offer recorded" }
                                : row,
                            ),
                          );
                          setNotice(
                            `Offer recorded for ${person.name} in this preview.`,
                          );
                        }}
                      >
                        Record offer
                      </Button>
                    </div>
                  ))}
                </section>
                <aside className="workflow-card tint">
                  <h2>Available places</h2>
                  <p className="accent">{openPlaces} currently open</p>
                  <p>
                    An active offer holds a place until its deadline. It is not
                    an assignment.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => navigate("occurrence")}
                  >
                    Review occurrence →
                  </button>
                </aside>
              </div>
            </>
          )}
          {page === "roster" && (
            <>
              <button
                className="back-link"
                onClick={() => navigate("occurrence")}
              >
                ← Riverside clean-up
              </button>
              <div className="workflow-heading">
                <h1>Day-of roster</h1>
                <p>Record attendance for the February 1 occurrence.</p>
              </div>
              <div className="workflow-stats">
                {[
                  ["On site", counts.onsite],
                  ["Expected", counts.expected],
                  ["Departed", counts.departed],
                  ["No-show", counts.noShow],
                ].map(([label, value]) => (
                  <div className="workflow-card" key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="workflow-columns">
                <section className="workflow-card">
                  <h2>Assigned volunteers</h2>
                  <p>Attendance is separate from hours approval.</p>
                  {people.map((p) => (
                    <div className="table-row" key={p.name}>
                      <strong>{p.name}</strong>
                      <span>{p.role}</span>
                      <span>{p.attendance.replace("_", " ")}</span>
                      <Button
                        size="compact"
                        variant="secondary"
                        disabled={
                          p.attendance === "departed" ||
                          p.attendance === "no_show" ||
                          !p.ready
                        }
                        onClick={() => {
                          const next =
                            p.attendance === "expected"
                              ? "on_site"
                              : "departed";
                          updatePerson(p.name, { attendance: next });
                          setNotice(
                            `${p.name} ${next === "on_site" ? "checked in" : "checked out"} in this preview.`,
                          );
                        }}
                      >
                        {p.attendance === "on_site" ? "Check out" : "Check in"}
                      </Button>
                    </div>
                  ))}
                </section>
                <aside className="workflow-card tint">
                  <h2>Roster actions</h2>
                  <p>Review submitted hours after attendance is recorded.</p>
                  <button
                    className="text-action"
                    onClick={() => navigate("hours")}
                  >
                    Review submitted hours →
                  </button>
                  <button
                    className="text-action"
                    onClick={() => navigate("readiness")}
                  >
                    Review readiness →
                  </button>
                </aside>
              </div>
            </>
          )}
          {page === "hours" && (
            <>
              <div className="workflow-heading">
                <h1>Hours review</h1>
                <p>
                  Compare submitted time with evidence before making a decision.
                </p>
              </div>
              <div className="workflow-columns">
                <section className="workflow-card">
                  <h2>Submitted hours</h2>
                  <p>
                    Choose a submission to review its supporting information.
                  </p>
                  {people
                    .filter((p) => p.minutes > 0)
                    .map((p) => (
                      <button
                        className="row-button"
                        aria-pressed={chosen.name === p.name}
                        key={p.name}
                        onClick={() => {
                          setSelected(p.name);
                          setNotice("");
                        }}
                      >
                        <strong>{p.name}</strong>
                        <span>Riverside clean-up</span>
                        <span>{time(p.minutes)}</span>
                        <span>
                          {p.review === "pending" ? "To review" : p.review}
                        </span>
                      </button>
                    ))}
                </section>
                <aside className="workflow-card">
                  <h2>{chosen.name}</h2>
                  <p>Riverside clean-up · February 1</p>
                  <p className="small-label">SUBMITTED TIME</p>
                  <strong>{time(chosen.minutes)}</strong>
                  <p className="small-label">ATTENDANCE EVIDENCE</p>
                  <p>{chosen.attendance.replace("_", " ")}</p>
                  <p>
                    Attendance is evidence; it does not approve submitted hours.
                  </p>
                  <Button
                    disabled={chosen.review === "approved"}
                    onClick={() => {
                      updatePerson(chosen.name, { review: "approved" });
                      setNotice(
                        `${chosen.name}'s hours approved in this preview.`,
                      );
                    }}
                  >
                    Approve hours
                  </Button>
                  <button
                    className="text-action"
                    onClick={() => {
                      updatePerson(chosen.name, { review: "clarification" });
                      setNotice(
                        `Clarification requested in this preview. No message was sent.`,
                      );
                    }}
                  >
                    Request clarification →
                  </button>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
