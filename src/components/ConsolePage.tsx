import { useState, useMemo, useCallback, useDeferredValue, memo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { GlassPanel } from "@/components/GlassPanel"
import { SignalDeskHeader } from "@/components/SignalDeskHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { MagnifyingGlass, Funnel, Export, Gear } from "@phosphor-icons/react"
import { Signal, SignalStatus, RequestType } from "@/lib/types"
import { useKV } from "@github/spark/hooks"
import { shortDateFormatter, longDateFormatter } from "@/lib/utils"

type IndexedSignal = Signal & {
  formattedDate: string;
  searchIndex: {
    ticketId: string;
    name: string;
    contact: string;
  };
};

/**
 * ⚡ BOLT OPTIMIZATION: Component Isolation Pattern
 * Isolating the search input state into a memoized component prevents
 * the entire ConsolePage (including O(N) indexing and filtering) from
 * re-rendering on every keystroke.
 */
const SearchAction = memo(function SearchAction({
  onSearch
}: {
  onSearch: (term: string) => void
}) {
  const [term, setTerm] = useState("")
  const deferredTerm = useDeferredValue(term)

  useEffect(() => {
    onSearch(deferredTerm)
  }, [deferredTerm, onSearch])

  return (
    <div className="relative">
      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by Ticket ID, name, or contact"
        className="pl-10"
      />
    </div>
  )
})

/**
 * ⚡ BOLT OPTIMIZATION: Component Isolation Pattern
 * Isolating the settings form state prevents parent re-renders while
 * the operator is configuring webhook credentials.
 */
const SettingsDialogContent = memo(function SettingsDialogContent({
  initialWebhook,
  initialBotToken,
  initialChatId,
  onSave
}: {
  initialWebhook: string;
  initialBotToken: string;
  initialChatId: string;
  onSave: (webhook: string, token: string, chatId: string) => void;
}) {
  const [webhook, setWebhook] = useState(initialWebhook)
  const [token, setToken] = useState(initialBotToken)
  const [chatId, setChatId] = useState(initialChatId)

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Console Settings</DialogTitle>
        <DialogDescription>
          Configure webhook notifications for new signals
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Discord Webhook URL</Label>
          <Input
            id="webhook-url"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <p className="text-xs text-muted-foreground">
            Discord channel for signal notifications
          </p>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Telegram Bot Configuration</h4>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-bot-token">Bot Token</Label>
              <Input
                id="telegram-bot-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              />
              <p className="text-xs text-muted-foreground">
                Get from @BotFather on Telegram
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram-chat-id">Chat ID</Label>
              <Input
                id="telegram-chat-id"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
              />
              <p className="text-xs text-muted-foreground">
                Channel or group chat ID for notifications
              </p>
            </div>
          </div>
        </div>

        <Button onClick={() => onSave(webhook, token, chatId)} className="w-full">
          Save Settings
        </Button>
      </div>
    </DialogContent>
  )
})

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

const PAGE_SIZE = 15

/**
 * Memoized row component to prevent redundant re-renders of the table row
 * when unrelated parent state (like search input) changes.
 */
const SignalRow = memo(function SignalRow({
  signal,
  onClick
}: {
  signal: Signal & { formattedDate: string };
  onClick: (id: string) => void
}) {
  return (
    <TableRow
      key={signal.id}
      className={cn(
        "cursor-pointer transition-all duration-200",
        signal.isNew && "signal-new"
      )}
      onClick={() => onClick(signal.id)}
    >
      <TableCell className="font-medium">
        {signal.ticketId}
      </TableCell>
      <TableCell>
        <div>
          <div className="font-medium">{signal.name}</div>
          <div className="text-sm text-muted-foreground">{signal.contact}</div>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {signal.requestType}
      </TableCell>
      <TableCell>
        <StatusBadge status={signal.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {signal.formattedDate}
      </TableCell>
    </TableRow>
  )
})

/**
 * Memoized table component to isolate the O(N) list rendering from the
 * main ConsolePage state updates. Ensures the table is only re-evaluated
 * when the filtered results actually change.
 */
const SignalTable = memo(function SignalTable({
  signals,
  onRowClick
}: {
  signals: (Signal & { formattedDate: string })[];
  onRowClick: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Ticket ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onClick={onRowClick}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
})

export function ConsolePage() {
  const navigate = useNavigate()
  const [signals, setSignals] = useKV<Signal[]>("signals", [])
  const [webhookUrl, setWebhookUrl] = useKV<string>("discord-webhook-url", "")
  const [telegramBotToken, setTelegramBotToken] = useKV<string>("telegram-bot-token", "")
  const [telegramChatId, setTelegramChatId] = useKV<string>("telegram-chat-id", "")
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  const [deferredSearchTerm, setDeferredSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<SignalStatus | "ALL">("ALL")
  const [typeFilter, setTypeFilter] = useState<RequestType | "ALL">("ALL")
  const [currentPage, setCurrentPage] = useState(1)

  /**
   * Referential stability cache for indexed signals.
   * Maps signal ID to a tuple of [rawSignalReference, indexedSignalObject].
   */
  const indexedCache = useRef<Map<string, [Signal, IndexedSignal]>>(new Map())

  // Index signals with pre-calculated fields to optimize filtering and rendering performance.
  // This index only updates when the signals array changes.
  const indexedSignals = useMemo(() => {
    const rawSignals = signals || []
    const currentCache = indexedCache.current
    const nextCache = new Map<string, [Signal, IndexedSignal]>()

    const results = rawSignals.map(signal => {
      const cached = currentCache.get(signal.id)

      // If the raw signal reference is identical, reuse the indexed object.
      // This preserves referential stability for SignalRow's memoization.
      if (cached && cached[0] === signal) {
        nextCache.set(signal.id, cached)
        return cached[1]
      }

      const indexed = {
        ...signal,
        formattedDate: shortDateFormatter.format(signal.createdAt),
        searchIndex: {
          ticketId: signal.ticketId.toLowerCase(),
          name: signal.name.toLowerCase(),
          contact: signal.contact.toLowerCase()
        }
      }

      nextCache.set(signal.id, [signal, indexed])
      return indexed
    })

    indexedCache.current = nextCache
    return results
  }, [signals])

  // Single-pass filtering and counting logic to minimize array traversals.
  // Performs O(N) filtering and O(N) counting in a single loop.
  const { filteredSignals, activeSignalsCount } = useMemo(() => {
    if (!indexedSignals) return { filteredSignals: [], activeSignalsCount: 0 }
    
    const searchLower = deferredSearchTerm.toLowerCase()
    const result: typeof indexedSignals = []
    let activeCount = 0

    for (const signal of indexedSignals) {
      let isMatch = true

      // Early-exit for status and type filters
      if (statusFilter !== "ALL" && signal.status !== statusFilter) isMatch = false
      if (isMatch && typeFilter !== "ALL" && signal.requestType !== typeFilter) isMatch = false

      if (isMatch && searchLower) {
        // Use pre-calculated search index to avoid O(N) string conversions during keystrokes
        isMatch = (
          signal.searchIndex.ticketId.includes(searchLower) ||
          signal.searchIndex.name.includes(searchLower) ||
          signal.searchIndex.contact.includes(searchLower)
        )
      }

      if (isMatch) {
        result.push(signal)
        if (signal.status !== "RESOLUTION_COMPLETE") {
          activeCount++
        }
      }
    }

    return { filteredSignals: result, activeSignalsCount: activeCount }
  }, [indexedSignals, deferredSearchTerm, statusFilter, typeFilter])

  /**
   * ⚡ BOLT OPTIMIZATION: Client-side Pagination
   * Limits the number of rendered table rows to improve DOM performance
   * and reduce virtual DOM diffing overhead on large datasets.
   */
  const { paginatedSignals, totalPages } = useMemo(() => {
    const total = Math.ceil(filteredSignals.length / PAGE_SIZE)
    const start = (currentPage - 1) * PAGE_SIZE
    const paginated = filteredSignals.slice(start, start + PAGE_SIZE)
    return { paginatedSignals: paginated, totalPages: total }
  }, [filteredSignals, currentPage])

  // Reset to first page when search/filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearchTerm, statusFilter, typeFilter])

  /**
   * Stabilized mark-as-viewed callback to prevent breaking memoization
   * in SignalTable and SignalRow.
   */
  const handleMarkAsViewed = useCallback((signalId: string) => {
    setSignals((current) => {
      if (!current) return []
      const signal = current.find(s => s.id === signalId)
      // ⚡ BOLT OPTIMIZATION: Skip state update if the signal is already marked as viewed
      // to prevent unnecessary full-page re-renders during navigation.
      if (!signal || !signal.isNew) return current
      return current.map(s => s.id === signalId ? { ...s, isNew: false } : s)
    })
  }, [setSignals])

  /**
   * Combined navigation and update handler, memoized to provide a stable
   * reference for downstream components.
   */
  const handleRowClick = useCallback((signalId: string) => {
    handleMarkAsViewed(signalId)
    navigate(`/console/signal/${signalId}`)
  }, [handleMarkAsViewed, navigate])

  const handleExportCSV = () => {
    if (!signals || signals.length === 0) {
      toast.error("No signals to export")
      return
    }

    const headers = ["Ticket ID", "Name", "Contact", "Request Type", "Project", "Status", "Created At", "Updated At"]
    const rows = signals.map(s => [
      s.ticketId,
      s.name,
      s.contact,
      s.requestType,
      s.project || "",
      s.status,
      longDateFormatter.format(s.createdAt),
      longDateFormatter.format(s.updatedAt)
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `signals-export-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
    
    toast.success("Signals exported to CSV")
  }

  const handleSaveSettings = useCallback((webhook: string, token: string, chatId: string) => {
    setWebhookUrl(webhook)
    setTelegramBotToken(token)
    setTelegramChatId(chatId)
    setSettingsOpen(false)
    toast.success("Settings saved")
  }, [setWebhookUrl, setTelegramBotToken, setTelegramChatId])

  const scrollToQueue = useCallback(() => {
    const element = document.getElementById('signal-queue')
    element?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <SignalDeskHeader 
        variant="console"
        onOpenQueue={scrollToQueue}
        onActiveSignals={scrollToQueue}
      />
      
      <div className="p-6 sm:p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-7xl mx-auto"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                Signal Queue
              </h2>
              <p className="text-muted-foreground">
                {activeSignalsCount} active signal{activeSignalsCount !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Gear className="mr-2" />
                    Settings
                  </Button>
                </DialogTrigger>
                <SettingsDialogContent
                  initialWebhook={webhookUrl || ""}
                  initialBotToken={telegramBotToken || ""}
                  initialChatId={telegramChatId || ""}
                  onSave={handleSaveSettings}
                />
              </Dialog>
              
              <Button onClick={handleExportCSV} variant="outline">
                <Export className="mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <GlassPanel className="mb-6" id="signal-queue">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <SearchAction onSearch={setDeferredSearchTerm} />
              </div>

              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SignalStatus | "ALL")}>
                  <SelectTrigger className="w-[180px]">
                    <Funnel className="mr-2" size={18} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="SIGNAL_RECEIVED">Signal Received</SelectItem>
                    <SelectItem value="OPERATOR_ASSIGNED">Operator Assigned</SelectItem>
                    <SelectItem value="IN_REVIEW">In Review</SelectItem>
                    <SelectItem value="WAITING_ON_USER">Waiting On User</SelectItem>
                    <SelectItem value="RESOLUTION_COMPLETE">Resolution Complete</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as RequestType | "ALL")}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="Technical Support">Technical Support</SelectItem>
                    <SelectItem value="Billing / Order Help">Billing / Order Help</SelectItem>
                    <SelectItem value="Partnership / Collaboration">Partnership / Collaboration</SelectItem>
                    <SelectItem value="Custom Build Request">Custom Build Request</SelectItem>
                    <SelectItem value="General Inquiry">General Inquiry</SelectItem>
                    <SelectItem value="STIX MΛGIC Support">STIX MΛGIC Support</SelectItem>
                    <SelectItem value="ClipsFlow Support">ClipsFlow Support</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="overflow-hidden p-0">
            {filteredSignals.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <p>No active signals</p>
              </div>
            ) : (
              <div className="flex flex-col">
                <SignalTable
                  signals={paginatedSignals}
                  onRowClick={handleRowClick}
                />

                {totalPages > 1 && (
                  <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filteredSignals.length)} of {filteredSignals.length} signals
                    </div>

                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage > 1) setCurrentPage(currentPage - 1);
                            }}
                            className={cn(
                              "cursor-pointer",
                              currentPage === 1 && "pointer-events-none opacity-50"
                            )}
                          />
                        </PaginationItem>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <PaginationItem key={page} className="hidden sm:inline-block">
                            <PaginationLink
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}

                        <PaginationItem>
                          <PaginationNext
                            onClick={(e) => {
                              e.preventDefault();
                              if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                            }}
                            className={cn(
                              "cursor-pointer",
                              currentPage === totalPages && "pointer-events-none opacity-50"
                            )}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </div>
            )}
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  )
}
