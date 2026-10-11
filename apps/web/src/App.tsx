import Home from "../../shared/Home"
import ComponentPreview from "../../shared/ComponentPreview"

export default function App() {
  if (window.location.pathname === "/components") return <ComponentPreview/>;
  return <Home/>;
}
