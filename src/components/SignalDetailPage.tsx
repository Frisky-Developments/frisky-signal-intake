import { useState, useMemo, useCallback, memo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { GlassPanel } from "@/components/GlassPanel"
import { StatusBadge } from "@/components/StatusBadge"
import { ArrowLeft, Note, FloppyDisk } from "@phosphor-icons/react"
import { Signal, SignalStatus, InternalNote } from "@/lib/types"
import { useKV } from "@github/spark/hooks"
import { longDateFormatter } from "@/lib/utils"
import { motion } from "framer-motion"
import { toast } from "sonner"

/**
 * ⚡ BOLT OPTIMIZATION: Component Isolation Pattern
 * Extracting high-frequency state into a memoized sub-component prevents
 * the entire Detail Page and its expensive system log derivation from
 * re-rendering on every keystroke.
 */
const StatusAction = memo(function StatusAction({
  onStatusChange
}: {
  onStatusChange: (status: SignalStatus) => void
}) {
  const [newStatus, setNewStatus] = useState<SignalStatus | "">("")

  const handleSubmit = () => {
    if (!newStatus) {
      toast.error("Please select a status")
      return
    }
    onStatusChange(newStatus)
    setNewStatus("")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Change Status</label>
        <Select value={newStatus} onValueChange={(value) => setNewStatus(value as SignalStatus)}>
          <SelectTrigger>
            <SelectValue placeholder="Select new status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SIGNAL_RECEIVED">Signal Received</SelectItem>
            <SelectItem value="OPERATOR_ASSIGNED">Operator Assigned</SelectItem>
            <SelectItem value="IN_REVIEW">In Review</SelectItem>
            <SelectItem value="WAITING_ON_USER">Waiting On User</SelectItem>
            <SelectItem value="RESOLUTION_COMPLETE">Resolution Complete</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSubmit} className="w-full" variant="outline">
          <FloppyDisk className="mr-2" />
          Update Status
        </Button>
      </div>
    </div>
  )
})

/**
 * ⚡ BOLT OPTIMIZATION: Component Isolation Pattern
 * Extracting high-frequency state into a memoized sub-component prevents
 * the entire Detail Page and its expensive system log derivation from
 * re-rendering on every keystroke.
 */
const NoteAction = memo(function NoteAction({
  onAddNote
}: {
  onAddNote: (content: string) => void
}) {
  const [noteContent, setNoteContent] = useState("")

  const handleSubmit = () => {
    if (!noteContent.trim()) {
      toast.error("Note cannot be empty")
      return
    }
    onAddNote(noteContent)
    setNoteContent("")
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={noteContent}
        onChange={(e) => setNoteContent(e.target.value)}
        placeholder="Add internal note..."
        rows={3}
      />
      <Button onClick={handleSubmit} className="w-full">
        <Note className="mr-2" />
        Add Note
      </Button>
    </div>
  )
})

export function SignalDetailPage() {
  const { signalId } = useParams()
  const navigate = useNavigate()
  const [signals, setSignals] = useKV<Signal[]>("signals", [])

  /**
   * ⚡ BOLT OPTIMIZATION: Map Indexing Pattern
   * Index signals by ID for O(1) lookup performance.
   * Prevents O(N) linear scans when navigating between signal details.
   */
  const signalsById = useMemo(() => {
    const map = new Map<string, Signal>()
    signals?.forEach(s => map.set(s.id, s))
    return map
  }, [signals])

  const signal = useMemo(() => {
    if (!signalId) return null
    return signalsById.get(signalId) || null
  }, [signalsById, signalId])

  if (!signal) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <GlassPanel>
          <p className="text-muted-foreground">Signal not found</p>
          <Button onClick={() => navigate("/console")} className="mt-4">
            Return to Console
          </Button>
        </GlassPanel>
      </div>
    )
  }

  const handleAddNote = useCallback((content: string) => {
    const newNote: InternalNote = {
      id: `note-${Date.now()}`,
      content,
      timestamp: Date.now()
    }

    setSignals((current) =>
      current?.map(s =>
        s.id === signalId
          ? { ...s, notes: [...s.notes, newNote], updatedAt: Date.now() }
          : s
      ) ?? []
    )

    toast.success("Note added")
  }, [signalId, setSignals])

  const handleStatusChange = useCallback((status: SignalStatus) => {
    const now = Date.now()

    setSignals((current) =>
      current?.map(s =>
        s.id === signalId
          ? {
              ...s,
              status: status,
              updatedAt: now,
              statusHistory: [...s.statusHistory, { status, timestamp: now }]
            }
          : s
      ) ?? []
    )

    toast.success("Status updated")
  }, [signalId, setSignals])

  /**
   * ⚡ BOLT OPTIMIZATION: Render Loop Date Optimization
   * Pre-calculate formatted date strings within the useMemo that generates
   * the derived system log state. This prevents redundant and expensive
   * Intl.DateTimeFormat calls during any parent component re-renders.
   */
  const { systemLog, formattedDetails } = useMemo(() => {
    const entries = [
      {
        type: "SYSTEM",
        message: "Signal received",
        timestamp: signal.createdAt,
        formattedTime: longDateFormatter.format(signal.createdAt)
      },
      ...signal.statusHistory.map(h => ({
        type: "SYSTEM",
        message: `Status changed to ${h.status.replace(/_/g, " ")}`,
        timestamp: h.timestamp,
        formattedTime: longDateFormatter.format(h.timestamp)
      })),
      ...signal.notes.map(n => ({
        type: "OPERATOR",
        message: `Note added`,
        timestamp: n.timestamp,
        formattedTime: longDateFormatter.format(n.timestamp)
      }))
    ].sort((a, b) => a.timestamp - b.timestamp)

    const details = {
      createdAt: longDateFormatter.format(signal.createdAt),
      updatedAt: longDateFormatter.format(signal.updatedAt),
      notes: signal.notes.map(n => ({
        ...n,
        formattedTime: longDateFormatter.format(n.timestamp)
      }))
    }

    return { systemLog: entries, formattedDetails: details }
  }, [signal])

  return (
    <div className="min-h-screen bg-background p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-6xl mx-auto"
      >
        <Button
          variant="ghost"
          onClick={() => navigate("/console")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2" />
          Back to Console
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GlassPanel>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold mb-1">
                      {signal.ticketId}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {signal.requestType}
                    </p>
                  </div>
                  <StatusBadge status={signal.status} />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Name</p>
                    <p className="font-medium">{signal.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Contact</p>
                    <p className="font-medium">{signal.contact}</p>
                  </div>
                  {signal.project && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground mb-1">Project / Brand</p>
                      <p className="font-medium">{signal.project}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground mb-1">Created</p>
                    <p className="font-medium">{formattedDetails.createdAt}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Last Updated</p>
                    <p className="font-medium">{formattedDetails.updatedAt}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-muted-foreground mb-2 text-sm">Message</p>
                  <div className="bg-secondary/30 rounded p-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{signal.message}</p>
                  </div>
                </div>
              </div>
            </GlassPanel>

            <GlassPanel>
              <h2 className="text-lg font-medium mb-4">Internal Notes</h2>
              
              <div className="space-y-4 mb-6">
                {formattedDetails.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No notes yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {formattedDetails.notes.map(note => (
                      <div key={note.id} className="bg-secondary/30 rounded p-4">
                        <p className="text-sm mb-2">{note.content}</p>
                        <p className="text-xs text-muted-foreground">
                          {note.formattedTime}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <NoteAction onAddNote={handleAddNote} />
            </GlassPanel>
          </div>

          <div className="space-y-6">
            <GlassPanel>
              <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
              <StatusAction onStatusChange={handleStatusChange} />
            </GlassPanel>

            <GlassPanel>
              <h2 className="text-lg font-medium mb-4">System Log</h2>
              
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {systemLog.map((entry, index) => (
                    <div key={index} className="text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-accent uppercase tracking-wider flex-shrink-0">
                          [{entry.type}]
                        </span>
                        <span className="text-muted-foreground flex-1">
                          {entry.message}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-1 ml-[72px]">
                        {entry.formattedTime}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </GlassPanel>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
