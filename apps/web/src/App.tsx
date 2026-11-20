import Home from "../../shared/Home"
import ComponentPreview from "../../shared/ComponentPreview"
import DesktopApprovalPage from "./DesktopApprovalPage"
import AccountSignInPage from "./AccountSignInPage"
import AccountLanding from "./AccountLanding"
import AccountEnrollmentPage from "./AccountEnrollmentPage"
import AccountVerifyContactPage from "./AccountVerifyContactPage"

export default function App() {
  if (window.location.pathname === "/account/enroll") return <AccountEnrollmentPage/>;
  if (window.location.pathname === "/account/verify-contact") return <AccountVerifyContactPage/>;
  if (window.location.pathname === "/account") return <AccountLanding/>;
  if (window.location.pathname === "/account/sign-in") return <AccountSignInPage/>;
  if (window.location.pathname === "/desktop/authorize") return <DesktopApprovalPage/>;
  if (window.location.pathname === "/components") return <ComponentPreview/>;
  return <Home/>;
}
