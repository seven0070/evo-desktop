import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Cpu,
  Dna,
  ExternalLink,
  HardDrive,
  Layers,
  Paperclip,
  Plus,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  User,
  Wifi,
  XCircle,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotification } from "@/components/UpdateNotification";
import {
  approveAction,
  sendPrompt,
  sendBridgeCommand,
  startAgentBridge,
  subscribeToAgentEvents,
  type AgentEvent,
  type MissionStepUpdate,
  type SystemHealthUpdate,
} from "@/lib/tauri-bridge";

type Tab = "chat" | "missions" | "trust" | "settings";
type Appearance = "Light" | "Dark" | "System";
type MissionStatus = "Running" | "Completed" | "Paused" | "Failed";
type ApprovalStatus = "pending" | "reviewing" | "approved" | "declined";

type Mission = {
  title: string;
  desc: string;
  status: MissionStatus;
  time: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "agent";
  content: string;
};

const queryClient = new QueryClient();

const recentChats = [
  "Prepare my project release",
  "Summarize quarterly report",
  "Draft onboarding email",
  "Research competitor pricing",
];

const missions: Mission[] = [
  { title: "Prepare my project release", desc: "Waiting for approval to deploy", status: "Running", time: "2m ago" },
  { title: "Summarize quarterly report", desc: "Delivered summary and 3 sources", status: "Completed", time: "1h ago" },
  { title: "Migrate onboarding docs", desc: "Paused and needs source access", status: "Paused", time: "3h ago" },
  { title: "Research competitor pricing", desc: "Delivered comparison table", status: "Completed", time: "Yesterday" },
  { title: "Sync CRM contacts", desc: "Blocked by invalid credentials", status: "Failed", time: "2 days ago" },
];

const settingsTabs = [
  "General",
  "Appearance",
  "Notifications",
  "Connections",
  "AI Providers",
  "Security",
  "Privacy",
  "Advanced",
  "About",
];

const navItems: Array<{ id: string; label: string; icon: typeof Compass; disabled?: boolean }> = [
  { id: "missions", label: "Missions", icon: Compass },
  { id: "evolution", label: "Evolution", icon: Dna, disabled: true },
  { id: "trust", label: "Trust", icon: ShieldCheck },
  { id: "system", label: "System", icon: Cpu },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const statusClass: Record<MissionStatus, string> = {
  Running: "status-running",
  Completed: "status-completed",
  Paused: "status-paused",
  Failed: "status-failed",
};

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={label}
      data-testid={`toggle-${label.toLowerCase().replaceAll(" ", "-")}`}
      className={`evo-toggle ${value ? "is-on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function ApprovalCard({
  approvalStatus,
  onReview,
  onApprove,
  onDecline,
  isApproving = false,
  actionError,
}: {
  approvalStatus: ApprovalStatus;
  onReview: () => void;
  onApprove: () => void | Promise<void>;
  onDecline: () => void;
  isApproving?: boolean;
  actionError?: string | null;
}) {
  if (approvalStatus === "approved") {
    return (
      <div className="evo-approval" data-testid="approval-card-approved">
        <div className="evo-approval-resolved">
          <CheckCircle2 size={15} /> Release approved. EVO is preparing the deployment.
        </div>
      </div>
    );
  }
  if (approvalStatus === "declined") {
    return (
      <div className="evo-approval" data-testid="approval-card-declined">
        <div className="evo-approval-resolved evo-declined">
          <XCircle size={15} /> Deployment declined. The release remains safely staged.
        </div>
        <div className="evo-approval-actions">
          <button type="button" className="evo-btn evo-btn-outline" onClick={onApprove} data-testid="button-reconsider-approval">
            Approve instead
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="evo-approval" data-testid="approval-card">
      <div className="evo-approval-top">
        <div>
          <span className="evo-eyebrow">EVO wants to perform this action</span>
          <h4>Deploy the approved release</h4>
          <p>Reason: The release passed validation and no blocking issues were found.</p>
        </div>
        <span className="evo-risk">Risk: Low</span>
      </div>
      {approvalStatus === "reviewing" && (
        <div className="evo-technical" data-testid="approval-review-details">
          <strong>Review details</strong><br />
          target: release/v1.2<br />
          checks: 3 passed, 0 blocked<br />
          action: deploy approved artifact
        </div>
      )}
      {actionError && <div className="evo-technical evo-action-error" role="alert" data-testid="approval-action-error">{actionError}</div>}
      <div className="evo-approval-actions">
        <button type="button" className="evo-btn evo-btn-muted" onClick={approvalStatus === "reviewing" ? onDecline : onReview} data-testid="button-review-approval">
          {approvalStatus === "reviewing" ? "Close review" : "Review"}
        </button>
        <button type="button" className="evo-btn evo-btn-dark" onClick={onApprove} disabled={isApproving} data-testid="button-approve-release">
          {isApproving ? "Approving..." : "Approve"}
        </button>
      </div>
    </div>
  );
}

function ChatPanel({
  selectedMission,
  inputRef,
}: {
  selectedMission: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: "user", content: "Can you check the repo and prepare the release notes for v1.2?" },
    {
      id: 2,
      role: "agent",
      content: "I've checked the repository and pulled the latest changes since v1.1. Here's a draft of the release notes:",
    },
  ]);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [isApproving, setIsApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content: value },
      { id: Date.now() + 1, role: "agent", content: `I’ve added that to the ${selectedMission.toLowerCase()} thread. I’ll keep the next action ready for your review.` },
    ]);
    setInput("");
    try {
      await sendPrompt(selectedMission, value);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: Date.now(), role: "agent", content: `The EVO bridge could not accept that prompt: ${error instanceof Error ? error.message : "unknown error"}.` },
      ]);
    }
  };

  const approve = async () => {
    setIsApproving(true);
    setActionError(null);
    try {
      await approveAction(`evo-${selectedMission.toLowerCase().replaceAll(" ", "-")}`, "deploy_approved_release");
      setApprovalStatus("approved");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The EVO bridge could not approve this action.");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <section className="evo-panel" data-testid="panel-chat">
      <header className="evo-header">
        <div className="evo-brand">
          <span className="evo-mark">EV</span>
          <span>EVO</span>
          <span className="evo-trusted">Trusted</span>
        </div>
      </header>
      <div className="evo-scroll evo-chat-scroll">
        <div className="evo-chat-thread">
          {messages.map((message) =>
            message.role === "user" ? (
              <div className="evo-user-message" key={message.id} data-testid={`chat-user-message-${message.id}`}>
                {message.id === 1 ? message.content : message.content}
              </div>
            ) : (
              <div className="evo-agent" key={message.id} data-testid={`chat-agent-message-${message.id}`}>
                <div className="evo-agent-mark">EV</div>
                <div className="evo-agent-body">
                  <div className="evo-agent-meta"><strong>EVO</strong><span>{message.id === 2 ? "just now" : "a moment ago"}</span></div>
                  {message.id === 2 ? (
                    <>
                      <div className="evo-action-pill">
                        <strong>CHECKED REPOSITORY</strong><span>/</span><span>Ran validation</span><span>/</span><span>3 actions</span><ChevronDown size={13} />
                      </div>
                      <p className="evo-copy-block">{message.content}</p>
                      <ul className="evo-copy-list">
                        <li>Added real-time collaboration to shared workspaces.</li>
                        <li>Fixed the recurring sync conflict on offline edits.</li>
                        <li>Improved load time for large document exports by 40%.</li>
                      </ul>
                      <p className="evo-copy-block">Shall I push these notes to the release branch and trigger the build?</p>
                      <div className="evo-complete"><CheckCircle2 /> <span>Completed</span></div>
                      <ApprovalCard approvalStatus={approvalStatus} onReview={() => { setActionError(null); setApprovalStatus("reviewing"); }} onApprove={approve} onDecline={() => { setActionError(null); setApprovalStatus("declined"); }} isApproving={isApproving} actionError={actionError} />
                    </>
                  ) : (
                    <p className="evo-copy-block">{message.content}</p>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
      <div className="evo-composer-wrap">
        <form className="evo-composer" onSubmit={submit}>
          <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask EVO..." aria-label="Ask EVO" data-testid="input-chat-message" />
          <div className="evo-composer-footer">
            <button type="button" className="evo-icon-button" aria-label="Attach a file" data-testid="button-attach-chat" onClick={() => setInput((current) => current ? `${current} ` : "Attached context: ")}><Paperclip size={16} /></button>
            <div className="evo-composer-footer">
              <span className="evo-shortcut">Ctrl K to focus</span>
              <button type="submit" className="evo-send" aria-label="Send message" data-testid="button-send-chat"><ArrowUp size={15} /></button>
            </div>
          </div>
        </form>
        <p className="evo-disclaimer">EVO can make mistakes. Verify important actions.</p>
      </div>
    </section>
  );
}

function MissionsPanel({
  selectedMission,
  setSelectedMission,
  inputRef,
  missionStepUpdate,
}: {
  selectedMission: string;
  setSelectedMission: (mission: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  missionStepUpdate: MissionStepUpdate | null;
}) {
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [missionQuestion, setMissionQuestion] = useState("");
  const [missionNotes, setMissionNotes] = useState<string[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mission = missions.find((item) => item.title === selectedMission) ?? missions[0];

  useEffect(() => {
    setApprovalStatus(mission.status === "Running" ? "pending" : mission.status === "Completed" ? "approved" : "declined");
    setEvidenceOpen(false);
    setTechnicalOpen(false);
  }, [mission.title, mission.status]);

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const value = missionQuestion.trim();
    if (!value) return;
    setMissionNotes((current) => [...current, value]);
    setMissionQuestion("");
    try {
      await sendPrompt(mission.title, value);
    } catch (error) {
      setMissionNotes((current) => [...current, `The EVO bridge could not accept that prompt: ${error instanceof Error ? error.message : "unknown error"}.`]);
    }
  };

  const approve = async () => {
    setIsApproving(true);
    setActionError(null);
    try {
      await approveAction(`evo-${mission.title.toLowerCase().replaceAll(" ", "-")}`, "deploy_approved_release");
      setApprovalStatus("approved");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The EVO bridge could not approve this action.");
    } finally {
      setIsApproving(false);
    }
  };

  const missionId = `evo-${mission.title.toLowerCase().replaceAll(" ", "-")}`;
  const liveStep = missionStepUpdate?.missionId === undefined && missionStepUpdate?.mission_id === undefined
    ? missionStepUpdate?.step
    : missionStepUpdate.missionId === missionId || missionStepUpdate.mission_id === missionId
      ? missionStepUpdate.step
      : undefined;

  return (
    <section className="evo-missions" data-testid="panel-missions">
      <aside className="evo-mission-list">
        <h2 className="evo-list-title">Missions</h2>
        <div className="evo-mission-items">
          {missions.map((item) => (
            <button
              type="button"
              key={item.title}
              className={`evo-mission-row ${selectedMission === item.title ? "is-selected" : ""}`}
              onClick={() => setSelectedMission(item.title)}
              data-testid={`mission-${item.title.toLowerCase().replaceAll(" ", "-")}`}
            >
              <span className="evo-mission-meta">
                <span className={`evo-status-label ${statusClass[item.status]}`}><i className="evo-status-dot" />{item.status}</span>
                <span>{item.time}</span>
              </span>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </button>
          ))}
        </div>
      </aside>
      <div className="evo-detail">
        <header className="evo-detail-header">
          <div className="evo-detail-heading">
            <span data-testid="text-selected-mission">{mission.title}</span>
            <span className={`evo-status-badge ${statusClass[mission.status]}`} data-testid="status-selected-mission">{mission.status}</span>
          </div>
          <button type="button" className="evo-link-button" onClick={() => setTechnicalOpen((value) => !value)} data-testid="button-mission-technical-details">
            Details <ChevronRight size={13} />
          </button>
        </header>
        <div className="evo-scroll">
          <div className="evo-detail-content">
            <span className="evo-progress-label">Progress</span>
            <div className="evo-progress">
              <span className="evo-progress-step"><CheckCircle2 size={14} /> Planning complete</span><span className="evo-progress-sep">/</span>
              <span className="evo-progress-step"><CheckCircle2 size={14} /> Checked repository</span><span className="evo-progress-sep">/</span>
              <span className="evo-progress-step"><CheckCircle2 size={14} /> Ran validation</span><span className="evo-progress-sep">/</span>
              <span className="evo-progress-step is-waiting"><AlertCircle size={14} /> {liveStep ?? (mission.status === "Running" ? "Waiting for approval" : mission.status)}</span>
            </div>
            {technicalOpen && (
              <div className="evo-technical" data-testid="mission-technical-details">
                mission_id: evo-{mission.title.toLowerCase().replaceAll(" ", "-")}<br />
                environment: verified runtime<br />
                last_updated: {mission.time}
              </div>
            )}
            <div className="evo-detail-agent">
              <div className="evo-agent-mark">EV</div>
              <div>
                <div className="evo-agent-meta"><strong>EVO</strong><span>{mission.status === "Running" ? "2m ago" : mission.time}</span></div>
                <p>{mission.status === "Running" ? "Everything checks out. The build passed validation with no errors. I'm ready to deploy the release whenever you approve." : mission.desc}.</p>
              </div>
            </div>
            <div className="evo-evidence" data-testid="evidence-summary">
              <div><strong>Evidence</strong><span>3 verified actions</span></div>
              <button type="button" className="evo-btn evo-btn-outline" onClick={() => setEvidenceOpen((value) => !value)} data-testid="button-view-evidence">{evidenceOpen ? "Hide" : "View"}</button>
            </div>
            {evidenceOpen && (
              <div className="evo-evidence-list" data-testid="evidence-details">
                <div><CheckCircle2 /> Repository checked against the release branch</div>
                <div><CheckCircle2 /> Validation completed with no blocking issues</div>
                <div><CheckCircle2 /> Build artifact matched the approved commit</div>
              </div>
            )}
            <ApprovalCard approvalStatus={approvalStatus} onReview={() => { setActionError(null); setApprovalStatus("reviewing"); }} onApprove={approve} onDecline={() => { setActionError(null); setApprovalStatus("declined"); }} isApproving={isApproving} actionError={actionError} />
            {missionNotes.map((note, index) => <p className="evo-copy-block" key={`${note}-${index}`} data-testid={`mission-note-${index}`}>You: {note}</p>)}
          </div>
        </div>
        <div className="evo-composer-wrap">
          <form className="evo-composer" onSubmit={submitQuestion}>
            <input ref={inputRef} value={missionQuestion} onChange={(event) => setMissionQuestion(event.target.value)} placeholder="Ask EVO about this mission..." aria-label="Ask EVO about this mission" data-testid="input-mission-question" />
            <div className="evo-composer-footer">
              <span className="evo-shortcut">Ctrl K to focus</span>
              <button type="submit" className="evo-send" aria-label="Send mission question" data-testid="button-send-mission"><ArrowUp size={15} /></button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function TrustPanel({ systemHealth }: { systemHealth: SystemHealthUpdate | null }) {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const trustItems = [
    { label: "Hardware", value: "Verified" },
    { label: "Identity", value: "Verified" },
    { label: "Runtime", value: "Verified" },
    { label: "Evidence", value: "Available" },
  ];
  const healthItems = [
    { label: "Workers", value: "3 healthy", icon: Server },
    { label: "Trust", value: "Verified", icon: ShieldCheck },
    { label: "Storage", value: "Healthy", icon: HardDrive },
    { label: "Connectivity", value: "Connected", icon: Wifi },
  ];
  return (
    <section className="evo-scroll" data-testid="panel-trust">
      <div className="evo-trust-page">
        <div className="evo-page-heading"><h2>Trust and System</h2><p>EVO is running in a verified, trusted environment right now.</p></div>
        <div className="evo-trust-section">
          <div className="evo-section-bar"><span className="evo-section-heading">Trust status</span><button type="button" className="evo-link-button" onClick={() => setTechnicalOpen((value) => !value)} data-testid="button-view-technical-details">View technical details <ChevronRight size={13} /></button></div>
          <div className="evo-trust-grid">
            {trustItems.map((item) => <div className="evo-trust-card" key={item.label} data-testid={`trust-card-${item.label.toLowerCase()}`}><span>{item.label}</span><span className="evo-trust-value"><CheckCircle2 />{item.value}</span></div>)}
          </div>
          {technicalOpen && <div className="evo-technical" data-testid="technical-details">attestation: verified<br />runtime: isolated worker pool<br />evidence_store: available<br />last_refresh: 18m ago</div>}
        </div>
        <div className="evo-trust-section">
          <div className="evo-health-title"><span className="evo-section-heading">System health</span><span className="evo-operational"><i />{systemHealth?.status ?? "Operational"}</span></div>
          <div className="evo-health-grid">
            {healthItems.map((item) => {
              const Icon = item.icon;
              const value = item.label === "Workers" && systemHealth?.workers !== undefined
                ? `${systemHealth.workers} healthy`
                : item.label === "Connectivity" && systemHealth?.connectivity
                  ? systemHealth.connectivity
                  : item.value;
              return <div className="evo-health-card" key={item.label}><span>{item.label}</span><strong><Icon size={14} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />{value}</strong></div>;
            })}
          </div>
        </div>
        <div className="evo-activity">
          <button type="button" className="evo-activity-header" onClick={() => setActivityOpen((value) => !value)} data-testid="button-toggle-activity"><span>Recent activity</span>{activityOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
          {activityOpen && <div data-testid="activity-list">
            <div className="evo-activity-row"><span>Mission “Prepare my project release” started</span><time>2m ago</time></div>
            <div className="evo-activity-row"><span>Trust verification refreshed</span><time>18m ago</time></div>
            <div className="evo-activity-row"><span>Worker 2 reconnected</span><time>1h ago</time></div>
          </div>}
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  activeSettingsTab,
  setActiveSettingsTab,
  language,
  setLanguage,
  suggestedPrompts,
  setSuggestedPrompts,
  autoApprove,
  setAutoApprove,
  sendUsage,
  setSendUsage,
  appearance,
  setAppearance,
}: {
  activeSettingsTab: string;
  setActiveSettingsTab: (tab: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  suggestedPrompts: boolean;
  setSuggestedPrompts: (value: boolean) => void;
  autoApprove: boolean;
  setAutoApprove: (value: boolean) => void;
  sendUsage: boolean;
  setSendUsage: (value: boolean) => void;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}) {
  const isGeneral = activeSettingsTab === "General";
  const isAppearance = activeSettingsTab === "Appearance";
  return (
    <section className="evo-settings" data-testid="panel-settings">
      <aside className="evo-settings-nav">
        <h2>Settings</h2>
        {settingsTabs.map((tab) => <button type="button" key={tab} className={`evo-settings-tab ${activeSettingsTab === tab ? "is-active" : ""}`} onClick={() => setActiveSettingsTab(tab)} data-testid={`settings-tab-${tab.toLowerCase().replaceAll(" ", "-")}`}>{tab}</button>)}
      </aside>
      <div className="evo-settings-body">
        <div className="evo-settings-content">
          <h3>{activeSettingsTab}</h3>
          <p>{isGeneral ? "Basic preferences for how EVO behaves." : isAppearance ? "Choose how EVO looks on this device." : `Manage EVO ${activeSettingsTab.toLowerCase()} preferences.`}</p>
          {isGeneral && (
            <div className="evo-preferences">
              <div className="evo-preference"><div><strong>Language</strong><p>Interface language for EVO</p></div><select className="evo-select" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Interface language" data-testid="select-language"><option>English (US)</option><option>English (UK)</option></select></div>
              <div className="evo-preference"><div><strong>Suggested prompts</strong><p>Show suggestions on the home screen</p></div><Toggle value={suggestedPrompts} onChange={() => setSuggestedPrompts(!suggestedPrompts)} label="Suggested prompts" /></div>
              <div className="evo-preference"><div><strong>Auto-approve low-risk actions</strong><p>EVO will still ask before anything risky</p></div><Toggle value={autoApprove} onChange={() => setAutoApprove(!autoApprove)} label="Auto approve low risk actions" /></div>
              <div className="evo-preference"><div><strong>Send anonymous usage data</strong><p>Helps improve EVO reliability</p></div><Toggle value={sendUsage} onChange={() => setSendUsage(!sendUsage)} label="Send anonymous usage data" /></div>
            </div>
          )}
          {isAppearance && (
            <div className="evo-preferences">
              <div className="evo-preference"><div><strong>Appearance</strong><p>Choose how EVO looks on this device.</p></div></div>
              <div className="evo-appearance-grid">{(["Light", "Dark", "System"] as Appearance[]).map((mode) => <button type="button" key={mode} className={`evo-appearance-button ${appearance === mode ? "is-active" : ""}`} onClick={() => setAppearance(mode)} data-testid={`button-appearance-${mode.toLowerCase()}`}>{mode}</button>)}</div>
            </div>
          )}
          {!isGeneral && !isAppearance && <div className="evo-settings-note" data-testid="settings-tab-content"><Layers size={15} /> <span>{activeSettingsTab} is configured locally for this client. Changes remain on this device.</span></div>}
          <div className="evo-version evo-preference"><div><strong>EVO Client</strong><p>v1.0.0</p></div><ExternalLink size={14} color="var(--evo-muted)" /></div>
        </div>
      </div>
    </section>
  );
}

function EvoDesktopApp() {
  const [activeTab, setActiveTab] = useState<Tab>("missions");
  const [activeSettingsTab, setActiveSettingsTab] = useState("General");
  const [selectedMission, setSelectedMission] = useState("Prepare my project release");
  const [language, setLanguage] = useState("English (US)");
  const [suggestedPrompts, setSuggestedPrompts] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [sendUsage, setSendUsage] = useState(true);
  const [appearance, setAppearance] = useState<Appearance>("Light");
  const [missionStepUpdate, setMissionStepUpdate] = useState<MissionStepUpdate | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthUpdate | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const missionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    const unlistenPromise = subscribeToAgentEvents((event: AgentEvent) => {
      if (disposed) return;
      if (event.type === "TELEMETRY" && event.health) {
        setSystemHealth(event.health);
      } else if (event.type !== "ERROR") {
        setMissionStepUpdate(event);
      }
    });

    void (async () => {
      try {
        await startAgentBridge();
        await sendBridgeCommand("GET_HEALTH");
        await sendBridgeCommand("START_MISSION", {
          mission_id: "evo-prepare-my-project-release",
          prompt: "Check the repo and prepare the release notes for v1.2.",
        });
      } catch {
        // The browser preview has no native bridge. Tauri errors surface when
        // a user triggers a command through the approval or prompt flows.
      }
    })();

    return () => {
      disposed = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        (activeTab === "chat" ? chatInputRef.current : missionInputRef.current)?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab]);

  const isDark = appearance === "Dark" || (appearance === "System" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  const navigate = (id: string) => {
    if (id === "evolution") return;
    setActiveTab(id === "system" ? "trust" : id as Tab);
  };

  return (
    <div className={`evo-app ${isDark ? "evo-dark" : ""}`} data-testid="evo-app">
      <div className="evo-shell">
        <aside className="evo-sidebar">
          <div className="evo-sidebar-scroll">
            <button type="button" className="evo-new-chat" onClick={() => setActiveTab("chat")} data-testid="button-new-chat"><span>New chat</span><Plus size={16} /></button>
            <div className="evo-recents">
              <span className="evo-section-label">Recent</span>
              {recentChats.map((item, index) => <button type="button" key={item} className={`evo-recent ${activeTab === "chat" && selectedMission === item ? "is-active" : ""}`} onClick={() => { setActiveTab("chat"); setSelectedMission(item); }} data-testid={`recent-chat-${index}`}>{item}</button>)}
            </div>
            <nav className="evo-nav" aria-label="Primary navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === "system" ? activeTab === "trust" : activeTab === item.id;
                return <button type="button" key={item.id} className={`evo-nav-item ${isActive ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`} onClick={() => navigate(item.id)} disabled={item.disabled} data-testid={`nav-${item.id}`}><Icon /><span>{item.label}</span></button>;
              })}
            </nav>
          </div>
          <div className="evo-userbar">
            <div className="evo-avatar"><User size={15} /></div>
            <div><span className="evo-user-name" data-testid="text-user-name">Daniel Smith</span><span className="evo-user-meta">Pro plan / 840 credits</span></div>
          </div>
        </aside>
        <main className="evo-main">
          {activeTab === "chat" && <ChatPanel selectedMission={selectedMission} inputRef={chatInputRef} />}
           {activeTab === "missions" && <MissionsPanel selectedMission={selectedMission} setSelectedMission={setSelectedMission} inputRef={missionInputRef} missionStepUpdate={missionStepUpdate} />}
           {activeTab === "trust" && <TrustPanel systemHealth={systemHealth} />}
          {activeTab === "settings" && <SettingsPanel activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} language={language} setLanguage={setLanguage} suggestedPrompts={suggestedPrompts} setSuggestedPrompts={setSuggestedPrompts} autoApprove={autoApprove} setAutoApprove={setAutoApprove} sendUsage={sendUsage} setSendUsage={setSendUsage} appearance={appearance} setAppearance={setAppearance} />}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <EvoDesktopApp />
        </ErrorBoundary>
        <Toaster />
        <UpdateNotification />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;