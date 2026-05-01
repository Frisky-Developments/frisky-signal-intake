export type RequestType = 
  | "Technical Support"
  | "Billing / Order Help"
  | "Partnership / Collaboration"
  | "Custom Build Request"
  | "General Inquiry"
  | "STIX MΛGIC Support"
  | "ClipsFlow Support"

export type SignalStatus = 
  | "SIGNAL_RECEIVED"
  | "OPERATOR_ASSIGNED"
  | "IN_REVIEW"
  | "WAITING_ON_USER"
  | "RESOLUTION_COMPLETE"

export interface Signal {
  id: string
  ticketId: string
  name: string
  contact: string
  requestType: RequestType
  project?: string
  message: string
  status: SignalStatus
  createdAt: number
  updatedAt: number
  notes: InternalNote[]
  statusHistory: StatusHistoryEntry[]
  isNew: boolean
}

export interface InternalNote {
  id: string
  content: string
  timestamp: number
  formattedDate?: string
}

export interface StatusHistoryEntry {
  status: SignalStatus
  timestamp: number
}
