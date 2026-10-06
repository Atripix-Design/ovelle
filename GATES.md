# Gates: Ovelle deployment and desktop delivery

Scope: Run Ovelle CI and release delivery on ubuntu-box, deploy both web environments to Cloudflare with isolated D1/R2 resources, and store Mac/Windows desktop packages off GitHub.

- [ ] G1: development and production Cloudflare Workers respond with the intended web app
  CHECK: node scripts/verify-cloudflare-live.mjs workers
  EXPECT: ovelle workers verified
  EVIDENCE: pending

- [ ] G2: development and production each have separate D1 and R2 resources with correct Worker bindings
  CHECK: node scripts/verify-cloudflare-live.mjs resources
  EXPECT: ovelle resources verified
  EVIDENCE: pending

- [ ] G3: trusted CI and deployment jobs execute on ubuntu-box and required development and production workflows pass
  CHECK: node scripts/verify-ci-live.mjs
  EXPECT: ovelle ci verified
  EVIDENCE: pending

- [ ] G4: Windows and macOS desktop packages are built and downloadable from ubuntu-box or Ovelle R2, with no GitHub artifact upload
  CHECK: node scripts/verify-desktop-releases.mjs
  EXPECT: ovelle desktop releases verified
  EVIDENCE: pending

- [ ] G5: local typecheck, lint, and production builds pass for web and desktop
  CHECK: npm run check && npm run lint && npm run build && echo 'ovelle local checks verified'
  EXPECT: ovelle local checks verified
  EVIDENCE: pending

- [ ] G6: setup and recovery instructions match the live deployment, storage, and branch configuration
  EVIDENCE: pending
