import Home from "../../shared/Home"
import ComponentPreview from "../../shared/ComponentPreview"
import DesktopApprovalPage from "./DesktopApprovalPage"

export default function App() {
  if (window.location.pathname === "/desktop/authorize") return <DesktopApprovalPage/>;
  if (window.location.pathname === "/components") return <ComponentPreview/>;
  return <Home/>;
}
