"use client";

import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Download,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  UserCircle2,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BOOKING_CHANNELS, MEETING_MODES } from "@/lib/constants";

type Role = "ADMIN" | "EMPLOYEE";
type MeetingMode = "OFFLINE" | "GOOGLE_MEET" | "ZOOM";
type BookingStatus = "BOOKED" | "CHECKED_IN" | "RELEASED" | "CANCELLED";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

type User = AuthUser & {
  department: string;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  blockedById: string | null;
};

type Room = {
  id: string;
  code: string;
  name: string;
  location: string;
  floor: string;
  capacity: number;
  hasDisplay: boolean;
  hasVideo: boolean;
  hasWhiteboard: boolean;
};

type Booking = {
  id: string;
  title: string;
  agenda: string | null;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  status: BookingStatus;
  channel: string;
  meetingMode: MeetingMode;
  meetingLink: string | null;
  summaryText: string | null;
  releaseReason: string | null;
  room: Room;
  bookedBy: User;
};

type RoomBoardItem = Room & {
  isAvailableNow: boolean;
  activeBooking: Booking | null;
};

type DashboardPayload = {
  now: string;
  user: User;
  users: User[];
  roomBoard: RoomBoardItem[];
  todayBookings: Booking[];
  stats: {
    totalRooms: number;
    activeMeetings: number;
    availableRooms: number;
    todayBookings: number;
  };
};

type AvailabilityRoom = Room & {
  isAvailable: boolean;
  conflict: {
    title: string;
    startTime: string;
    endTime: string;
    bookedBy: string;
  } | null;
};

type AnalyticsPayload = {
  kpis: {
    totalBookings: number;
    checkedInRate: number;
    noShowRate: number;
    averageDurationMinutes: number;
  };
  statusBreakdown: Array<{ status: BookingStatus; count: number }>;
  roomUtilization: Array<{ roomName: string; utilization: number }>;
};

type Reminder = {
  booking: Booking;
  minutesToStart: number;
};

type Alert = {
  kind: "success" | "error";
  message: string;
};

type ChatMessage = {
  role: "user" | "bot";
  text: string;
  confidence?: number;
  suggestions?: string[];
};

type BookingForm = {
  title: string;
  agenda: string;
  date: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  meetingMode: MeetingMode;
  selectedRoomId: string;
};

type AppointmentView = "UPCOMING" | "PAST" | "ALL";

type ChatBookingStep =
  | "title"
  | "agenda"
  | "date"
  | "startTime"
  | "endTime"
  | "attendeeCount"
  | "meetingMode"
  | "roomSelection"
  | "confirm";

type ChatBookingDraft = {
  title: string;
  agenda: string;
  date: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  meetingMode: MeetingMode;
  rooms: AvailabilityRoom[];
  selectedRoomId: string;
};

type ChatBookingFlow = {
  step: ChatBookingStep;
  draft: Partial<ChatBookingDraft>;
};

type BookingRequestInput = {
  title: string;
  agenda: string;
  date: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  meetingMode: MeetingMode;
  roomId: string;
};

type DashboardSection = "appointments" | "hall-board" | "users" | "assistant";

type UserAccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type UserAccessRequest = {
  id: string;
  name: string;
  email: string;
  department: string;
  status: UserAccessRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateUserForm = {
  name: string;
  email: string;
  department: string;
  role: Role;
  password: string;
};

type ActivityItem = {
  id: string;
  message: string;
  at: string;
};

type UserPreferences = {
  defaultMeetingMode: MeetingMode;
  compactTable: boolean;
  autoOpenAssistant: boolean;
};

type HallPreview = {
  roomName: string;
  imageSrc: string;
  note: string;
};

type SpeechRecognitionResultLike = {
  0: { transcript: string };
  isFinal: boolean;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const STATUS_COLORS: Record<BookingStatus, string> = {
  BOOKED: "bg-amber-100 text-amber-700",
  CHECKED_IN: "bg-emerald-100 text-emerald-700",
  RELEASED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

const PIE_COLORS = ["#5b48f6", "#00a98f", "#2f6ce5", "#ef4444"];

const SIDEBAR_ITEMS = [
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "hall-board", label: "Live Hall Board", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "assistant", label: "AI Assistant", icon: Sparkles },
] as const;

const HALL_PREVIEWS: Record<string, HallPreview> = {
  "Indraprastha Darbar": {
    roomName: "Indraprastha Darbar",
    imageSrc: "/hall-previews/indraprastha-darbar.png",
    note: "Premium 6-seater boardroom with daylight windows and collaborative layout.",
  },
  "Rajwada Chamber": {
    roomName: "Rajwada Chamber",
    imageSrc: "/hall-previews/rajwada-chamber.jpg",
    note: "Contemporary 8-seater meeting room for focused project discussions.",
  },
  "Maharaja Sabha": {
    roomName: "Maharaja Sabha",
    imageSrc: "/hall-previews/maharaja-sabha.jpg",
    note: "Executive 10-seater hall for weekly planning and client reviews.",
  },
  "Kohinoor Kendra": {
    roomName: "Kohinoor Kendra",
    imageSrc: "/hall-previews/kohinoor-kendra.jpg",
    note: "Collaborative 12-seater U-shaped room designed for workshops.",
  },
  "Surya Mahal": {
    roomName: "Surya Mahal",
    imageSrc: "/hall-previews/surya-mahal.jpg",
    note: "Grand 20-seater conference hall for large leadership meetings.",
  },
};

const CHAT_COMMAND_HINTS = [
  { label: "Free Halls", command: "/availability now" },
  { label: "My Schedule", command: "/schedule" },
  { label: "Reminders", command: "/reminders" },
  { label: "Book Meeting", command: "/book" },
  { label: "Analytics", command: "/analytics" },
];

const CHAT_THINKING_STAGES = [
  "Thinking...",
  "Analyzing calendar and halls...",
  "Validating availability and constraints...",
  "Preparing best response...",
];

function buildIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function roundHour(date: Date): string {
  const value = new Date(date);
  value.setMinutes(0, 0, 0);
  value.setHours(value.getHours() + 1);
  return format(value, "HH:mm");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s:/-]/g, " ").replace(/\s+/g, " ").trim();
}

function validDateParts(year: number, month: number, day: number): string | null {
  const value = new Date(year, month - 1, day);

  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day
  ) {
    return null;
  }

  return format(value, "yyyy-MM-dd");
}

function parseDateInput(input: string): string | null {
  const text = normalizeText(input);
  const today = new Date();

  if (text === "today") {
    return format(today, "yyyy-MM-dd");
  }

  if (text === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return format(tomorrow, "yyyy-MM-dd");
  }

  const isoMatch = input.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return validDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = input.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (slashMatch) {
    return validDateParts(Number(slashMatch[3]), Number(slashMatch[2]), Number(slashMatch[1]));
  }

  return null;
}

function parseTimeInput(input: string): string | null {
  const match = input
    .toLowerCase()
    .trim()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (meridiem === "pm" && hour !== 12) {
      hour += 12;
    }

    if (meridiem === "am" && hour === 12) {
      hour = 0;
    }
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseAttendeeCount(input: string): number | null {
  const match = input.match(/\b(\d{1,3})\b/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 1 || value > 200) {
    return null;
  }

  return value;
}

function parseMeetingModeInput(input: string): MeetingMode | null {
  const text = normalizeText(input);

  if (text.includes("zoom")) {
    return "ZOOM";
  }

  if (text.includes("meet") || text.includes("google")) {
    return "GOOGLE_MEET";
  }

  if (text.includes("offline") || text.includes("room") || text.includes("in person")) {
    return "OFFLINE";
  }

  return null;
}

function isPositiveConfirmation(input: string): boolean {
  return /\b(yes|confirm|book|go ahead|proceed|ok|okay|sure|done)\b/i.test(input);
}

function formatMeetingMode(mode: MeetingMode) {
  if (mode === "GOOGLE_MEET") {
    return "Google Meet";
  }

  if (mode === "ZOOM") {
    return "Zoom";
  }

  return "Offline";
}

function formatDuration(startIso: string, endIso: string) {
  return `${format(new Date(startIso), "hh:mm a")} - ${format(new Date(endIso), "hh:mm a")}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload as T;
}

type PortalMode = "admin" | "user";

export default function BookingApp({ mode }: { mode: PortalMode }) {
  const now = new Date();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRoom[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "bot",
      text: "Hello, I am your meeting assistant. Ask me anything or say 'book a meeting for me' and I will collect details and create it for you.",
      confidence: 0.95,
      suggestions: [
        "Book a meeting for me",
        "Which halls are free now?",
        "Show my upcoming reminders",
      ],
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isVoiceInputSupported, setIsVoiceInputSupported] = useState(false);
  const [isVoiceOutputSupported, setIsVoiceOutputSupported] = useState(false);
  const [voiceInputHint, setVoiceInputHint] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceReplyEnabled, setIsVoiceReplyEnabled] = useState(true);
  const [chatFlow, setChatFlow] = useState<ChatBookingFlow | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [appointmentView, setAppointmentView] = useState<AppointmentView>("UPCOMING");
  const [activeSection, setActiveSection] = useState<DashboardSection>("appointments");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userDirectory, setUserDirectory] = useState<User[]>([]);
  const [accessRequests, setAccessRequests] = useState<UserAccessRequest[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userActionUserId, setUserActionUserId] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [hallSearch, setHallSearch] = useState("");
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [activePreviewHall, setActivePreviewHall] = useState<HallPreview | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({
    defaultMeetingMode: "OFFLINE",
    compactTable: false,
    autoOpenAssistant: false,
  });
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>({
    name: "",
    email: "",
    department: "",
    role: "EMPLOYEE",
    password: "",
  });

  const bookingFormRef = useRef<HTMLFormElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const askBotRef = useRef<(prompt?: string) => Promise<void>>(async () => {});
  const lastSpokenBotIndexRef = useRef(0);

  const [form, setForm] = useState<BookingForm>({
    title: "",
    agenda: "",
    date: format(now, "yyyy-MM-dd"),
    startTime: roundHour(now),
    endTime: format(new Date(now.getTime() + 2 * 60 * 60 * 1000), "HH:mm"),
    attendeeCount: 4,
    meetingMode: "OFFLINE",
    selectedRoomId: "",
  });

  const isAdmin = me?.role === "ADMIN";

  const showError = useCallback((message: string) => {
    setAlert({ kind: "error", message });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setAlert({ kind: "success", message });
  }, []);

  const pushBotMessage = useCallback(
    (text: string, confidence = 0.92, suggestions?: string[]) => {
      setChat((previous) => [
        ...previous,
        {
          role: "bot",
          text,
          confidence,
          suggestions,
        },
      ]);
    },
    [],
  );

  const addActivity = useCallback((message: string) => {
    setActivityLog((previous) => [
      { id: crypto.randomUUID(), message, at: new Date().toISOString() },
      ...previous,
    ].slice(0, 25));
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);

    try {
      const authPayload = await parseJson<{ authenticated: boolean; user: AuthUser }>(
        await fetch("/api/auth/me", { cache: "no-store" }),
      );

      if (!authPayload.authenticated) {
        window.location.href = mode === "admin" ? "/admin/login" : "/user/login";
        return;
      }

      setMe(authPayload.user);

      const [dashboardPayload, bookingsPayload, remindersPayload] = await Promise.all([
        parseJson<DashboardPayload>(await fetch("/api/dashboard", { cache: "no-store" })),
        parseJson<{ bookings: Booking[] }>(await fetch("/api/bookings", { cache: "no-store" })),
        parseJson<{ reminders: Reminder[] }>(await fetch("/api/reminders", { cache: "no-store" })),
      ]);

      setDashboard(dashboardPayload);
      setBookings(bookingsPayload.bookings);
      setReminders(remindersPayload.reminders);
      setUserDirectory(dashboardPayload.users);

      if (authPayload.user.role === "ADMIN") {
        const [analyticsPayload, usersPayload, requestsPayload] = await Promise.all([
          parseJson<{ analytics: AnalyticsPayload }>(await fetch("/api/analytics", { cache: "no-store" })),
          parseJson<{ users: User[] }>(await fetch("/api/users", { cache: "no-store" })),
          parseJson<{ requests: UserAccessRequest[] }>(
            await fetch("/api/user-requests", { cache: "no-store" }),
          ),
        ]);
        setAnalytics(analyticsPayload.analytics);
        setUserDirectory(usersPayload.users);
        setAccessRequests(requestsPayload.requests);
      } else {
        setAnalytics(null);
        setAccessRequests([]);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [mode, showError]);

  useEffect(() => {
    loadAll().catch(() => {
      showError("Could not load dashboard");
    });
  }, [loadAll, showError]);

  useEffect(() => {
    const raw = window.localStorage.getItem("booking_preferences_v1");
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      setPreferences((previous) => ({
        ...previous,
        ...parsed,
      }));
    } catch {
      // Ignore malformed local settings and keep defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("booking_preferences_v1", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!preferences.autoOpenAssistant) {
      return;
    }

    setIsChatOpen(true);
  }, [preferences.autoOpenAssistant]);

  useEffect(() => {
    setForm((previous) => ({
      ...previous,
      meetingMode: preferences.defaultMeetingMode,
    }));
  }, [preferences.defaultMeetingMode]);

  useEffect(() => {
    if (activeSection === "assistant") {
      setIsChatOpen(true);
    }
  }, [activeSection]);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }

    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat, isBotThinking, isChatOpen]);

  useEffect(() => {
    const browserWindow = window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const SpeechRecognitionApi =
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    const hasSpeechSynthesis = "speechSynthesis" in browserWindow;
    const isLocalhost =
      browserWindow.location.hostname === "localhost" ||
      browserWindow.location.hostname === "127.0.0.1" ||
      browserWindow.location.hostname === "::1";
    const isSecureForMic = browserWindow.isSecureContext || isLocalhost;

    setIsVoiceOutputSupported(hasSpeechSynthesis);
    setIsVoiceInputSupported(Boolean(SpeechRecognitionApi && isSecureForMic));

    if (!SpeechRecognitionApi) {
      setVoiceInputHint("Voice input requires a supported browser (Chrome or Edge recommended).");
    } else if (!isSecureForMic) {
      setVoiceInputHint("Voice input needs HTTPS (or localhost). Open this app on secure URL.");
    } else {
      setVoiceInputHint(null);
    }

    if (!SpeechRecognitionApi) {
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";

        if (result?.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      const preview = `${finalText} ${interimText}`.trim();
      if (preview) {
        setChatInput(preview);
      }

      const finalTranscript = finalText.trim();
      if (finalTranscript) {
        setChatInput("");
        askBotRef.current(finalTranscript).catch(() => {
          // handled inside askBot
        });
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      showError(
        "Microphone access blocked. Allow microphone in browser Site settings and use HTTPS/localhost.",
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [showError]);

  const availableNow = useMemo(() => {
    return dashboard?.roomBoard.filter((room) => room.isAvailableNow).length ?? 0;
  }, [dashboard]);

  const occupancyRate = useMemo(() => {
    if (!dashboard?.stats.totalRooms) {
      return 0;
    }

    return Math.round((dashboard.stats.activeMeetings / dashboard.stats.totalRooms) * 100);
  }, [dashboard]);

  const lastBotMessage = useMemo(
    () => [...chat].reverse().find((message) => message.role === "bot"),
    [chat],
  );

  const aiRoomRecommendation = useMemo(() => {
    const candidates =
      dashboard?.roomBoard.filter((room) => room.isAvailableNow).map((room) => ({
        room,
        score:
          room.capacity * 0.2 +
          (room.hasVideo ? 12 : 0) +
          (room.hasWhiteboard ? 6 : 0) +
          (room.hasDisplay ? 4 : 0),
      })) ?? [];

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.room ?? null;
  }, [dashboard]);

  const visibleBookings = useMemo(() => {
    const nowTs = Date.now();
    const normalizedSearch = normalizeText(bookingSearch);

    const filtered = bookings.filter((booking) => {
      const endTs = new Date(booking.endTime).getTime();

      if (appointmentView === "UPCOMING" && endTs < nowTs) {
        return false;
      }

      if (appointmentView === "PAST" && endTs >= nowTs) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = normalizeText(
        `${booking.title} ${booking.room.name} ${booking.bookedBy.name} ${booking.bookedBy.email} ${booking.status}`,
      );

      return haystack.includes(normalizedSearch);
    });

    return filtered.sort((left, right) => {
      const leftTs = new Date(left.startTime).getTime();
      const rightTs = new Date(right.startTime).getTime();

      if (appointmentView === "PAST") {
        return rightTs - leftTs;
      }

      return leftTs - rightTs;
    });
  }, [appointmentView, bookingSearch, bookings]);

  const groupedBookings = useMemo(() => {
    const grouped = new Map<string, Booking[]>();

    visibleBookings.forEach((booking) => {
      const dateKey = format(new Date(booking.startTime), "yyyy-MM-dd");
      const list = grouped.get(dateKey);

      if (list) {
        list.push(booking);
      } else {
        grouped.set(dateKey, [booking]);
      }
    });

    return Array.from(grouped.entries()).map(([dateKey, items]) => ({
      dateKey,
      items,
    }));
  }, [visibleBookings]);

  const filteredRoomBoard = useMemo(() => {
    const normalizedSearch = normalizeText(hallSearch);
    const rooms = dashboard?.roomBoard ?? [];

    if (!normalizedSearch) {
      return rooms;
    }

    return rooms.filter((room) =>
      normalizeText(`${room.name} ${room.floor} ${room.location}`).includes(normalizedSearch),
    );
  }, [dashboard?.roomBoard, hallSearch]);

  const pendingAccessRequests = useMemo(
    () => accessRequests.filter((request) => request.status === "PENDING"),
    [accessRequests],
  );

  const notificationItems = useMemo(() => {
    const reminderItems = reminders.map((item) => ({
      id: `reminder-${item.booking.id}`,
      text: `${item.booking.title} starts in ${item.minutesToStart} min`,
      at: item.booking.startTime,
    }));

    const requestItems = pendingAccessRequests.map((request) => ({
      id: `request-${request.id}`,
      text: `New user request: ${request.name} (${request.email})`,
      at: request.createdAt,
    }));

    return [...requestItems, ...reminderItems]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, 8);
  }, [pendingAccessRequests, reminders]);

  const createBookingRequest = useCallback(async (input: BookingRequestInput) => {
    const payload = await parseJson<{ message: string }>(
      await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          agenda: input.agenda,
          roomId: input.roomId,
          startTime: buildIso(input.date, input.startTime),
          endTime: buildIso(input.date, input.endTime),
          attendeeCount: input.attendeeCount,
          channel: BOOKING_CHANNELS[0],
          meetingMode: input.meetingMode,
          recurrence: "NONE",
          recurrenceCount: 1,
        }),
      }),
    );

    return payload.message;
  }, []);

  const searchAvailability = useCallback(async () => {
    const start = buildIso(form.date, form.startTime);
    const end = buildIso(form.date, form.endTime);

    if (new Date(end) <= new Date(start)) {
      showError("End time must be after start time");
      return;
    }

    setIsSearching(true);

    try {
      const query = new URLSearchParams({
        start,
        end,
        capacity: String(form.attendeeCount),
        needsDisplay: "true",
        needsVideo: String(form.meetingMode !== "OFFLINE"),
      });

      const payload = await parseJson<{ rooms: AvailabilityRoom[] }>(
        await fetch(`/api/availability?${query.toString()}`),
      );

      setAvailability(payload.rooms);
      const first = payload.rooms.find((room) => room.isAvailable);
      setForm((previous) => ({ ...previous, selectedRoomId: first?.id ?? "" }));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to check availability");
    } finally {
      setIsSearching(false);
    }
  }, [form, showError]);

  const fetchAvailableRoomsForDraft = useCallback(
    async (draft: {
      date: string;
      startTime: string;
      endTime: string;
      attendeeCount: number;
      meetingMode: MeetingMode;
    }) => {
      const query = new URLSearchParams({
        start: buildIso(draft.date, draft.startTime),
        end: buildIso(draft.date, draft.endTime),
        capacity: String(draft.attendeeCount),
        needsDisplay: "true",
        needsVideo: String(draft.meetingMode !== "OFFLINE"),
      });

      const payload = await parseJson<{ rooms: AvailabilityRoom[] }>(
        await fetch(`/api/availability?${query.toString()}`),
      );

      return payload.rooms.filter((room) => room.isAvailable);
    },
    [],
  );

  const submitBooking = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!form.selectedRoomId) {
        showError("Select an available hall first");
        return;
      }

      setIsBooking(true);

      try {
        const message = await createBookingRequest({
          title: form.title,
          agenda: form.agenda,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          attendeeCount: form.attendeeCount,
          meetingMode: form.meetingMode,
          roomId: form.selectedRoomId,
        });

        showSuccess(message);
        addActivity(`Created booking "${form.title}" for ${form.date} ${form.startTime}`);
        setForm((previous) => ({
          ...previous,
          title: "",
          agenda: "",
          selectedRoomId: "",
          meetingMode: preferences.defaultMeetingMode,
        }));
        setAvailability([]);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Booking failed");
      } finally {
        setIsBooking(false);
      }
    },
    [addActivity, createBookingRequest, form, loadAll, preferences.defaultMeetingMode, showError, showSuccess],
  );

  const runBookingAction = useCallback(
    async (bookingId: string, action: "check-in" | "release" | "cancel") => {
      try {
        const payload = await parseJson<{ message: string }>(
          await fetch(`/api/bookings/${bookingId}/${action}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }),
        );

        showSuccess(payload.message);
        addActivity(`Booking action executed: ${action.toUpperCase()} (${bookingId})`);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Action failed");
      }
    },
    [addActivity, loadAll, showError, showSuccess],
  );

  const generateSummary = useCallback(
    async (bookingId: string) => {
      try {
        const payload = await parseJson<{ message: string }>(
          await fetch(`/api/bookings/${bookingId}/summary`, { method: "POST" }),
        );

        showSuccess(payload.message);
        addActivity(`Generated summary for booking ${bookingId}`);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Summary failed");
      }
    },
    [addActivity, loadAll, showError, showSuccess],
  );

  const copyMeetingLink = useCallback(
    async (meetingLink: string | null) => {
      if (!meetingLink) {
        return;
      }

      try {
        await navigator.clipboard.writeText(meetingLink);
        showSuccess("Meeting link copied");
        addActivity("Copied meeting link");
      } catch {
        showError("Clipboard access denied in this browser");
      }
    },
    [addActivity, showError, showSuccess],
  );

  const exportUsersCsv = useCallback(() => {
    if (userDirectory.length === 0) {
      showError("No users available to export");
      return;
    }

    const header = ["Name", "Email", "Role", "Department", "Status", "Blocked Reason"];
    const rows = userDirectory.map((user) => [
      user.name,
      user.email,
      user.role,
      user.department,
      user.isBlocked ? "BLOCKED" : "ACTIVE",
      user.blockedReason ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const escaped = value.replaceAll('"', '""');
            return `"${escaped}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `users-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showSuccess("User directory CSV exported");
    addActivity("Exported user directory CSV");
  }, [addActivity, showError, showSuccess, userDirectory]);

  const createUser = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    setIsCreatingUser(true);

    try {
      const payload = await parseJson<{ message: string; user: User }>(
        await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createUserForm),
        }),
      );

      showSuccess(payload.message);
      addActivity(`Created user ${payload.user.email}`);
      setCreateUserForm({
        name: "",
        email: "",
        department: "",
        role: "EMPLOYEE",
        password: "",
      });
      await loadAll();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to create user");
    } finally {
      setIsCreatingUser(false);
    }
  }, [addActivity, createUserForm, isAdmin, loadAll, showError, showSuccess]);

  const blockUser = useCallback(
    async (user: User) => {
      if (!isAdmin) {
        return;
      }

      const reason = window.prompt(`Enter blocking reason for ${user.email}:`, user.blockedReason ?? "");
      if (!reason) {
        return;
      }

      setUserActionUserId(user.id);
      try {
        const payload = await parseJson<{ message: string }>(
          await fetch(`/api/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "BLOCK", reason }),
          }),
        );
        showSuccess(payload.message);
        addActivity(`Blocked user ${user.email}`);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to block user");
      } finally {
        setUserActionUserId(null);
      }
    },
    [addActivity, isAdmin, loadAll, showError, showSuccess],
  );

  const unblockUser = useCallback(
    async (user: User) => {
      if (!isAdmin) {
        return;
      }

      setUserActionUserId(user.id);
      try {
        const payload = await parseJson<{ message: string }>(
          await fetch(`/api/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "UNBLOCK" }),
          }),
        );
        showSuccess(payload.message);
        addActivity(`Unblocked user ${user.email}`);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to unblock user");
      } finally {
        setUserActionUserId(null);
      }
    },
    [addActivity, isAdmin, loadAll, showError, showSuccess],
  );

  const removeUser = useCallback(
    async (user: User) => {
      if (!isAdmin) {
        return;
      }

      const shouldRemove = window.confirm(
        `Remove ${user.email} permanently? This will delete the account if no booking history exists.`,
      );
      if (!shouldRemove) {
        return;
      }

      setUserActionUserId(user.id);
      try {
        const payload = await parseJson<{ message: string }>(
          await fetch(`/api/users/${user.id}`, {
            method: "DELETE",
          }),
        );
        showSuccess(payload.message);
        addActivity(`Removed user ${user.email}`);
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to remove user");
      } finally {
        setUserActionUserId(null);
      }
    },
    [addActivity, isAdmin, loadAll, showError, showSuccess],
  );

  const reviewAccessRequest = useCallback(
    async (requestId: string, decision: "APPROVE" | "REJECT") => {
      if (!isAdmin) {
        return;
      }

      setReviewingRequestId(requestId);

      try {
        const payload = await parseJson<{ message: string; request: UserAccessRequest }>(
          await fetch(`/api/user-requests/${requestId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision, role: "EMPLOYEE" }),
          }),
        );

        showSuccess(payload.message);
        addActivity(
          `${decision === "APPROVE" ? "Approved" : "Rejected"} access request for ${payload.request.email}`,
        );
        await loadAll();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to review request");
      } finally {
        setReviewingRequestId(null);
      }
    },
    [addActivity, isAdmin, loadAll, showError, showSuccess],
  );

  const clearChatHistory = useCallback(() => {
    setChat([
      {
        role: "bot",
        text: "Chat reset complete. Ask me for availability, schedule, reminders, or say 'book a meeting for me'.",
        confidence: 0.96,
        suggestions: ["Book a meeting for me", "Show my schedule", "Find free halls now"],
      },
    ]);
    setChatFlow(null);
    addActivity("Chat history cleared");
  }, [addActivity]);

  const openHallPreview = useCallback(
    (roomName: string) => {
      const preview = HALL_PREVIEWS[roomName];
      if (!preview) {
        showError(`Preview image is not configured yet for ${roomName}.`);
        return;
      }

      setActivePreviewHall(preview);
    },
    [showError],
  );

  const handleChatBookingFlow = useCallback(
    async (userText: string): Promise<boolean> => {
      const normalized = normalizeText(userText);
      const userWantsBooking =
        /(?:book|schedule|create|set up).*(?:meeting|appointment|hall|room)/i.test(userText) ||
        normalized.includes("book for me") ||
        normalized.includes("new appointment");

      if (!chatFlow) {
        if (!userWantsBooking) {
          return false;
        }

        setChatFlow({
          step: "title",
          draft: {
            agenda: "",
            attendeeCount: 4,
            meetingMode: "OFFLINE",
          },
        });

        pushBotMessage(
          "Perfect. I will book it end-to-end. Step 1/8: what should be the meeting title?",
          0.96,
          ["Weekly Sales Review", "Project Kickoff", "Client Demo"],
        );

        return true;
      }

      if (/(?:cancel|stop|exit|quit)/i.test(normalized)) {
        setChatFlow(null);
        pushBotMessage(
          "Booking assistant closed. Say 'book a meeting for me' whenever you want to start again.",
          0.91,
          ["Book a meeting for me"],
        );
        return true;
      }

      const flow = chatFlow;

      if (flow.step === "title") {
        if (userText.trim().length < 3) {
          pushBotMessage("Please share a clearer title (minimum 3 characters).");
          return true;
        }

        setChatFlow({
          step: "agenda",
          draft: { ...flow.draft, title: userText.trim() },
        });

        pushBotMessage(
          "Step 2/8: share agenda (or type 'skip').",
          0.95,
          ["skip", "Q4 planning and blockers"],
        );

        return true;
      }

      if (flow.step === "agenda") {
        const agenda = /^(skip|none|no)$/i.test(normalized) ? "" : userText.trim();

        setChatFlow({
          step: "date",
          draft: { ...flow.draft, agenda },
        });

        pushBotMessage(
          "Step 3/8: date? Use 'today', 'tomorrow', or YYYY-MM-DD.",
          0.95,
          ["today", "tomorrow", format(new Date(), "yyyy-MM-dd")],
        );

        return true;
      }

      if (flow.step === "date") {
        const parsedDate = parseDateInput(userText);
        if (!parsedDate) {
          pushBotMessage("Please share date as 'today', 'tomorrow', or YYYY-MM-DD.");
          return true;
        }

        setChatFlow({
          step: "startTime",
          draft: { ...flow.draft, date: parsedDate },
        });

        pushBotMessage(
          "Step 4/8: start time? Example: 10:30 or 10:30 am.",
          0.95,
          ["10:30", "14:00"],
        );

        return true;
      }

      if (flow.step === "startTime") {
        const parsedStartTime = parseTimeInput(userText);
        if (!parsedStartTime) {
          pushBotMessage("Please enter a valid start time, for example '10:30' or '2:15 pm'.");
          return true;
        }

        setChatFlow({
          step: "endTime",
          draft: { ...flow.draft, startTime: parsedStartTime },
        });

        pushBotMessage(
          "Step 5/8: end time?",
          0.95,
          ["11:30", "15:00"],
        );

        return true;
      }

      if (flow.step === "endTime") {
        const parsedEndTime = parseTimeInput(userText);
        const date = flow.draft.date;
        const startTime = flow.draft.startTime;

        if (!parsedEndTime || !date || !startTime) {
          pushBotMessage("Please enter a valid end time.");
          return true;
        }

        const startDateTime = new Date(`${date}T${startTime}:00`);
        const endDateTime = new Date(`${date}T${parsedEndTime}:00`);

        if (endDateTime <= startDateTime) {
          pushBotMessage("End time must be later than start time. Please share end time again.");
          return true;
        }

        setChatFlow({
          step: "attendeeCount",
          draft: { ...flow.draft, endTime: parsedEndTime },
        });

        pushBotMessage(
          "Step 6/8: how many attendees?",
          0.95,
          ["4", "8", "12"],
        );

        return true;
      }

      if (flow.step === "attendeeCount") {
        const parsedCount = parseAttendeeCount(userText);
        if (!parsedCount) {
          pushBotMessage("Please send attendee count between 1 and 200.");
          return true;
        }

        setChatFlow({
          step: "meetingMode",
          draft: { ...flow.draft, attendeeCount: parsedCount },
        });

        pushBotMessage(
          "Step 7/8: meeting mode? Choose Offline, Google Meet, or Zoom.",
          0.95,
          ["Offline", "Google Meet", "Zoom"],
        );

        return true;
      }

      if (flow.step === "meetingMode") {
        const meetingMode = parseMeetingModeInput(userText);

        if (!meetingMode) {
          pushBotMessage("Please choose one mode: Offline, Google Meet, or Zoom.");
          return true;
        }

        const draft = {
          ...flow.draft,
          meetingMode,
        } as ChatBookingDraft;

        if (!draft.date || !draft.startTime || !draft.endTime || !draft.attendeeCount) {
          pushBotMessage("Some details are missing. Please restart by typing 'book a meeting for me'.");
          setChatFlow(null);
          return true;
        }

        try {
          const rooms = await fetchAvailableRoomsForDraft({
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            attendeeCount: draft.attendeeCount,
            meetingMode,
          });

          if (rooms.length === 0) {
            setChatFlow({
              step: "startTime",
              draft,
            });

            pushBotMessage(
              "No available halls for that slot. Share a new start time and I will retry.",
              0.9,
              [roundHour(new Date()), "15:00"],
            );

            return true;
          }

          const roomMessage = rooms
            .slice(0, 5)
            .map((room, index) => `${index + 1}. ${room.name} (${room.floor}, cap ${room.capacity})`)
            .join("\n");

          setChatFlow({
            step: "roomSelection",
            draft: {
              ...draft,
              rooms,
            },
          });

          pushBotMessage(
            `Step 8/8: choose a hall by number or name:\n${roomMessage}`,
            0.94,
            rooms.slice(0, 3).map((room) => room.name),
          );
        } catch (error) {
          pushBotMessage(error instanceof Error ? error.message : "Could not fetch hall availability");
        }

        return true;
      }

      if (flow.step === "roomSelection") {
        const rooms = flow.draft.rooms ?? [];

        if (rooms.length === 0) {
          setChatFlow({ step: "startTime", draft: flow.draft });
          pushBotMessage("No room options are available now. Please share a new start time.");
          return true;
        }

        const numberMatch = userText.match(/\b(\d{1,2})\b/);
        const byIndex = numberMatch ? rooms[Number(numberMatch[1]) - 1] : null;
        const byName = rooms.find((room) => normalizeText(userText).includes(normalizeText(room.name)));
        const selectedRoom = byIndex ?? byName;

        if (!selectedRoom) {
          pushBotMessage("Please choose a valid hall number or hall name from the list.");
          return true;
        }

        const draft = {
          ...flow.draft,
          selectedRoomId: selectedRoom.id,
        } as ChatBookingDraft;

        setChatFlow({
          step: "confirm",
          draft,
        });

        pushBotMessage(
          `Please confirm booking:\nTitle: ${draft.title}\nHall: ${selectedRoom.name}\nDate: ${draft.date}\nTime: ${draft.startTime} - ${draft.endTime}\nAttendees: ${draft.attendeeCount}\nMode: ${formatMeetingMode(draft.meetingMode)}\nReply 'yes' to book or 'change time' / 'change room'.`,
          0.96,
          ["yes", "change room", "change time"],
        );

        return true;
      }

      if (flow.step === "confirm") {
        if (/change time/i.test(userText)) {
          setChatFlow({
            step: "startTime",
            draft: flow.draft,
          });
          pushBotMessage("Share the new start time.");
          return true;
        }

        if (/change room/i.test(userText)) {
          setChatFlow({
            step: "roomSelection",
            draft: flow.draft,
          });
          pushBotMessage("Sure, pick another hall by number or name.");
          return true;
        }

        if (!isPositiveConfirmation(userText)) {
          pushBotMessage("Reply 'yes' to confirm, or type 'change time', 'change room', or 'cancel'.");
          return true;
        }

        const draft = flow.draft as ChatBookingDraft;

        if (
          !draft.title ||
          !draft.date ||
          !draft.startTime ||
          !draft.endTime ||
          !draft.attendeeCount ||
          !draft.meetingMode ||
          !draft.selectedRoomId
        ) {
          setChatFlow(null);
          pushBotMessage("Some details are missing. Please start again with 'book a meeting for me'.");
          return true;
        }

        try {
          const message = await createBookingRequest({
            title: draft.title,
            agenda: draft.agenda ?? "",
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            attendeeCount: draft.attendeeCount,
            meetingMode: draft.meetingMode,
            roomId: draft.selectedRoomId,
          });

          setForm((previous) => ({
            ...previous,
            title: draft.title,
            agenda: draft.agenda,
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            attendeeCount: draft.attendeeCount,
            meetingMode: draft.meetingMode,
            selectedRoomId: draft.selectedRoomId,
          }));

          showSuccess(message);
          addActivity(`AI assistant booked "${draft.title}" on ${draft.date} ${draft.startTime}`);
          setChatFlow(null);
          await loadAll();

          pushBotMessage(
            "Done. Your meeting is booked successfully. You can ask for reminders or open it from Appointments.",
            0.97,
            ["Show my upcoming reminders", "Show my schedule"],
          );
        } catch (error) {
          pushBotMessage(error instanceof Error ? error.message : "Could not complete booking", 0.7);
        }

        return true;
      }

      return false;
    },
    [addActivity, chatFlow, createBookingRequest, fetchAvailableRoomsForDraft, loadAll, pushBotMessage, showSuccess],
  );

  const askBot = useCallback(
    async (prompt?: string) => {
      const inputText = (prompt ?? chatInput).trim();

      if (!inputText) {
        return;
      }

      const userText = inputText;
      setChat((previous) => [...previous, { role: "user", text: userText }]);
      setChatInput("");
      setIsBotThinking(true);

      try {
        const bookingHandled = await handleChatBookingFlow(userText);

        if (bookingHandled) {
          return;
        }

        const history = chat.slice(-12).map((item) => ({
          role: item.role,
          text: item.text,
        }));

        const payload = await parseJson<{
          answer: string;
          confidence: number;
          suggestions: string[];
        }>(
          await fetch("/api/chatbot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userText, history }),
          }),
        );

        setChat((previous) => [
          ...previous,
          {
            role: "bot",
            text: payload.answer,
            confidence: payload.confidence,
            suggestions: payload.suggestions,
          },
        ]);
      } catch (error) {
        setChat((previous) => [
          ...previous,
          {
            role: "bot",
            text: error instanceof Error ? error.message : "Chatbot error",
            confidence: 0.4,
            suggestions: ["Book a meeting for me", "Which halls are free now?"],
          },
        ]);
      } finally {
        setIsBotThinking(false);
      }
    },
    [chat, chatInput, handleChatBookingFlow],
  );

  useEffect(() => {
    askBotRef.current = askBot;
  }, [askBot]);

  useEffect(() => {
    if (!isVoiceOutputSupported || !isVoiceReplyEnabled) {
      return;
    }

    const latestBotIndex = [...chat]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((entry) => entry.message.role === "bot")?.index;

    if (latestBotIndex == null || latestBotIndex <= lastSpokenBotIndexRef.current) {
      return;
    }

    const text = chat[latestBotIndex]?.text?.replace(/\s+/g, " ").trim();
    if (!text || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);

    lastSpokenBotIndexRef.current = latestBotIndex;
  }, [chat, isVoiceOutputSupported, isVoiceReplyEnabled]);

  const startVoiceCapture = useCallback(() => {
    if (!isVoiceInputSupported || !recognitionRef.current) {
      showError(
        voiceInputHint ??
          "Voice input is not available. Use HTTPS/localhost and allow microphone access.",
      );
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      showError("Could not start voice assistant. Please try again.");
    }
  }, [isVoiceInputSupported, showError, voiceInputHint]);

  const stopVoiceCapture = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = mode === "admin" ? "/admin/login" : "/user/login";
  }, [mode]);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl p-8 text-sm text-slate-600">
        Loading dashboard...
      </main>
    );
  }

  return (
    <main className="premium-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1450px]">
        <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_26px_80px_-45px_rgba(26,24,57,0.45)] backdrop-blur">
          <div className="grid min-h-[84vh] lg:grid-cols-[240px_1fr]">
            <aside className="border-b border-white/60 bg-[linear-gradient(180deg,#f8f7ff_0%,#f2f7ff_100%)] p-4 lg:border-r lg:border-b-0">
              <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-[0_14px_34px_-28px_rgba(16,24,40,0.5)]">
                <Image
                  src="/orientbell-logo.svg"
                  alt="Orientbell Tiles"
                  width={150}
                  height={44}
                  className="h-8 w-auto"
                  priority
                />
              </div>

              <nav className="mt-4 space-y-1">
                {SIDEBAR_ITEMS.map((item) => {
                  const ItemIcon = item.icon;
                  const active = item.id === activeSection;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
                        active
                          ? "bg-[#5444e8] text-white shadow-[0_14px_24px_-20px_rgba(84,68,232,0.9)]"
                          : "bg-white/75 text-slate-700 hover:bg-white"
                      }`}
                    >
                      <ItemIcon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 rounded-2xl border border-[#dcd9ff] bg-white/90 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">AI Concierge</p>
                <p className="mt-1">Popup assistant can now collect data and create bookings automatically.</p>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#5444e8] px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Open Assistant
                </button>
              </div>
            </aside>

            <div className="flex min-h-[84vh] flex-col">
              <header className="border-b border-[#ececff] px-4 py-4 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 rounded-full bg-[#ece9ff] px-2.5 py-1 text-xs font-semibold text-[#5041de]">
                      <Building2 className="h-3.5 w-3.5" />
                      {isAdmin ? "Admin Portal" : "User Portal"}
                    </p>
                    <h1 className="mt-2 text-xl font-semibold text-slate-900">
                      {activeSection === "appointments"
                        ? "Appointments"
                        : activeSection === "hall-board"
                          ? "Live Hall Board"
                          : activeSection === "users"
                            ? "Users"
                            : "AI Assistant"}
                    </h1>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection("appointments");
                        bookingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#5444e8] px-3 py-2 text-sm font-semibold text-white"
                    >
                      <Plus className="h-4 w-4" /> New Appointment
                    </button>
                    <button
                      type="button"
                      onClick={() => loadAll()}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                    {isAdmin ? (
                      <a
                        href="/api/admin/export"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <Download className="h-4 w-4" /> Export
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotificationsOpen((previous) => !previous);
                        setIsSettingsOpen(false);
                      }}
                      className="relative rounded-full border border-slate-200 bg-white p-2 text-slate-600"
                      aria-label="notifications"
                    >
                      <Bell className="h-4 w-4" />
                      {notificationItems.length > 0 ? (
                        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                          {notificationItems.length > 9 ? "9+" : notificationItems.length}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen((previous) => !previous);
                        setIsNotificationsOpen(false);
                      }}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-600"
                      aria-label="settings"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-600"
                      aria-label="logout"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                      <UserCircle2 className="h-5 w-5 text-[#5444e8]" />
                      {me?.name}
                    </span>
                  </div>
                </div>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
                {alert ? (
                  <div
                    className={`rounded-xl px-3 py-2 text-sm ${
                      alert.kind === "error"
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {alert.message}
                  </div>
                ) : null}

                <div className={activeSection === "appointments" ? "space-y-4" : "hidden"}>
                <section className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Total Halls</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{dashboard?.stats.totalRooms ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Active Meetings</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{dashboard?.stats.activeMeetings ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Free Now</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700">{availableNow}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Current Utilization</p>
                    <p className="mt-1 text-2xl font-semibold text-[#4b3ddb]">{occupancyRate}%</p>
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {(["UPCOMING", "PAST", "ALL"] as AppointmentView[]).map((view) => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => setAppointmentView(view)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                              appointmentView === view
                                ? "bg-[#5444e8] text-white"
                                : "bg-[#f4f5ff] text-slate-600 hover:bg-[#ebe9ff]"
                            }`}
                          >
                            {view === "UPCOMING" ? "Upcoming" : view === "PAST" ? "Past" : "All"}
                          </button>
                        ))}
                      </div>

                      <div className="relative min-w-[220px] flex-1 md:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          value={bookingSearch}
                          onChange={(event) => setBookingSearch(event.target.value)}
                          placeholder="Search by event, hall, owner"
                          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-[#7264ea]"
                        />
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                      <div className="hidden bg-[#f6f7ff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[1.1fr_1.8fr_1.1fr_1fr_1.4fr_auto]">
                        <span>Time</span>
                        <span>Event Type</span>
                        <span>Customer</span>
                        <span>Status</span>
                        <span>Customer Email</span>
                        <span>Actions</span>
                      </div>

                      {groupedBookings.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">No bookings found for this filter.</p>
                      ) : (
                        groupedBookings.map((group) => (
                          <div key={group.dateKey} className="border-t border-slate-100 first:border-t-0">
                            <p className="bg-[#fbfbff] px-4 py-2 text-sm font-semibold text-slate-800">
                              {format(new Date(`${group.dateKey}T00:00:00`), "dd-MMM-yyyy")}
                            </p>

                            {group.items.map((booking) => (
                              <div
                                key={booking.id}
                                className={`border-t border-slate-100 px-4 ${preferences.compactTable ? "py-2" : "py-3"} md:grid md:grid-cols-[1.1fr_1.8fr_1.1fr_1fr_1.4fr_auto] md:items-start md:gap-3`}
                              >
                                <div className="text-sm text-slate-700">
                                  <p className="font-medium">{formatDuration(booking.startTime, booking.endTime)}</p>
                                  <p className="text-xs text-slate-500">{booking.room.name}</p>
                                </div>

                                <div className="mt-2 md:mt-0">
                                  <p className="text-sm font-semibold text-slate-900">{booking.title}</p>
                                  <p className="text-xs text-slate-500">
                                    {booking.room.floor} • {formatMeetingMode(booking.meetingMode)}
                                  </p>
                                  {booking.meetingLink ? (
                                    <a
                                      href={booking.meetingLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#4b3ddb] hover:underline"
                                    >
                                      <Video className="h-3 w-3" /> Open Link
                                    </a>
                                  ) : null}
                                </div>

                                <div className="mt-2 text-sm text-slate-700 md:mt-0">
                                  <p>{booking.bookedBy.name}</p>
                                  <p className="text-xs text-slate-500">{booking.bookedBy.department}</p>
                                </div>

                                <div className="mt-2 md:mt-0">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${STATUS_COLORS[booking.status]}`}>
                                    {booking.status}
                                  </span>
                                </div>

                                <div className="mt-2 text-xs text-slate-600 md:mt-0">
                                  {booking.bookedBy.email}
                                  {isAdmin ? <p className="mt-1 text-[11px] text-slate-400">Owner visible for admin</p> : null}
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1.5 md:mt-0 md:justify-end">
                                  {booking.meetingLink ? (
                                    <button
                                      type="button"
                                      onClick={() => copyMeetingLink(booking.meetingLink)}
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                                    >
                                      <Copy className="h-3 w-3" /> Copy
                                    </button>
                                  ) : null}

                                  {booking.status === "BOOKED" ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => runBookingAction(booking.id, "check-in")}
                                        className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                                      >
                                        Check-In
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => runBookingAction(booking.id, "cancel")}
                                        className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : null}

                                  {booking.status === "CHECKED_IN" ? (
                                    <button
                                      type="button"
                                      onClick={() => runBookingAction(booking.id, "release")}
                                      className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white"
                                    >
                                      Release
                                    </button>
                                  ) : null}

                                  {(booking.status === "RELEASED" || booking.status === "CANCELLED") && !booking.summaryText ? (
                                    <button
                                      type="button"
                                      onClick={() => generateSummary(booking.id)}
                                      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                                    >
                                      <Sparkles className="h-3 w-3" /> Summary
                                    </button>
                                  ) : null}
                                </div>

                                {booking.summaryText ? (
                                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs text-slate-700 md:col-span-6">
                                    {booking.summaryText}
                                  </pre>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <form ref={bookingFormRef} onSubmit={submitBooking} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold text-slate-900">Quick Booking</h2>
                        <span className="rounded-full bg-[#ece9ff] px-2 py-0.5 text-[11px] font-semibold text-[#5142df]">
                          Simple Mode
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <input
                          required
                          placeholder="Meeting title"
                          value={form.title}
                          onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="Agenda (optional)"
                          value={form.agenda}
                          onChange={(event) => setForm((previous) => ({ ...previous, agenda: event.target.value }))}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={form.date}
                            onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={form.attendeeCount}
                            onChange={(event) =>
                              setForm((previous) => ({ ...previous, attendeeCount: Number(event.target.value) }))
                            }
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="time"
                            value={form.startTime}
                            onChange={(event) => setForm((previous) => ({ ...previous, startTime: event.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <input
                            type="time"
                            value={form.endTime}
                            onChange={(event) => setForm((previous) => ({ ...previous, endTime: event.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <select
                          value={form.meetingMode}
                          onChange={(event) =>
                            setForm((previous) => ({ ...previous, meetingMode: event.target.value as MeetingMode }))
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {MEETING_MODES.map((modeValue) => (
                            <option key={modeValue} value={modeValue}>
                              {formatMeetingMode(modeValue)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={searchAvailability}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#cfc9ff] bg-[#f2efff] px-3 py-2 text-sm font-semibold text-[#5142df]"
                        >
                          <Search className="h-4 w-4" /> {isSearching ? "Searching..." : "Find Halls"}
                        </button>
                        <button
                          type="submit"
                          disabled={isBooking}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#5444e8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                        >
                          {isBooking ? "Booking..." : "Book Now"}
                        </button>
                      </div>

                      {availability.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Halls</p>
                          {availability.map((room) => (
                            <label
                              key={room.id}
                              className={`block rounded-lg border px-3 py-2 text-sm ${
                                room.isAvailable
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-rose-200 bg-rose-50"
                              }`}
                            >
                              <input
                                type="radio"
                                name="hall"
                                disabled={!room.isAvailable}
                                checked={form.selectedRoomId === room.id}
                                onChange={() => setForm((previous) => ({ ...previous, selectedRoomId: room.id }))}
                                className="mr-2"
                              />
                              {room.name} ({room.floor}, cap {room.capacity})
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  openHallPreview(room.name);
                                }}
                                className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Preview hall
                              </button>
                              {!room.isAvailable && room.conflict ? (
                                <span className="mt-1 block text-xs text-rose-700">
                                  Busy: {room.conflict.title} by {room.conflict.bookedBy}
                                </span>
                              ) : null}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </form>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h2 className="font-semibold text-slate-900">Reminders (next 60 min)</h2>
                      <div className="mt-2 space-y-2">
                        {reminders.length === 0 ? (
                          <p className="text-sm text-slate-500">No upcoming reminders.</p>
                        ) : (
                          reminders.map((item) => (
                            <div key={item.booking.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                              <p className="font-semibold text-slate-900">{item.booking.title}</p>
                              <p className="text-xs text-slate-600">
                                Starts in {item.minutesToStart} min at {item.booking.room.name}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h2 className="font-semibold text-slate-900">Live Hall Board</h2>
                      <div className="mt-2 space-y-2">
                        {dashboard?.roomBoard.map((room) => (
                          <div
                            key={room.id}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              room.isAvailableNow
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-amber-200 bg-amber-50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openHallPreview(room.name)}
                              className="font-semibold text-slate-900 underline decoration-dotted underline-offset-2"
                            >
                              {room.name}
                            </button>
                            <p className="text-xs text-slate-500">{room.floor}</p>
                            <p className="text-xs text-slate-600">
                              {room.isAvailableNow ? "Available now" : `Occupied: ${room.activeBooking?.title}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#d8d3ff] bg-[linear-gradient(180deg,#f8f6ff_0%,#ffffff_100%)] p-4">
                      <p className="text-xs uppercase tracking-wide text-[#5f52da]">AI Recommendation</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {aiRoomRecommendation
                          ? `Best hall right now: ${aiRoomRecommendation.name} (${aiRoomRecommendation.floor}, capacity ${aiRoomRecommendation.capacity}).`
                          : "No active recommendation right now. Use Find Halls for your slot."}
                      </p>
                    </div>

                    {isAdmin && analytics ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h2 className="font-semibold text-slate-900">Admin Analytics</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Check-in rate {analytics.kpis.checkedInRate}% • No-show {analytics.kpis.noShowRate}%
                        </p>

                        <div className="mt-2 h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={analytics.statusBreakdown} dataKey="count" nameKey="status" outerRadius={62}>
                                {analytics.statusBreakdown.map((entry, index) => (
                                  <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="mt-2 h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.roomUtilization.slice(0, 5)}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="roomName" />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="utilization" fill="#5444e8" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
                </div>

                {activeSection === "hall-board" ? (
                  <section className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Total Active Halls</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">{dashboard?.stats.totalRooms ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Occupied Now</p>
                        <p className="mt-1 text-2xl font-semibold text-amber-700">{dashboard?.stats.activeMeetings ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Available Now</p>
                        <p className="mt-1 text-2xl font-semibold text-emerald-700">{availableNow}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold text-slate-900">Live Hall Board</h2>
                        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
                          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <input
                            value={hallSearch}
                            onChange={(event) => setHallSearch(event.target.value)}
                            placeholder="Search hall by name/floor/location"
                            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-[#7264ea]"
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {filteredRoomBoard.map((room) => (
                          <div
                            key={room.id}
                            className={`rounded-xl border p-3 ${
                              room.isAvailableNow
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-amber-200 bg-amber-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => openHallPreview(room.name)}
                                className="text-left font-semibold text-slate-900 underline decoration-dotted underline-offset-2"
                              >
                                {room.name}
                              </button>
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {room.capacity} seats
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{room.floor} • {room.location}</p>
                            <p className="mt-2 text-xs font-medium text-slate-700">
                              {room.isAvailableNow
                                ? "Available now"
                                : `Occupied by ${room.activeBooking?.bookedBy.name ?? "Unknown"}`}
                            </p>
                            {!room.isAvailableNow && room.activeBooking ? (
                              <p className="mt-1 text-xs text-slate-600">
                                {room.activeBooking.title} until{" "}
                                {format(new Date(room.activeBooking.endTime), "HH:mm")}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h2 className="font-semibold text-slate-900">Recent Activity</h2>
                      <div className="mt-2 space-y-2">
                        {activityLog.length === 0 ? (
                          <p className="text-sm text-slate-500">No activity logged yet.</p>
                        ) : (
                          activityLog.slice(0, 8).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-sm text-slate-800">{item.message}</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {format(new Date(item.at), "dd MMM, HH:mm:ss")}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                ) : null}

                {activeSection === "users" ? (
                  <section className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Total Users</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">{userDirectory.length}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Admin Accounts</p>
                        <p className="mt-1 text-2xl font-semibold text-[#4b3ddb]">
                          {userDirectory.filter((user) => user.role === "ADMIN").length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Pending Approvals</p>
                        <p className="mt-1 text-2xl font-semibold text-amber-700">{pendingAccessRequests.length}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold text-slate-900">User Directory</h2>
                        <button
                          type="button"
                          onClick={exportUsersCsv}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          Export Users CSV
                        </button>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">Email</th>
                              <th className="px-3 py-2">Role</th>
                              <th className="px-3 py-2">Department</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Blocked Reason</th>
                              {isAdmin ? <th className="px-3 py-2">Actions</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {userDirectory.map((user) => (
                              <tr key={user.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-800">{user.name}</td>
                                <td className="px-3 py-2 text-slate-600">{user.email}</td>
                                <td className="px-3 py-2 text-slate-600">{user.role}</td>
                                <td className="px-3 py-2 text-slate-600">{user.department}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      user.isBlocked
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {user.isBlocked ? "Blocked" : "Active"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                  {user.blockedReason ?? "—"}
                                </td>
                                {isAdmin ? (
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {user.isBlocked ? (
                                        <button
                                          type="button"
                                          disabled={userActionUserId === user.id || user.id === me?.id}
                                          onClick={() => {
                                            unblockUser(user).catch(() => {
                                              // handled in unblockUser
                                            });
                                          }}
                                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                        >
                                          Unblock
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={userActionUserId === user.id || user.id === me?.id}
                                          onClick={() => {
                                            blockUser(user).catch(() => {
                                              // handled in blockUser
                                            });
                                          }}
                                          className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                        >
                                          Block
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        disabled={userActionUserId === user.id || user.id === me?.id}
                                        onClick={() => {
                                          removeUser(user).catch(() => {
                                            // handled in removeUser
                                          });
                                        }}
                                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {isAdmin ? (
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <h2 className="font-semibold text-slate-900">Pending Access Requests</h2>
                          <div className="mt-3 space-y-2">
                            {pendingAccessRequests.length === 0 ? (
                              <p className="text-sm text-slate-500">No pending requests.</p>
                            ) : (
                              pendingAccessRequests.map((request) => (
                                <div key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <p className="font-semibold text-slate-900">{request.name}</p>
                                  <p className="text-xs text-slate-600">{request.email}</p>
                                  <p className="text-xs text-slate-600">{request.department}</p>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      disabled={reviewingRequestId === request.id}
                                      onClick={() => {
                                        reviewAccessRequest(request.id, "APPROVE").catch(() => {
                                          // Handled in reviewAccessRequest
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                    >
                                      <Check className="h-3 w-3" />
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={reviewingRequestId === request.id}
                                      onClick={() => {
                                        reviewAccessRequest(request.id, "REJECT").catch(() => {
                                          // Handled in reviewAccessRequest
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                    >
                                      <X className="h-3 w-3" />
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <h2 className="font-semibold text-slate-900">Create User (Admin)</h2>
                          <div className="mt-3 grid gap-2">
                            <input
                              value={createUserForm.name}
                              onChange={(event) =>
                                setCreateUserForm((previous) => ({ ...previous, name: event.target.value }))
                              }
                              placeholder="Name"
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <input
                              type="email"
                              value={createUserForm.email}
                              onChange={(event) =>
                                setCreateUserForm((previous) => ({ ...previous, email: event.target.value }))
                              }
                              placeholder="Email"
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <input
                              value={createUserForm.department}
                              onChange={(event) =>
                                setCreateUserForm((previous) => ({ ...previous, department: event.target.value }))
                              }
                              placeholder="Department"
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <input
                              type="password"
                              value={createUserForm.password}
                              onChange={(event) =>
                                setCreateUserForm((previous) => ({ ...previous, password: event.target.value }))
                              }
                              placeholder="Temporary password"
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <select
                              value={createUserForm.role}
                              onChange={(event) =>
                                setCreateUserForm((previous) => ({
                                  ...previous,
                                  role: event.target.value as Role,
                                }))
                              }
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="EMPLOYEE">Employee</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <button
                              type="button"
                              disabled={isCreatingUser}
                              onClick={() => {
                                createUser().catch(() => {
                                  // Handled in createUser
                                });
                              }}
                              className="rounded-lg bg-[#5444e8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                            >
                              {isCreatingUser ? "Creating..." : "Create User"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        User management actions are available for admin only.
                      </div>
                    )}
                  </section>
                ) : null}

                {activeSection === "assistant" ? (
                  <section className="space-y-4">
                    <div className="rounded-2xl border border-[#d8d3ff] bg-[linear-gradient(180deg,#f8f6ff_0%,#ffffff_100%)] p-4">
                      <h2 className="font-semibold text-slate-900">AI Assistant Control Center</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Assistant supports booking orchestration, hall discovery, reminders, links, summaries, and user guidance.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setIsChatOpen(true)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#5444e8] px-3 py-2 text-sm font-semibold text-white"
                        >
                          <MessageSquare className="h-4 w-4" /> Open Assistant
                        </button>
                        <button
                          type="button"
                          onClick={clearChatHistory}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          Clear Chat
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="font-semibold text-slate-900">Capabilities Enabled</h3>
                        <div className="mt-2 space-y-2 text-sm text-slate-700">
                          <p className="rounded-lg bg-slate-50 px-3 py-2">1. Guided booking with data collection</p>
                          <p className="rounded-lg bg-slate-50 px-3 py-2">2. Real-time hall availability lookup</p>
                          <p className="rounded-lg bg-slate-50 px-3 py-2">3. Reminders and schedule support</p>
                          <p className="rounded-lg bg-slate-50 px-3 py-2">4. Meeting links and summary guidance</p>
                          <p className="rounded-lg bg-slate-50 px-3 py-2">5. Role-aware admin/user responses</p>
                          <p className="rounded-lg bg-slate-50 px-3 py-2">6. Context suggestions and follow-up prompts</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="font-semibold text-slate-900">Recent Activity Log</h3>
                        <div className="mt-2 space-y-2">
                          {activityLog.length === 0 ? (
                            <p className="text-sm text-slate-500">No activity yet.</p>
                          ) : (
                            activityLog.slice(0, 10).map((item) => (
                              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-sm text-slate-800">{item.message}</p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {format(new Date(item.at), "dd MMM, HH:mm:ss")}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {isNotificationsOpen ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-slate-900">Notifications</h2>
                      <button
                        type="button"
                        onClick={() => setIsNotificationsOpen(false)}
                        className="text-xs text-slate-500 underline"
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {notificationItems.length === 0 ? (
                        <p className="text-sm text-slate-500">No unread notifications.</p>
                      ) : (
                        notificationItems.map((item) => (
                          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-sm text-slate-800">{item.text}</p>
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                              <Clock3 className="h-3 w-3" />
                              {format(new Date(item.at), "dd MMM, HH:mm")}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                {isSettingsOpen ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-slate-900">Workspace Settings</h2>
                      <button
                        type="button"
                        onClick={() => setIsSettingsOpen(false)}
                        className="text-xs text-slate-500 underline"
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-sm text-slate-700">
                        <span>Default Meeting Mode</span>
                        <select
                          value={preferences.defaultMeetingMode}
                          onChange={(event) =>
                            setPreferences((previous) => ({
                              ...previous,
                              defaultMeetingMode: event.target.value as MeetingMode,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {MEETING_MODES.map((modeValue) => (
                            <option key={modeValue} value={modeValue}>
                              {formatMeetingMode(modeValue)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={preferences.compactTable}
                          onChange={(event) =>
                            setPreferences((previous) => ({
                              ...previous,
                              compactTable: event.target.checked,
                            }))
                          }
                        />
                        Compact appointment rows
                      </label>

                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={preferences.autoOpenAssistant}
                          onChange={(event) =>
                            setPreferences((previous) => ({
                              ...previous,
                              autoOpenAssistant: event.target.checked,
                            }))
                          }
                        />
                        Auto open assistant on load
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      {activePreviewHall ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-8"
          onClick={() => setActivePreviewHall(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-white/30 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {activePreviewHall.roomName} - Hall Preview
                </h3>
                <p className="text-sm text-slate-600">{activePreviewHall.note}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewHall(null)}
                className="rounded-full border border-slate-300 bg-white p-2 text-slate-600"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <Image
                src={activePreviewHall.imageSrc}
                alt={`${activePreviewHall.roomName} preview`}
                width={1200}
                height={780}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      ) : null}

      {isChatOpen ? (
        <div className="chat-pop fixed bottom-24 right-6 z-40 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[#d9d6ff] bg-white shadow-[0_32px_58px_-35px_rgba(23,20,59,0.7)]">
          <div className="flex items-center justify-between rounded-t-2xl bg-[linear-gradient(90deg,#5646e8_0%,#6e5cf5_100%)] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <div>
                <p className="text-sm font-semibold">AI Meeting Assistant</p>
                <p className="text-[11px] text-white/80">
                  Confidence {Math.round((lastBotMessage?.confidence ?? 0.9) * 100)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsVoiceReplyEnabled((previous) => !previous)}
                disabled={!isVoiceOutputSupported}
                className="rounded-md bg-white/20 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                title={isVoiceReplyEnabled ? "Mute assistant voice" : "Enable assistant voice"}
              >
                {isVoiceReplyEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={clearChatHistory}
                className="rounded-md bg-white/20 px-2 py-1 text-xs"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="rounded-md bg-white/20 px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="max-h-[420px] space-y-2 overflow-y-auto bg-[#fafaff] px-3 py-3">
            {chat.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-8 bg-[#5444e8] text-white"
                    : "mr-8 border border-slate-200 bg-white text-slate-700"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>

                {message.role === "bot" && message.suggestions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion}-${index}`}
                        type="button"
                        onClick={() => {
                          askBot(suggestion).catch(() => {
                            // handled in askBot
                          });
                        }}
                        className="rounded-full border border-[#d8d3ff] bg-[#f4f2ff] px-2 py-1 text-[11px] font-medium text-[#4f40df]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {isBotThinking ? (
              <div className="mr-8 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                Thinking...
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 p-3">
            {chatFlow ? (
              <p className="mb-2 rounded-lg bg-[#f3f1ff] px-2 py-1 text-[11px] font-medium text-[#4f40df]">
                Booking mode active. Type &apos;cancel&apos; to stop.
              </p>
            ) : null}

            {isListening ? (
              <p className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                Listening... Speak now.
              </p>
            ) : null}

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    askBot().catch(() => {
                      // handled in askBot
                    });
                  }
                }}
                placeholder="Type or tap mic: book a meeting for me"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={!isVoiceInputSupported || isBotThinking}
                onClick={() => {
                  if (isListening) {
                    stopVoiceCapture();
                  } else {
                    startVoiceCapture();
                  }
                }}
                className="inline-flex items-center justify-center rounded-lg border border-[#d8d3ff] bg-[#f4f2ff] px-3 py-2 text-[#4f40df] disabled:opacity-60"
                title={isListening ? "Stop voice input" : "Start voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={isBotThinking}
                onClick={() => {
                  askBot().catch(() => {
                    // handled in askBot
                  });
                }}
                className="inline-flex items-center justify-center rounded-lg bg-[#5444e8] px-3 py-2 text-white disabled:opacity-70"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              <p className="inline-flex items-center gap-1 font-semibold">
                <AlertCircle className="h-3 w-3" /> Quick Help
              </p>
              <p>
                Ask availability, reminders, links, summaries, or tap mic and say
                &quot;book a meeting for me&quot;.
              </p>
              {!isVoiceInputSupported ? (
                <p className="mt-1 text-[10px] text-amber-700">
                  {voiceInputHint ??
                    "Voice input needs a browser with Speech Recognition support (Chrome/Edge recommended)."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsChatOpen((previous) => !previous)}
        className="chat-fab fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5444e8_0%,#7a68ff_100%)] text-white shadow-[0_24px_45px_-20px_rgba(58,45,179,0.9)]"
        aria-label="Open AI assistant"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {!isChatOpen ? (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-8 right-24 z-50 hidden rounded-full border border-[#d7d2ff] bg-white px-3 py-1.5 text-xs font-semibold text-[#4f40df] shadow-sm md:inline-flex"
        >
          Need help?
        </button>
      ) : null}

      <div className="fixed left-4 bottom-4 rounded-lg bg-white/90 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
        Logged in as {me?.email}
      </div>
    </main>
  );
}
