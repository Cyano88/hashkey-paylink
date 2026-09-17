export const safeError = message => Object.assign(new Error(message), { safeForCli: true })
