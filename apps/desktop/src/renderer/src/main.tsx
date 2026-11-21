import "./tailwind.css";
import "@ovelle/ui/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import ComponentPreview from "../../../../shared/ComponentPreview";
import WorkflowPreview from "./WorkflowPreview";
import type { DesktopRelease } from "@ovelle/ui";
declare global {
  interface Window {
    ovelleDownloads?: {
      loadReleases: () => Promise<DesktopRelease[]>;
      emailLink: (email: string) => Promise<void>;
    };
  }
}

const platform = navigator.userAgent.includes("Windows") ? "windows" : navigator.userAgent.includes("Macintosh") ? "macos" : "other";
document.documentElement.dataset.desktopPlatform = platform;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.search.includes("components") ? (
      <ComponentPreview />
    ) : (
      <WorkflowPreview />
    )}
  </React.StrictMode>,
);
