export function isClearAgentHashChatCommand(value: string) {
  return /^(?:clear|clear chat|clear history|clear conversation|clean chat|delete chat|delete history|wipe chat|reset chat)[.!?]*$/i.test(value.trim())
}
