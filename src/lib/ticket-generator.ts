const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export function generateTicketId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000)
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]
  return `FRK-${digits}-${letter}`
}

/**
 * Generates a unique ticket ID by checking against a Set of existing IDs.
 * Using a Set ensures O(1) lookup time for uniqueness checks.
 */
export function generateUniqueTicketId(existingIds: Set<string>): string {
  let attempts = 0
  let ticketId = generateTicketId()
  
  while (existingIds.has(ticketId) && attempts < 10) {
    ticketId = generateTicketId()
    attempts++
  }
  
  return ticketId
}
