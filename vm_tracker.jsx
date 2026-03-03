import { useState, useEffect, Fragment } from "react";
import { createRoot } from "react-dom/client";

const CREDS = { user: "upview", pass: "Uv9@mK2xP!" };

function LoginGate({ children }) {
  const [auth, setAuth] = useState(() => sessionStorage.getItem("vm-auth") === "1");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  const login = () => {
    if (u === CREDS.user && p === CREDS.pass) {
      sessionStorage.setItem("vm-auth", "1");
      setAuth(true);
    } else {
      setErr("Invalid username or password.");
    }
  };

  if (auth) return children;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d1f35", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#162d47", border: "1px solid #2E86AB", borderRadius: 10, padding: "32px 36px", minWidth: 340, boxShadow: "0 8px 40px #0008", fontFamily: "monospace" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>Please Sign In</div>
        <div style={{ fontSize: 11, color: "#7eb8d4", marginBottom: 22 }}>VM Migration Tracker</div>
        {[{ label: "Username", val: u, set: setU, type: "text" }, { label: "Password", val: p, set: setP, type: "password" }].map(({ label, val, set, type }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#9ab8d0", marginBottom: 5 }}>{label}</div>
            <input type={type} value={val} onChange={e => { set(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{ width: "100%", background: "#0d1f35", border: "1px solid #2E86AB", borderRadius: 5, padding: "8px 10px", color: "#fff", fontFamily: "monospace", fontSize: 13, outline: "none" }} />
          </div>
        ))}
        {err && <div style={{ color: "#f1948a", fontSize: 11, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={login} style={{ padding: "8px 24px", background: "#2E86AB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>Sign In</button>
        </div>
      </div>
    </div>
  );
}

const INITIAL_VMS = [
  {
    id: 1, name: "vm-prod-01", oldIp: "192.168.1.10", newIp: "10.0.0.10",
    migrated: "Yes", supabase: "No", keep: "No", notes: "Primary app server", expanded: true,
    urls: [
      { id: 1, port: "80",   proto: "HTTP",  url: "http://app.example.com",       dns: "Yes", tested: "Yes", notes: "Redirects to HTTPS" },
      { id: 2, port: "443",  proto: "HTTPS", url: "https://app.example.com",      dns: "Yes", tested: "Yes", notes: "Main frontend" },
      { id: 3, port: "443",  proto: "HTTPS", url: "https://www.example.com",      dns: "Yes", tested: "Yes", notes: "www alias" },
      { id: 4, port: "8080", proto: "HTTP",  url: "http://app.example.com:8080",  dns: "Yes", tested: "No",  notes: "Admin panel" },
    ]
  },
  {
    id: 2, name: "vm-prod-02", oldIp: "192.168.1.11", newIp: "10.0.0.11",
    migrated: "No", supabase: "Yes", keep: "No", notes: "Supabase DB - do NOT decommission", expanded: false,
    urls: [
      { id: 1, port: "5432", proto: "TCP",  url: "db.example.com",                  dns: "No", tested: "No", notes: "Postgres / Supabase" },
      { id: 2, port: "8000", proto: "HTTP", url: "http://api.supabase.example.com", dns: "No", tested: "No", notes: "Supabase REST API" },
    ]
  },
  {
    id: 3, name: "vm-prod-03", oldIp: "192.168.1.12", newIp: "10.0.0.12",
    migrated: "No", supabase: "No", keep: "No", notes: "Waiting on cert renewal", expanded: false,
    urls: [
      { id: 1, port: "80",  proto: "HTTP",  url: "http://admin.example.com",    dns: "No", tested: "No", notes: "" },
      { id: 2, port: "443", proto: "HTTPS", url: "https://admin.example.com",   dns: "No", tested: "No", notes: "Admin dashboard" },
      { id: 3, port: "443", proto: "HTTPS", url: "https://console.example.com", dns: "No", tested: "No", notes: "Console alias" },
    ]
  },
];

const mkVm = () => ({ id: Date.now(), name: "", oldIp: "", newIp: "", migrated: "No", supabase: "No", keep: "No", notes: "", expanded: true, urls: [] });
const mkUrl = () => ({ id: Date.now() + Math.random(), port: "", proto: "HTTPS", url: "", dns: "No", tested: "No", notes: "" });

function buildFullUrl(proto, newIp, port) {
  if (!newIp) return "";
  const p = proto.toLowerCase();
  if ((p === "https" && port === "443") || (p === "http" && port === "80")) return `${p}://${newIp}`;
  return port ? `${p}://${newIp}:${port}` : `${p}://${newIp}`;
}

function safeStatus(vm) {
  if (vm.supabase === "Yes") return { label: "NO - Supabase", color: "#922B21", bg: "#FADBD8" };
  if (vm.keep === "Yes") return { label: "Not Migrating", color: "#1A5276", bg: "#D6EAF8" };
  if (vm.migrated === "Yes") return { label: "Safe to Remove", color: "#1E8449", bg: "#D5F5E3" };
  return { label: "Pending", color: "#9A7D0A", bg: "#FEF9E7" };
}

const YesNo = ({ value, onChange }) => (
  <button onClick={() => onChange(value === "Yes" ? "No" : "Yes")} style={{
    padding: "3px 11px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: 700, fontFamily: "monospace",
    background: value === "Yes" ? "#D5F5E3" : "#FADBD8",
    color: value === "Yes" ? "#1E8449" : "#922B21",
    whiteSpace: "nowrap", minWidth: 60,
  }}>{value === "Yes" ? "Yes" : "No"}</button>
);

const Inp = ({ value, onChange, placeholder, style = {} }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "monospace", fontSize: 12, color: "inherit", padding: "1px 3px", ...style }} />
);

function App() {
  const [vms, setVms] = useState(INITIAL_VMS);
  const [seq, setSeq] = useState(200);
  const [deleted, setDeleted] = useState([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // On mount: load from server API; fall back to localStorage for local dev
  useEffect(() => {
    fetch("/api/data")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.vms) {
          setVms(data.vms);
          if (data.deleted) setDeleted(data.deleted);
          const allIds = [...(data.vms || []), ...(data.deleted || [])].map(v => v.id);
          if (allIds.length) setSeq(Math.max(...allIds, 200));
        } else {
          try {
            const s = localStorage.getItem("vm-tracker-vms");
            const d = localStorage.getItem("vm-tracker-deleted");
            if (s) setVms(JSON.parse(s));
            if (d) setDeleted(JSON.parse(d));
          } catch {}
        }
      })
      .catch(() => {
        try {
          const s = localStorage.getItem("vm-tracker-vms");
          const d = localStorage.getItem("vm-tracker-deleted");
          if (s) setVms(JSON.parse(s));
          if (d) setDeleted(JSON.parse(d));
        } catch {}
      })
      .finally(() => setLoaded(true));
  }, []);

  // On every change: save to server (shared) + localStorage (local backup)
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("vm-tracker-vms", JSON.stringify(vms));
    localStorage.setItem("vm-tracker-deleted", JSON.stringify(deleted));
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vms, deleted }),
    }).catch(() => {});
  }, [vms, deleted, loaded]);

  const updVm = (id, f, v) => setVms(a => a.map(vm => vm.id === id ? { ...vm, [f]: v } : vm));
  const togExp = (id) => setVms(a => a.map(vm => vm.id === id ? { ...vm, expanded: !vm.expanded } : vm));
  const addVm = () => { const id = seq + 1; setSeq(id); setVms(a => [...a, { ...mkVm(), id }]); };
  const delVm = (id) => {
    const vm = vms.find(v => v.id === id);
    if (vm) setDeleted(a => [{ ...vm, deletedAt: new Date().toLocaleString() }, ...a]);
    setVms(a => a.filter(v => v.id !== id));
  };
  const restoreVm = (id) => {
    const vm = deleted.find(v => v.id === id);
    if (vm) { const { deletedAt, ...rest } = vm; setVms(a => [...a, rest]); }
    setDeleted(a => a.filter(v => v.id !== id));
  };
  const permDeleteVm = (id) => {
    if (window.confirm("Are you sure you want to permanently delete this VM? This cannot be undone."))
      setDeleted(a => a.filter(v => v.id !== id));
  };
  const clearTrash = () => {
    if (window.confirm("Permanently delete ALL VMs in the trash? This cannot be undone."))
      setDeleted([]);
  };
  const exportData = () => {
    const data = JSON.stringify({ vms, deleted }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vm-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const importData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.vms) { setVms(parsed.vms); }
          if (parsed.deleted) { setDeleted(parsed.deleted); }
          alert("Data imported successfully!");
        } catch { alert("Invalid file. Please use a valid VM Tracker backup JSON."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const addUrl = (vmId) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, expanded: true, urls: [...vm.urls, mkUrl()] } : vm));
  const updUrl = (vmId, uid, f, v) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, urls: vm.urls.map(u => u.id === uid ? { ...u, [f]: v } : u) } : vm));
  const delUrl = (vmId, uid) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, urls: vm.urls.filter(u => u.id !== uid) } : vm));

  const allUrls = vms.flatMap(vm => vm.urls);
  const stats = {
    vms: vms.length, migrated: vms.filter(v => v.migrated === "Yes").length,
    supa: vms.filter(v => v.supabase === "Yes").length,
    keeping: vms.filter(v => v.keep === "Yes").length,
    urls: allUrls.length, dns: allUrls.filter(u => u.dns === "Yes").length,
    tested: allUrls.filter(u => u.tested === "Yes").length,
  };

  const TH = ({ ch, w, center }) => (
    <th style={{ width: w, minWidth: w, padding: "9px 10px", textAlign: center ? "center" : "left",
      fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#e2eaf2",
      background: "#162d47", borderRight: "1px solid #1E3A5F", whiteSpace: "nowrap" }}>{ch}</th>
  );

  const vmRowBg = "#1E3A5F";
  const vmText = "#fff";

  return (
    <div style={{ fontFamily: "monospace", background: "#edf2f7", minHeight: "100vh" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #7a9ab5; }
        .url-tr:hover td { background: #dbeafe !important; }
        .ybtn:hover { background: #2E86AB !important; color: #fff !important; border-color: #2E86AB !important; }
        .delbtn:hover { background: #FADBD8 !important; color: #922B21 !important; }
        .vm-keep-row td { background: #4A2800 !important; border-bottom-color: #E67E22 !important; }
        .vm-keep-row button { color: #f0a060 !important; }
        select { appearance: none; -webkit-appearance: none; }
      `}</style>

      {/* Topbar */}
      <div style={{ background: "#162d47", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 3px 10px #0005" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>VM Migration Tracker</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#7eb8d4", display: "flex", gap: 16 }}>
            <span>VMs: <b style={{ color: "#fff" }}>{stats.vms}</b></span>
            <span>Migrated: <b style={{ color: "#52d48a" }}>{stats.migrated}/{stats.vms}</b></span>
            <span>Supabase: <b style={{ color: "#c39bd3" }}>{stats.supa}</b></span>
            <span>Not Migrating: <b style={{ color: "#7fb3d3" }}>{stats.keeping}</b></span>
            <span>URLs: <b style={{ color: "#fff" }}>{stats.urls}</b></span>
            <span>DNS done: <b style={{ color: "#52d48a" }}>{stats.dns}/{stats.urls}</b></span>
            <span>Tested: <b style={{ color: "#52d48a" }}>{stats.tested}/{stats.urls}</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportData}
            style={{ padding: "7px 14px", background: "#1a6e3c", color: "#fff", border: "1px solid #27ae60", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}
            title="Download all VM data as a JSON backup">
            ⬇ Export
          </button>
          <button onClick={importData}
            style={{ padding: "7px 14px", background: "#1a3a5c", color: "#7eb8d4", border: "1px solid #2E86AB", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}
            title="Load a previously exported JSON backup">
            ⬆ Import
          </button>
          <button onClick={() => setVms(a => a.map(v => ({ ...v, expanded: true })))}
            style={{ padding: "7px 14px", background: "#2E86AB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "monospace" }}>
            Expand All
          </button>
          <button onClick={() => setVms(a => a.map(v => ({ ...v, expanded: false })))}
            style={{ padding: "7px 14px", background: "#2a4a6b", color: "#9ab8d0", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "monospace" }}>
            Collapse All
          </button>
          <button onClick={addVm}
            style={{ padding: "7px 18px", background: "#27ae60", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>
            + Add VM
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1820 }}>
          <thead>
            <tr>
              <TH ch="" w={38} />
              <TH ch="VM Name" w={190} />
              <TH ch="Old IP" w={130} center />
              <TH ch="New IP" w={130} center />
              <TH ch="Port" w={72} center />
              <TH ch="Protocol" w={88} center />
              <TH ch="URL / Domain" w={270} />
              <TH ch="Full New URL" w={210} />
              <TH ch="DNS Updated?" w={110} center />
              <TH ch="URL Tested?" w={105} center />
              <TH ch="VM Migrated?" w={110} center />
              <TH ch="Supabase?" w={100} center />
              <TH ch="Not Migrating?" w={115} center />
              <TH ch="Safe to Remove?" w={145} center />
              <TH ch="Notes" w={190} />
              <TH ch="Actions" w={95} center />
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => {
              const safe = safeStatus(vm);
              return (
                <Fragment key={"frag-" + vm.id}>
                  {/* VM ROW */}
                  <tr key={"vm" + vm.id} className={vm.keep === "Yes" ? "vm-keep-row" : ""}>
                    <td style={{ background: vmRowBg, textAlign: "center", padding: 0, borderBottom: "3px solid #2E86AB" }}>
                      <button onClick={() => togExp(vm.id)} style={{
                        width: 38, height: 40, background: "none", border: "none", cursor: "pointer",
                        color: "#7eb8d4", fontSize: 18, lineHeight: 1,
                      }}>{vm.expanded ? "▾" : "▸"}</button>
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 10px", borderBottom: "3px solid #2E86AB" }}>
                      <Inp value={vm.name} onChange={v => updVm(vm.id, "name", v)} placeholder="vm-name"
                        style={{ color: "#fff", fontWeight: 700, fontSize: 13 }} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 10px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <Inp value={vm.oldIp} onChange={v => updVm(vm.id, "oldIp", v)} placeholder="0.0.0.0"
                        style={{ color: "#f9a54a", textAlign: "center" }} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 10px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <Inp value={vm.newIp} onChange={v => updVm(vm.id, "newIp", v)} placeholder="0.0.0.0"
                        style={{ color: "#52d48a", textAlign: "center" }} />
                    </td>
                    <td style={{ background: vmRowBg, textAlign: "center", borderBottom: "3px solid #2E86AB" }}>
                      <span style={{ fontSize: 11, color: "#7eb8d4" }}>{vm.urls.length} URL{vm.urls.length !== 1 ? "s" : ""}</span>
                    </td>
                    <td style={{ background: vmRowBg, borderBottom: "3px solid #2E86AB" }} />
                    <td style={{ background: vmRowBg, borderBottom: "3px solid #2E86AB" }} />
                    <td style={{ background: vmRowBg, borderBottom: "3px solid #2E86AB" }} />
                    <td style={{ background: vmRowBg, borderBottom: "3px solid #2E86AB" }} />
                    <td style={{ background: vmRowBg, borderBottom: "3px solid #2E86AB" }} />
                    <td style={{ background: vmRowBg, padding: "7px 8px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <YesNo value={vm.migrated} onChange={v => updVm(vm.id, "migrated", v)} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 8px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <YesNo value={vm.supabase} onChange={v => updVm(vm.id, "supabase", v)} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 8px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <YesNo value={vm.keep} onChange={v => updVm(vm.id, "keep", v)} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 8px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: safe.bg, color: safe.color, whiteSpace: "nowrap" }}>{safe.label}</span>
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 10px", borderBottom: "3px solid #2E86AB" }}>
                      <Inp value={vm.notes} onChange={v => updVm(vm.id, "notes", v)} placeholder="notes..."
                        style={{ color: "#9ab8d0" }} />
                    </td>
                    <td style={{ background: vmRowBg, padding: "7px 8px", borderBottom: "3px solid #2E86AB", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={() => addUrl(vm.id)} title="Add URL row" style={{
                          width: 28, height: 28, background: "#27ae60", color: "#fff", border: "none",
                          borderRadius: 5, cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: "26px",
                        }}>+</button>
                        <button onClick={() => delVm(vm.id)} className="delbtn" title="Delete VM" style={{
                          width: 28, height: 28, background: "#2a4a6b", color: "#9ab8d0", border: "none",
                          borderRadius: 5, cursor: "pointer", fontSize: 13, lineHeight: "26px",
                        }}>✕</button>
                      </div>
                    </td>
                  </tr>

                  {/* URL ROWS */}
                  {vm.expanded && vm.urls.map((u, ui) => {
                    const bg = ui % 2 === 0 ? "#EBF5FB" : "#FFFFFF";
                    const full = buildFullUrl(u.proto, vm.newIp, u.port);
                    return (
                      <tr key={"url" + vm.id + u.id} className="url-tr">
                        <td style={{ background: "#2E86AB", width: 38, borderBottom: "1px solid #c5d9e8" }} />
                        <td style={{ background: bg, padding: "5px 10px 5px 20px", borderBottom: "1px solid #c5d9e8", color: "#aaa", fontSize: 12 }}>↳</td>
                        <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #c5d9e8", textAlign: "center", color: "#A04000", fontSize: 12, fontWeight: 500 }}>{vm.oldIp}</td>
                        <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #c5d9e8", textAlign: "center", color: "#1E8449", fontSize: 12, fontWeight: 500 }}>{vm.newIp}</td>
                        <td style={{ background: bg, padding: "5px 6px", borderBottom: "1px solid #c5d9e8", textAlign: "center" }}>
                          <Inp value={u.port} onChange={v => updUrl(vm.id, u.id, "port", v)} placeholder="443"
                            style={{ textAlign: "center", fontWeight: 700, color: "#2E86AB", width: 64 }} />
                        </td>
                        <td style={{ background: bg, padding: "5px 6px", borderBottom: "1px solid #c5d9e8", textAlign: "center" }}>
                          <select value={u.proto} onChange={e => updUrl(vm.id, u.id, "proto", e.target.value)}
                            style={{ background: "transparent", border: "none", outline: "none", fontFamily: "monospace", fontSize: 12, color: "#1E3A5F", fontWeight: 600, cursor: "pointer", width: "100%" }}>
                            {["HTTP","HTTPS","TCP","UDP","WS","WSS"].map(p => <option key={p}>{p}</option>)}
                          </select>
                        </td>
                        <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #c5d9e8" }}>
                          <Inp value={u.url} onChange={v => updUrl(vm.id, u.id, "url", v)} placeholder="https://example.com"
                            style={{ color: "#1A5276" }} />
                        </td>
                        <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #c5d9e8" }}>
                          <span style={{ fontSize: 12, color: "#1E3A5F", fontWeight: 600 }}>{full || <span style={{ color: "#bbb", fontWeight: 400 }}>auto-built</span>}</span>
                        </td>
                        <td style={{ background: bg, padding: "5px 8px", borderBottom: "1px solid #c5d9e8", textAlign: "center" }}>
                          <YesNo value={u.dns} onChange={v => updUrl(vm.id, u.id, "dns", v)} />
                        </td>
                        <td style={{ background: bg, padding: "5px 8px", borderBottom: "1px solid #c5d9e8", textAlign: "center" }}>
                          <YesNo value={u.tested} onChange={v => updUrl(vm.id, u.id, "tested", v)} />
                        </td>
                        <td style={{ background: bg, borderBottom: "1px solid #c5d9e8" }} />
                        <td style={{ background: bg, borderBottom: "1px solid #c5d9e8" }} />
                        <td style={{ background: bg, borderBottom: "1px solid #c5d9e8" }} />
                        <td style={{ background: bg, borderBottom: "1px solid #c5d9e8" }} />
                        <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #c5d9e8" }}>
                          <Inp value={u.notes} onChange={v => updUrl(vm.id, u.id, "notes", v)} placeholder="notes..." style={{ color: "#555" }} />
                        </td>
                        <td style={{ background: bg, padding: "5px 8px", borderBottom: "1px solid #c5d9e8", textAlign: "center" }}>
                          <button onClick={() => delUrl(vm.id, u.id)} className="delbtn" title="Delete URL" style={{
                            width: 26, height: 26, background: "#f5e6e6", color: "#c0392b", border: "none",
                            borderRadius: 5, cursor: "pointer", fontSize: 13, lineHeight: "24px",
                          }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Inline add URL button */}
                  {vm.expanded && (
                    <tr key={"addurl" + vm.id}>
                      <td style={{ background: "#2E86AB" }} />
                      <td colSpan={15} style={{ background: "#f0f7fc", padding: "5px 10px 6px 22px", borderBottom: "2px solid #c5d9e8" }}>
                        <button onClick={() => addUrl(vm.id)} className="ybtn" style={{
                          background: "none", border: "1px dashed #2E86AB", color: "#2E86AB",
                          borderRadius: 5, padding: "4px 16px", cursor: "pointer", fontSize: 11,
                          fontFamily: "monospace", fontWeight: 600, transition: "all 0.15s",
                        }}>+ Add URL to {vm.name || "this VM"}</button>
                      </td>
                    </tr>
                  )}

                  {/* Migrated-from sections */}
                  {vm.expanded && vm.newIp && vms
                    .filter(src => src.id !== vm.id && src.newIp === vm.newIp && src.oldIp !== src.newIp)
                    .map(src => (
                      <Fragment key={"mig-" + vm.id + "-" + src.id}>
                        {/* Source VM header */}
                        <tr key={"mig-hdr" + vm.id + src.id}>
                          <td style={{ background: "#6E1A1A", width: 38 }} />
                          <td colSpan={15} style={{ background: "#3B0E0E", padding: "5px 14px 5px 20px", borderBottom: "1px solid #7B2020" }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#e8a0a0", letterSpacing: 1, textTransform: "uppercase" }}>
                              ⬆ Migrated from: </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#f5c6c6" }}>{src.name}</span>
                            <span style={{ marginLeft: 10, fontSize: 10, color: "#a06060" }}>{src.oldIp} → {src.newIp}</span>
                          </td>
                        </tr>
                        {/* Source VM's URL rows (read-only) */}
                        {src.urls.map((u, ui) => {
                          const bg = ui % 2 === 0 ? "#2d1212" : "#321515";
                          const full = buildFullUrl(u.proto, src.newIp, u.port);
                          return (
                            <tr key={"mig-url" + vm.id + src.id + u.id}>
                              <td style={{ background: "#6E1A1A", width: 38, borderBottom: "1px solid #5a2020" }} />
                              <td style={{ background: bg, padding: "5px 10px 5px 20px", borderBottom: "1px solid #5a2020" }}>
                                <span style={{ background: "#922B21", color: "#fff", borderRadius: 20, padding: "1px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>MIGRATED</span>
                              </td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", textAlign: "center", color: "#f9a54a", fontSize: 12, fontWeight: 500 }}>{src.oldIp}</td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", textAlign: "center", color: "#52d48a", fontSize: 12, fontWeight: 500 }}>{src.newIp}</td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", textAlign: "center", color: "#7eb8d4", fontSize: 12, fontWeight: 700 }}>{u.port}</td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", textAlign: "center", color: "#9ab8d0", fontSize: 12 }}>{u.proto}</td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", color: "#c8a0a0", fontSize: 12 }}>{u.url}</td>
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", color: "#e8c0c0", fontSize: 12, fontWeight: 600 }}>{full}</td>
                              <td style={{ background: bg, padding: "5px 8px", borderBottom: "1px solid #5a2020", textAlign: "center" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: u.dns === "Yes" ? "#1a3a1a" : "#3a1a1a", color: u.dns === "Yes" ? "#52d48a" : "#e8a0a0" }}>{u.dns}</span>
                              </td>
                              <td style={{ background: bg, padding: "5px 8px", borderBottom: "1px solid #5a2020", textAlign: "center" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: u.tested === "Yes" ? "#1a3a1a" : "#3a1a1a", color: u.tested === "Yes" ? "#52d48a" : "#e8a0a0" }}>{u.tested}</span>
                              </td>
                              <td style={{ background: bg, borderBottom: "1px solid #5a2020" }} />
                              <td style={{ background: bg, borderBottom: "1px solid #5a2020" }} />
                              <td style={{ background: bg, borderBottom: "1px solid #5a2020" }} />
                              <td style={{ background: bg, borderBottom: "1px solid #5a2020" }} />
                              <td style={{ background: bg, padding: "5px 10px", borderBottom: "1px solid #5a2020", color: "#a08080", fontSize: 11 }}>{u.notes}</td>
                              <td style={{ background: bg, borderBottom: "1px solid #5a2020" }} />
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))
                  }
                </Fragment>
              );
            })}

            {/* Bottom add VM row */}
            <tr>
              <td colSpan={16} style={{ padding: "16px 24px", background: "#edf2f7" }}>
                <button onClick={addVm} style={{
                  padding: "10px 32px", background: "#1E3A5F", color: "#fff", border: "2px dashed #2E86AB",
                  borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "monospace", fontWeight: 700,
                  width: "100%", transition: "background 0.15s",
                }}>+ Add New VM</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Trash / Soft-Delete Section */}
      {deleted.length > 0 && (
        <div style={{ margin: "24px 0 0 0", fontFamily: "monospace" }}>
          <div
            onClick={() => setTrashOpen(o => !o)}
            style={{ background: "#3B1A1A", padding: "12px 24px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>🗑️</span>
              <span style={{ color: "#e8a0a0", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>DELETED VMs</span>
              <span style={{ background: "#922B21", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{deleted.length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={e => { e.stopPropagation(); clearTrash(); }} style={{
                padding: "4px 14px", background: "#922B21", color: "#fff", border: "none", borderRadius: 5,
                cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700
              }}>Clear All</button>
              <span style={{ color: "#e8a0a0", fontSize: 16 }}>{trashOpen ? "▾" : "▸"}</span>
            </div>
          </div>
          {trashOpen && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#2a1010" }}>
                    {["VM Name", "Old IP", "New IP", "Deleted At", "Notes", "Actions"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#e8a0a0", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #5a2020", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deleted.map((vm, i) => (
                    <tr key={vm.id} style={{ background: i % 2 === 0 ? "#2d1212" : "#321515" }}>
                      <td style={{ padding: "8px 14px", color: "#f5c6c6", fontWeight: 700, fontSize: 13 }}>{vm.name || "(unnamed)"}</td>
                      <td style={{ padding: "8px 14px", color: "#f9a54a", fontSize: 12 }}>{vm.oldIp || "—"}</td>
                      <td style={{ padding: "8px 14px", color: "#52d48a", fontSize: 12 }}>{vm.newIp || "—"}</td>
                      <td style={{ padding: "8px 14px", color: "#a08080", fontSize: 11 }}>{vm.deletedAt}</td>
                      <td style={{ padding: "8px 14px", color: "#c09090", fontSize: 12 }}>{vm.notes || "—"}</td>
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => restoreVm(vm.id)} style={{
                            padding: "4px 12px", background: "#1E3A5F", color: "#7eb8d4", border: "1px solid #2E86AB",
                            borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700
                          }}>↩ Restore</button>
                          <button onClick={() => permDeleteVm(vm.id)} style={{
                            padding: "4px 12px", background: "#5a1a1a", color: "#f5c6c6", border: "1px solid #922B21",
                            borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "monospace", fontWeight: 700
                          }}>✕ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<LoginGate><App /></LoginGate>);
