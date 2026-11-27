import "./tailwind.css";
import "@ovelle/ui/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "./style.css";
import ComponentPreview from "../../../../shared/ComponentPreview";
import LiveWorkspace from "./LiveWorkspace";
import "./workflow.css";
import type { DesktopRelease } from "@ovelle/ui";
declare global {
  interface Window {
    ovelleWindowChrome?: {
      onFullScreenChange: (listener: (active: boolean) => void) => () => void;
    };
    ovelleDownloads?: {
      loadReleases: () => Promise<DesktopRelease[]>;
      emailLink: (email: string) => Promise<void>;
    };
  }
}

const platform = navigator.userAgent.includes("Windows") ? "windows" : navigator.userAgent.includes("Macintosh") ? "macos" : "other";
document.documentElement.dataset.desktopPlatform = platform;
if (platform === 'macos') {
  const unsubscribe = window.ovelleWindowChrome?.onFullScreenChange((active) => {
    document.documentElement.toggleAttribute('data-mac-full-screen', active);
  });
  import.meta.hot?.dispose(() => unsubscribe?.());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.search.includes("components") ? (
      <ComponentPreview />
    ) : (
      <LiveWorkspace />
    )}
  </React.StrictMode>,
);
