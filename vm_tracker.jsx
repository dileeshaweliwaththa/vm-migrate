import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

const INITIAL_VMS = [
  {
    id: 1, name: "vm-prod-01", oldIp: "192.168.1.10", newIp: "10.0.0.10",
    migrated: "Yes", supabase: "No", notes: "Primary app server", expanded: true,
    urls: [
      { id: 1, port: "80",   proto: "HTTP",  url: "http://app.example.com",       dns: "Yes", tested: "Yes", notes: "Redirects to HTTPS" },
      { id: 2, port: "443",  proto: "HTTPS", url: "https://app.example.com",      dns: "Yes", tested: "Yes", notes: "Main frontend" },
      { id: 3, port: "443",  proto: "HTTPS", url: "https://www.example.com",      dns: "Yes", tested: "Yes", notes: "www alias" },
      { id: 4, port: "8080", proto: "HTTP",  url: "http://app.example.com:8080",  dns: "Yes", tested: "No",  notes: "Admin panel" },
    ]
  },
  {
    id: 2, name: "vm-prod-02", oldIp: "192.168.1.11", newIp: "10.0.0.11",
    migrated: "No", supabase: "Yes", notes: "Supabase DB - do NOT decommission", expanded: false,
    urls: [
      { id: 1, port: "5432", proto: "TCP",  url: "db.example.com",                  dns: "No", tested: "No", notes: "Postgres / Supabase" },
      { id: 2, port: "8000", proto: "HTTP", url: "http://api.supabase.example.com", dns: "No", tested: "No", notes: "Supabase REST API" },
    ]
  },
  {
    id: 3, name: "vm-prod-03", oldIp: "192.168.1.12", newIp: "10.0.0.12",
    migrated: "No", supabase: "No", notes: "Waiting on cert renewal", expanded: false,
    urls: [
      { id: 1, port: "80",  proto: "HTTP",  url: "http://admin.example.com",    dns: "No", tested: "No", notes: "" },
      { id: 2, port: "443", proto: "HTTPS", url: "https://admin.example.com",   dns: "No", tested: "No", notes: "Admin dashboard" },
      { id: 3, port: "443", proto: "HTTPS", url: "https://console.example.com", dns: "No", tested: "No", notes: "Console alias" },
    ]
  },
];

const mkVm = () => ({ id: Date.now(), name: "", oldIp: "", newIp: "", migrated: "No", supabase: "No", notes: "", expanded: true, urls: [] });
const mkUrl = () => ({ id: Date.now() + Math.random(), port: "", proto: "HTTPS", url: "", dns: "No", tested: "No", notes: "" });

function buildFullUrl(proto, newIp, port) {
  if (!newIp) return "";
  const p = proto.toLowerCase();
  if ((p === "https" && port === "443") || (p === "http" && port === "80")) return `${p}://${newIp}`;
  return port ? `${p}://${newIp}:${port}` : `${p}://${newIp}`;
}

function safeStatus(vm) {
  if (vm.supabase === "Yes") return { label: "NO - Supabase", color: "#922B21", bg: "#FADBD8" };
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
  const [vms, setVms] = useState(() => {
    try {
      const saved = localStorage.getItem("vm-tracker-vms");
      return saved ? JSON.parse(saved) : INITIAL_VMS;
    } catch { return INITIAL_VMS; }
  });
  const [seq, setSeq] = useState(200);

  useEffect(() => {
    localStorage.setItem("vm-tracker-vms", JSON.stringify(vms));
  }, [vms]);

  const updVm = (id, f, v) => setVms(a => a.map(vm => vm.id === id ? { ...vm, [f]: v } : vm));
  const togExp = (id) => setVms(a => a.map(vm => vm.id === id ? { ...vm, expanded: !vm.expanded } : vm));
  const addVm = () => { const id = seq + 1; setSeq(id); setVms(a => [...a, { ...mkVm(), id }]); };
  const delVm = (id) => setVms(a => a.filter(vm => vm.id !== id));
  const addUrl = (vmId) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, expanded: true, urls: [...vm.urls, mkUrl()] } : vm));
  const updUrl = (vmId, uid, f, v) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, urls: vm.urls.map(u => u.id === uid ? { ...u, [f]: v } : u) } : vm));
  const delUrl = (vmId, uid) => setVms(a => a.map(vm => vm.id === vmId ? { ...vm, urls: vm.urls.filter(u => u.id !== uid) } : vm));

  const allUrls = vms.flatMap(vm => vm.urls);
  const stats = {
    vms: vms.length, migrated: vms.filter(v => v.migrated === "Yes").length,
    supa: vms.filter(v => v.supabase === "Yes").length,
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
            <span>URLs: <b style={{ color: "#fff" }}>{stats.urls}</b></span>
            <span>DNS done: <b style={{ color: "#52d48a" }}>{stats.dns}/{stats.urls}</b></span>
            <span>Tested: <b style={{ color: "#52d48a" }}>{stats.tested}/{stats.urls}</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1700 }}>
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
              <TH ch="Safe to Remove?" w={145} center />
              <TH ch="Notes" w={190} />
              <TH ch="Actions" w={95} center />
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => {
              const safe = safeStatus(vm);
              return (
                <>
                  {/* VM ROW */}
                  <tr key={"vm" + vm.id}>
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
                      <td colSpan={14} style={{ background: "#f0f7fc", padding: "5px 10px 6px 22px", borderBottom: "2px solid #c5d9e8" }}>
                        <button onClick={() => addUrl(vm.id)} className="ybtn" style={{
                          background: "none", border: "1px dashed #2E86AB", color: "#2E86AB",
                          borderRadius: 5, padding: "4px 16px", cursor: "pointer", fontSize: 11,
                          fontFamily: "monospace", fontWeight: 600, transition: "all 0.15s",
                        }}>+ Add URL to {vm.name || "this VM"}</button>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}

            {/* Bottom add VM row */}
            <tr>
              <td colSpan={15} style={{ padding: "16px 24px", background: "#edf2f7" }}>
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
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
