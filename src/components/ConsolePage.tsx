import { useState, useMemo, useCallback, useDeferredValue, memo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  MagnifyingGlass,
  Funnel,
  Export,
  Gear
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

import { GlassPanel } from "@/components/GlassPanel"
import { SignalDeskHeader } from "@/components/SignalDeskHeader"
import { StatusBadge } from "@/components/StatusBadge"

import { useKV } from "@github/spark/hooks"
import { Signal, SignalStatus, RequestType } from "@/lib/types"
import { cn, shortDateFormatter, longDateFormatter } from "@/lib/utils"

type IndexedSignal = Signal & {
  formattedDate: string;
  searchStr: string;
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

const PAGE_SIZE = 15

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
        // ⚡ BOLT OPTIMIZATION: Consolidated search index to reduce object allocation
        // and simplify string lookups in the filter loop.
        searchStr: `${signal.ticketId} ${signal.name} ${signal.contact}`.toLowerCase()
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
        // ⚡ BOLT OPTIMIZATION: Reduced string operations by 66% using consolidated index.
        isMatch = signal.searchStr.includes(searchLower)
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
   * Slicing the filtered signals array based on current page reduces the
   * number of DOM nodes being rendered/diffed, improving performance.
   */
  const paginatedSignals = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredSignals.slice(start, start + PAGE_SIZE)
  }, [filteredSignals, currentPage])

  const totalPages = Math.ceil(filteredSignals.length / PAGE_SIZE)

  /**
   * ⚡ BOLT OPTIMIZATION: Pagination Pruning
   * Pre-calculates the exact set of page markers to display.
   * Converts O(TotalPages) render logic into O(1) by avoiding
   * iteration over the entire page range in JSX.
   */
  const visiblePages = useMemo(() => {
    const pages: (number | "ellipsis")[] = []

    if (totalPages <= 1) return pages

    // Always include the first page
    pages.push(1)

    // Add ellipsis if current page is far from the start
    if (currentPage > 3) {
      pages.push("ellipsis")
    }

    // Add a range of pages around the current page
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    // Add ellipsis if current page is far from the end
    if (currentPage < totalPages - 2) {
      pages.push("ellipsis")
    }

    // Always include the last page
    pages.push(totalPages)

    return pages
  }, [totalPages, currentPage])

  /**
   * ⚡ BOLT OPTIMIZATION: State Update Bailout
   * Only trigger a state update if the signal is actually new.
   * This prevents redundant full-page re-renders and virtual DOM
   * recalculations when navigating between already-viewed signals.
   */
  const handleMarkAsViewed = useCallback((signalId: string) => {
    setSignals((current) => {
      if (!current) return []
      let changed = false
      const next = current.map(s => {
        if (s.id === signalId && s.isNew) {
          changed = true
          return { ...s, isNew: false }
        }
        return s
      })
      return changed ? next : current
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
                <SearchAction onSearch={(term) => {
                  setDeferredSearchTerm(term)
                  setCurrentPage(1)
                }} />
              </div>

              <div className="flex gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value as SignalStatus | "ALL")
                    setCurrentPage(1)
                  }}
                >
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

                <Select
                  value={typeFilter}
                  onValueChange={(value) => {
                    setTypeFilter(value as RequestType | "ALL")
                    setCurrentPage(1)
                  }}
                >
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
              <>
                <SignalTable
                  signals={paginatedSignals}
                  onRowClick={handleRowClick}
                />

                {totalPages > 1 && (
                  <div className="p-4 border-t bg-secondary/10">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setCurrentPage(prev => Math.max(1, prev - 1))
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>

                        {visiblePages.map((page, idx) => (
                          <PaginationItem key={page === "ellipsis" ? `ellipsis-${idx}` : page}>
                            {page === "ellipsis" ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setCurrentPage(page)
                                }}
                                isActive={currentPage === page}
                              >
                                {page}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}

                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault()
                              setCurrentPage(prev => Math.min(totalPages, prev + 1))
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  )
}
