/** Narrow desktop workflow bridge; native credentials never cross these channels. */
export const workflowChannels = Object.freeze({
  signIn: 'ovelle:workflow-sign-in',
  signOut: 'ovelle:workflow-sign-out',
  status: 'ovelle:workflow-status',
  request: 'ovelle:workflow-request',
})
