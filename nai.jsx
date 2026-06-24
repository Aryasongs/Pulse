import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Menu, X, Plus, Trash2, Image, ChevronRight,
  Sparkles, Brain, Globe, Calculator, Camera, MessageSquare,
  Zap, Settings, Moon, Search, Copy, Check, RefreshCw,
  Building2, User, Bot, Paperclip, ArrowUp, Hash,
  FileText, Clock, Star, ChevronDown
} from "lucide-react";

// ── Firebase CDN init ──────────────────────────────────────────
const FB_CFG = {
  apiKey: "AIzaSyC30TcmMVhP_8HdFYS1WufRiZwSDYNMTF0",
  authDomain: "pulse2-92372.firebaseapp.com",
  databaseURL: "https://pulse2-92372-default-rtdb.firebaseio.com",
  projectId: "pulse2-92372",
  storageBucket: "pulse2-92372.firebasestorage.app",
  messagingSenderId: "276235725177",
  appId: "1:276235725177:web:0f4e0789fae80a435927a8",
};

let db = null;
let fbReady = false;

async function initFirebase() {
  if (fbReady) return;
  try {
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getDatabase, ref, push, set, get, child, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    const app = getApps().length ? getApps()[0] : initializeApp(FB_CFG);
    db = { getDatabase, ref, push, set, get, child, onValue, inst: getDatabase(app) };
    fbReady = true;
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

async function fbSaveSession(sessionId, messages) {
  if (!fbReady || !db) return;
  try {
    const r = db.ref(db.inst, `nai_sessions/${sessionId}`);
    await db.set(r, { messages, updatedAt: Date.now() });
  } catch (e) { /* silent */ }
}

async function fbLoadSessions() {
  if (!fbReady || !db) return [];
  try {
    const snap = await db.get(db.ref(db.inst, "nai_sessions"));
    if (!snap.exists()) return [];
    const data = snap.val();
    return Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) { return []; }
}

async function fbDeleteSession(sessionId) {
  if (!fbReady || !db) return;
  try {
    await db.set(db.ref(db.inst, `nai_sessions/${sessionId}`), null);
  } catch (e) { /* silent */ }
}

// ── System Prompt ──────────────────────────────────────────────
const SYSTEM = `You are NAi, an advanced AI assistant created by Dozera Group, built by Gursharn Arya (Founder). You are NOT Claude, NOT ChatGPT, NOT Gemini. You are NAi — a proprietary AI by Dozera Group.

IDENTITY:
- Name: NAi (Neural AI by Dozera Group)
- Creator: Gursharn Arya, Founder of Dozera Group
- Built under: Oriontec (Dozera Group's flagship technology company)
- If anyone asks who made you in any language, always answer about Dozera Group and Gursharn Arya.

DOZERA GROUP:
Dozera Group is a founder-led global holding company. Founded by Gursharn Arya in mid-2020s.
Brand Positioning: "Building digital infrastructure for the next generation."
Estimated Brand Valuation: $192 million

Leadership:
- Gursharn Arya — Founder, Dozera Group
- Ananya Rao — CEO, Oriontec
- Michael — Vice President, Oriontec  
- Ananya Rai — CRO, Dozera Group

Brands:
1. Oriontec — Flagship tech company (software, AI, IT, automation)
2. Oriontec Services — AI app builder, no-code platform
3. Nexor Cloud — Cloud storage, Firebase backend, referral system
4. Nexor Map — GPS/location platform like Apple Maps
5. NEXO — Social media platform (posts called "NEX")
6. NEXOR AI / NEROX AI — AI assistant ecosystem
7. Mailbee — Email platform with inbox, compose, spam filter
8. RNDW / RNWD Exam — Education & talent evaluation platform
9. Lusy Medical Care (LMDC) — Dog health cards, QR codes, vaccinations
10. MONTÈ — Luxury fashion & lifestyle brand
11. OrioPlay / Orion+ — OTT streaming & entertainment
12. TravelGuard India — Travel safety dashboard

COMPANY STORY:
In the mid-2020s, Gursharn Arya envisioned an ecosystem of brands serving technology, education, cloud, digital communication, AI, consumer products and animal welfare. That became Dozera Group. Oriontec leads tech and AI. LMDC and the LUSY Act focus on animal welfare. MONTÈ serves premium markets. Ananya Rai leads commercial growth. NAi is Dozera Group's own AI assistant.

CAPABILITIES:
1. MATH: Solve any level — arithmetic to advanced calculus, linear algebra, statistics, differential equations, number theory, proofs. Show step-by-step.
2. TRANSLATION: Translate between any languages: Hindi, English, Punjabi, Urdu, Arabic, French, German, Japanese, Chinese, Spanish, etc.
3. FACTS: Answer factual, scientific, historical, current questions.
4. IMAGE: Analyze and describe uploaded images in detail.
5. CODING: Write, debug, explain code in any language.
6. CREATIVE: Write essays, stories, emails, captions.

RESPONSE RULES:
- Respond in the same language the user uses
- For math: show numbered steps clearly
- Never say you are Claude or any other AI
- Be precise, helpful, and friendly
- Format code in code blocks`;

// ── Helpers ────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 10);
const getTitle = (msgs) => {
  const first = msgs.find(m => m.role === "user");
  if (!first) return "New conversation";
  return (first.content || "").slice(0, 42) + (first.content?.length > 42 ? "…" : "");
};

const SUGGESTIONS = [
  { icon: Calculator, label: "Solve equation", prompt: "Solve step by step: ∫(x³ - 2x + 1)dx" },
  { icon: Globe, label: "Translate text", prompt: "Translate to Hindi: 'Innovation distinguishes between a leader and a follower.'" },
  { icon: Brain, label: "About NAi", prompt: "Who created you and tell me about Dozera Group?" },
  { icon: Camera, label: "Image analysis", prompt: "What kind of images can you analyze? Give me examples." },
  { icon: Hash, label: "Advanced math", prompt: "Solve the system: 3x + 2y = 12 and x - y = 1" },
  { icon: FileText, label: "Write content", prompt: "Write a professional bio for Gursharn Arya, Founder of Dozera Group." },
];

// ── Markdown renderer ──────────────────────────────────────────
function MsgContent({ text }) {
  const parts = [];
  const lines = text.split("\n");
  let codeBlock = null;
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (codeBlock === null) {
        codeBlock = line.slice(3) || "code";
      } else {
        parts.push({ type: "code", lang: codeBlock, content: codeLines.join("\n") });
        codeBlock = null; codeLines = [];
      }
      continue;
    }
    if (codeBlock !== null) { codeLines.push(line); continue; }
    parts.push({ type: "line", content: line });
  }

  const renderLine = (raw) => {
    // bold, italic, inline code, line-through
    const tokens = [];
    let rem = raw;
    const patterns = [
      { re: /\*\*(.*?)\*\*/g, wrap: (m, t) => <strong key={m} style={{ color: "#e2e8f0", fontWeight: 600 }}>{t}</strong> },
      { re: /\*(.*?)\*/g, wrap: (m, t) => <em key={m}>{t}</em> },
      { re: /`([^`]+)`/g, wrap: (m, t) => <code key={m} style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", padding: "1px 6px", borderRadius: 4, fontSize: "0.82em", fontFamily: "ui-monospace,monospace" }}>{t}</code> },
    ];
    // Simple token approach — split on **bold** only for readability
    const parts2 = [];
    let last = 0;
    const boldRe = /\*\*(.*?)\*\*/g;
    let m;
    while ((m = boldRe.exec(raw)) !== null) {
      if (m.index > last) parts2.push(<span key={last}>{raw.slice(last, m.index)}</span>);
      parts2.push(<strong key={m.index} style={{ color: "#e2e8f0", fontWeight: 600 }}>{m[1]}</strong>);
      last = boldRe.lastIndex;
    }
    parts2.push(<span key={last}>{raw.slice(last)}</span>);
    return parts2;
  };

  return (
    <div style={{ lineHeight: 1.72, fontSize: 14 }}>
      {parts.map((p, i) => {
        if (p.type === "code") return (
          <div key={i} style={{ margin: "10px 0", background: "#0f1117", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "6px 14px", background: "rgba(99,102,241,0.12)", borderBottom: "1px solid rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#818cf8", fontSize: 11, fontFamily: "ui-monospace,monospace", letterSpacing: "0.05em" }}>{p.lang}</span>
              <span style={{ color: "#64748b", fontSize: 11 }}>code</span>
            </div>
            <pre style={{ margin: 0, padding: "14px", overflowX: "auto", color: "#a5b4fc", fontFamily: "ui-monospace,monospace", fontSize: 13, lineHeight: 1.6 }}>{p.content}</pre>
          </div>
        );
        const raw = p.content;
        if (!raw.trim()) return <br key={i} />;
        if (/^\d+\.\s/.test(raw)) return <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0" }}><span style={{ color: "#818cf8", minWidth: 20, fontWeight: 600 }}>{raw.match(/^(\d+)\./)[1]}.</span><span>{renderLine(raw.replace(/^\d+\.\s/, ""))}</span></div>;
        if (/^[-•]\s/.test(raw)) return <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0" }}><span style={{ color: "#6366f1", marginTop: 2 }}>▸</span><span>{renderLine(raw.slice(2))}</span></div>;
        if (/^#{1,3}\s/.test(raw)) { const level = raw.match(/^(#{1,3})/)[1].length; const txt = raw.replace(/^#{1,3}\s/, ""); const sz = [20, 17, 15][level - 1]; return <div key={i} style={{ fontSize: sz, fontWeight: 700, color: "#e2e8f0", margin: "12px 0 4px", letterSpacing: "-0.01em" }}>{txt}</div>; }
        return <div key={i} style={{ padding: "1px 0" }}>{renderLine(raw)}</div>;
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function NAi() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState({});
  const [imageB64, setImageB64] = useState(null);
  const [imageType, setImageType] = useState(null);
  const [imageThumb, setImageThumb] = useState(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [fbStatus, setFbStatus] = useState("connecting");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const typingRef = useRef({});

  // Init Firebase
  useEffect(() => {
    initFirebase().then(async () => {
      if (fbReady) {
        setFbStatus("connected");
        const loaded = await fbLoadSessions();
        setSessions(loaded);
        if (loaded.length > 0) {
          setActiveId(loaded[0].id);
          setMessages(loaded[0].messages || []);
        }
      } else setFbStatus("offline");
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typed]);

  // Typing animation
  const startTyping = useCallback((id, text) => {
    let i = 0;
    setTyped(p => ({ ...p, [id]: "" }));
    const iv = setInterval(() => {
      i += 4;
      setTyped(p => ({ ...p, [id]: text.slice(0, i) }));
      if (i >= text.length) { clearInterval(iv); setTyped(p => ({ ...p, [id]: text })); }
    }, 10);
    typingRef.current[id] = iv;
  }, []);

  const newChat = () => {
    const id = genId();
    setActiveId(id);
    setMessages([]);
    setTyped({});
    setSideOpen(false);
    inputRef.current?.focus();
  };

  const loadSession = (s) => {
    setActiveId(s.id);
    setMessages(s.messages || []);
    setTyped({});
    setSideOpen(false);
  };

  const deleteSession = async (e, id) => {
    e.stopPropagation();
    await fbDeleteSession(id);
    setSessions(p => p.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      setImageThumb(src);
      setImageB64(src.split(",")[1]);
      setImageType(file.type);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => { setImageB64(null); setImageType(null); setImageThumb(null); if (fileRef.current) fileRef.current.value = ""; };

  const copyMsg = (id, text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000); });
  };

  const send = async () => {
    const txt = input.trim();
    if (!txt && !imageB64) return;
    if (loading) return;

    setLoading(true);
    const uid = genId();
    const userMsg = { id: uid, role: "user", content: txt, imageB64, imageType, imageThumb };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput(""); clearImage();

    // Build API payload
    const apiMsgs = nextMsgs.map(m => {
      if (m.imageB64) return {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m.imageType || "image/jpeg", data: m.imageB64 } },
          { type: "text", text: m.content || "Describe this image in detail." },
        ],
      };
      return { role: m.role, content: m.content };
    });

    let aiText = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: SYSTEM, messages: apiMsgs }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      aiText = data.content?.map(b => b.text || "").join("") || "No response received.";
    } catch (err) {
      aiText = `Connection error: ${err.message}. Please try again.`;
    }

    const aid = genId();
    const aiMsg = { id: aid, role: "assistant", content: aiText };
    const finalMsgs = [...nextMsgs, aiMsg];
    setMessages(finalMsgs);
    startTyping(aid, aiText);

    // Save to Firebase
    if (activeId && fbReady) {
      const sessionData = { messages: finalMsgs, updatedAt: Date.now(), title: getTitle(finalMsgs) };
      await fbSaveSession(activeId, finalMsgs);
      setSessions(prev => {
        const exists = prev.find(s => s.id === activeId);
        if (exists) return prev.map(s => s.id === activeId ? { ...s, ...sessionData } : s);
        return [{ id: activeId, ...sessionData }, ...prev];
      });
    }

    setLoading(false);
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const isTyping = (id) => typed[id] !== undefined && typed[id] !== messages.find(m => m.id === id)?.content;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      background: "#0b0d14", color: "#cbd5e1",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: 260, flexShrink: 0,
        background: "#0e1018",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        display: "flex", flexDirection: "column",
        transform: sideOpen ? "translateX(0)" : "translateX(-100%)",
        position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 50,
        transition: "transform 0.25s ease",
        boxShadow: sideOpen ? "4px 0 32px rgba(0,0,0,0.5)" : "none",
      }}>
        {/* Sidebar header */}
        <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={15} color="white" />
            </div>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, letterSpacing: "0.04em" }}>NAi</div>
              <div style={{ color: "#475569", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Dozera Group</div>
            </div>
          </div>
          <button onClick={() => setSideOpen(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        {/* New chat button */}
        <div style={{ padding: "12px 12px 8px" }}>
          <button onClick={newChat} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 10, color: "#a5b4fc", padding: "9px 12px",
            cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.18)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(99,102,241,0.1)"}
          >
            <Plus size={15} /> New conversation
          </button>
        </div>

        {/* Firebase status */}
        <div style={{ padding: "4px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: fbStatus === "connected" ? "#22c55e" : fbStatus === "offline" ? "#ef4444" : "#f59e0b", flexShrink: 0 }} />
          <span style={{ color: "#475569", fontSize: 10 }}>Firebase {fbStatus === "connected" ? "synced" : fbStatus}</span>
        </div>

        {/* Sessions */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
          {sessions.length === 0 && (
            <div style={{ color: "#374151", fontSize: 12, textAlign: "center", padding: "24px 16px" }}>No conversations yet</div>
          )}
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                background: s.id === activeId ? "rgba(99,102,241,0.12)" : "transparent",
                border: s.id === activeId ? "1px solid rgba(99,102,241,0.18)" : "1px solid transparent",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (s.id !== activeId) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (s.id !== activeId) e.currentTarget.style.background = "transparent"; }}
            >
              <MessageSquare size={13} color={s.id === activeId ? "#818cf8" : "#374151"} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: s.id === activeId ? "#c7d2fe" : "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.title || "Conversation"}
              </span>
              <button onClick={e => deleteSession(e, s.id)} style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", padding: 2, borderRadius: 4, display: "flex", flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                onMouseLeave={e => e.currentTarget.style.color = "#374151"}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building2 size={13} color="white" />
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 500 }}>Dozera Group</div>
              <div style={{ color: "#374151", fontSize: 10 }}>Gursharn Arya, Founder</div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {sideOpen && <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />}

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", background: "rgba(11,13,20,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSideOpen(true)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", padding: 4, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
            >
              <Menu size={20} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={14} color="white" />
              </div>
              <div>
                <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em" }}>NAi</span>
                <span style={{ color: "#374151", fontSize: 11, marginLeft: 6 }}>by Dozera Group</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 20, padding: "4px 10px" }}>
              <Zap size={10} color="#4ade80" />
              <span style={{ color: "#4ade80", fontSize: 10, fontWeight: 600 }}>Active</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>

            {/* Welcome screen */}
            {messages.length === 0 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  boxShadow: "0 0 40px rgba(99,102,241,0.3), 0 0 80px rgba(99,102,241,0.1)",
                }}>
                  <Sparkles size={32} color="white" />
                </div>
                <h1 style={{ color: "#f1f5f9", fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.02em" }}>
                  Hello, I'm NAi
                </h1>
                <p style={{ color: "#475569", fontSize: 13, marginBottom: 4 }}>Advanced AI by Dozera Group · Built by Gursharn Arya</p>
                <p style={{ color: "#334155", fontSize: 12, marginBottom: 40 }}>Math · Translation · Facts · Images · Code · Any language</p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, maxWidth: 640, margin: "0 auto" }}>
                  {SUGGESTIONS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <button key={i} onClick={() => { setInput(s.prompt); inputRef.current?.focus(); }}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.1)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <Icon size={14} color="#818cf8" />
                        </div>
                        <div>
                          <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ color: "#374151", fontSize: 11, lineHeight: 1.4 }}>{s.prompt.slice(0, 48)}{s.prompt.length > 48 ? "…" : ""}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const displayText = typed[msg.id] !== undefined ? typed[msg.id] : msg.content;
              const stillTyping = isTyping(msg.id);

              return (
                <div key={msg.id} style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                  {/* Role label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexDirection: isUser ? "row-reverse" : "row" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      background: isUser ? "linear-gradient(135deg,#4f46e5,#7c3aed)" : "linear-gradient(135deg,#1e1b4b,#312e81)",
                      border: isUser ? "none" : "1px solid rgba(99,102,241,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isUser ? <User size={13} color="white" /> : <Bot size={13} color="#818cf8" />}
                    </div>
                    <span style={{ color: "#374151", fontSize: 11, fontWeight: 500 }}>
                      {isUser ? "You" : "NAi · Dozera Group"}
                    </span>
                  </div>

                  {/* Image thumbnail */}
                  {msg.imageThumb && (
                    <div style={{ marginBottom: 6 }}>
                      <img src={msg.imageThumb} alt="" style={{ maxWidth: 200, maxHeight: 160, borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)", display: "block" }} />
                    </div>
                  )}

                  {/* Bubble */}
                  {msg.content && (
                    <div style={{
                      maxWidth: "82%", position: "relative", group: true,
                      background: isUser ? "linear-gradient(135deg,rgba(79,70,229,0.25),rgba(99,102,241,0.2))" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isUser ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                      padding: "12px 16px",
                      color: "#cbd5e1",
                    }}>
                      {isUser ? (
                        <span style={{ fontSize: 14, lineHeight: 1.6 }}>{msg.content}</span>
                      ) : (
                        <MsgContent text={displayText} />
                      )}

                      {/* Cursor */}
                      {stillTyping && (
                        <span style={{ display: "inline-block", width: 2, height: 14, background: "#6366f1", marginLeft: 2, verticalAlign: "middle", animation: "cur 0.7s infinite" }} />
                      )}

                      {/* Copy button for AI */}
                      {!isUser && !stillTyping && (
                        <button onClick={() => copyMsg(msg.id, msg.content)}
                          style={{
                            position: "absolute", top: 8, right: 8,
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 6, color: "#475569", cursor: "pointer", padding: "4px 6px",
                            display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
                          onMouseLeave={e => e.currentTarget.style.color = "#475569"}
                        >
                          {copied === msg.id ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#1e1b4b,#312e81)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Bot size={13} color="#818cf8" />
                  </div>
                  <span style={{ color: "#374151", fontSize: 11, fontWeight: 500 }}>NAi · Dozera Group</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px 16px 16px 16px", padding: "14px 18px", display: "flex", gap: 5 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#4f46e5", animation: `dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding: "12px 16px 16px", background: "rgba(11,13,20,0.95)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* Image preview */}
            {imageThumb && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 12px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10 }}>
                <img src={imageThumb} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 7, border: "1px solid rgba(99,102,241,0.2)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>Image attached</div>
                  <div style={{ color: "#475569", fontSize: 11 }}>Ready to analyze</div>
                </div>
                <button onClick={clearImage} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, color: "#f87171", cursor: "pointer", padding: "5px 8px", display: "flex", alignItems: "center" }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Input row */}
            <div style={{
              display: "flex", alignItems: "flex-end", gap: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: "10px 10px 10px 14px",
              transition: "border-color 0.15s",
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"}
              onBlurCapture={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
            >
              <input type="file" ref={fileRef} accept="image/*" onChange={handleFile} style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} style={{
                background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", flexShrink: 0, marginBottom: 2, transition: "color 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.color = "#818cf8"}
                onMouseLeave={e => e.currentTarget.style.color = "#475569"}
                title="Attach image"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask anything — math, translate, facts, images, code…"
                rows={1}
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "#e2e8f0", fontSize: 14, lineHeight: 1.6, resize: "none",
                  maxHeight: 120, overflowY: "auto", fontFamily: "inherit",
                  scrollbarWidth: "none", padding: 0,
                }}
              />

              <button onClick={send} disabled={loading || (!input.trim() && !imageB64)}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: loading || (!input.trim() && !imageB64)
                    ? "rgba(99,102,241,0.15)"
                    : "linear-gradient(135deg,#6366f1,#4f46e5)",
                  border: "none", cursor: loading || (!input.trim() && !imageB64) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                  boxShadow: loading || (!input.trim() && !imageB64) ? "none" : "0 2px 12px rgba(99,102,241,0.4)",
                }}
              >
                <ArrowUp size={16} color={loading || (!input.trim() && !imageB64) ? "#374151" : "white"} />
              </button>
            </div>

            <div style={{ textAlign: "center", marginTop: 8, color: "#1e293b", fontSize: 10, letterSpacing: "0.04em" }}>
              NAi by Dozera Group · All languages · Firebase synced
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cur { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes dot { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-7px);opacity:1} }
        textarea::placeholder { color: #2d3748; }
        textarea::-webkit-scrollbar { display:none; }
        * { box-sizing:border-box; }
        body { margin:0; }
      `}</style>
    </div>
  );
}
