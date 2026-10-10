import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Bell, Check, LogOut, Plus, Save, X } from "lucide-react";
import { io } from "socket.io-client";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8999";
const fallbackImage = "/vegpuff-logo.png";
const money = (n) => `Rs. ${Number(n || 0).toFixed(0)}`;
const getToken = () => localStorage.getItem("vpcToken");

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

function ProductImage({ src, alt }) {
  return <img className="productImg" src={src || fallbackImage} alt={alt} loading="lazy" onError={(e) => { e.currentTarget.src = fallbackImage; }} />;
}

function AdminShell({ children }) {
  if (!getToken()) return <Navigate to="/admin/login" />;
  return <div>
    <header className="top adminTop">
      <Link to="/admin/orders" className="logoBrand"><img src="/vegpuff-logo.png" alt="VegPuff Co Admin" /></Link>
      <nav><Link to="/admin/orders">Orders</Link><Link to="/admin/products">Products</Link><Link to="/admin/reports">Reports</Link><button onClick={() => { localStorage.removeItem("vpcToken"); location.href = "/admin/login"; }}><LogOut size={16}/></button></nav>
    </header>
    <main className="page adminPage">{children}</main>
  </div>;
}

function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "admin@vegpuff.co", password: "Admin@123" });
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const data = await request("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      localStorage.setItem("vpcToken", data.token);
      nav("/admin/orders");
    } catch (err) { setError(err.message); }
  };
  return <main className="page narrow loginPage"><img src="/vegpuff-logo.png" alt="VegPuff Co" className="loginLogo"/><h2>Staff login</h2><form className="form" onSubmit={submit}><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/>{error && <p className="error">{error}</p>}<button className="btn">Login</button></form></main>;
}

function Orders() {
  const [orders, setOrders] = useState([]);
  const [sound, setSound] = useState(false);
  const [flash, setFlash] = useState("");
  const [incoming, setIncoming] = useState(null);
  const audioCtx = useRef(null);
  const soundRef = useRef(false);
  const ringingOrders = useRef(new Set());
  const ringTimer = useRef(null);
  const load = () => request("/api/admin/orders").then(setOrders).catch(alert);
  const playAlert = (when = 0) => {
    const ctx = audioCtx.current;
    if (!ctx || !soundRef.current) return;
    const now = ctx.currentTime + when;
    [0, 0.18, 0.46].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "triangle";
      osc.frequency.setValueAtTime([988, 1319, 1760][index], now + offset);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime([1050, 1400, 1850][index], now + offset);
      filter.Q.setValueAtTime(5, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.95, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.24);
    });
  };
  const stopRinging = (id) => {
    ringingOrders.current.delete(id);
    if (!ringingOrders.current.size && ringTimer.current) {
      clearInterval(ringTimer.current);
      ringTimer.current = null;
    }
  };
  const startRinging = (order) => {
    if (!soundRef.current || order.status !== "Pending") return;
    ringingOrders.current.add(order._id);
    playAlert();
    setTimeout(() => stopRinging(order._id), 60_000);
    if (!ringTimer.current) {
      ringTimer.current = setInterval(() => {
        if (!ringingOrders.current.size) return stopRinging("");
        playAlert();
        playAlert(0.7);
      }, 1600);
    }
  };
  const enableSound = async () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return alert("Sound alerts are not supported in this browser.");
    audioCtx.current = audioCtx.current || new Ctx();
    await audioCtx.current.resume();
    soundRef.current = true;
    setSound(true);
    playAlert();
  };
  useEffect(() => {
    load();
    const s = io(API);
    s.on("new_order", (o) => {
      setOrders((x) => [o, ...x]);
      setIncoming(o);
      setFlash(o._id);
      setTimeout(() => setFlash(""), 4000);
      startRinging(o);
    });
    s.on("order_updated", (o) => {
      if (["Confirmed", "Cancelled"].includes(o.status)) stopRinging(o._id);
      setIncoming((current) => current?._id === o._id && ["Confirmed", "Cancelled"].includes(o.status) ? null : current);
      setOrders((x) => x.map((v) => v._id === o._id ? o : v));
    });
    return () => {
      s.disconnect();
      if (ringTimer.current) clearInterval(ringTimer.current);
    };
  }, []);
  const status = async (o, next) => {
    try {
      const up = await request(`/api/admin/orders/${o._id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      if (["Confirmed", "Cancelled"].includes(up.status)) {
        stopRinging(up._id);
        setIncoming((current) => current?._id === up._id ? null : current);
      }
      setOrders((x) => x.map((v) => v._id === up._id ? up : v));
    } catch (err) { alert(err.message); }
  };
  return <AdminShell>{incoming && <div className="incomingOrder"><article className="incomingCard"><p className="eyebrow">New order</p><h2>{incoming.orderNo}</h2><p>{incoming.customerName || incoming.customer?.name} - {incoming.mobile || incoming.customer?.mobile} {(incoming.carNumber || incoming.customer?.carNumber) && `- ${incoming.carNumber || incoming.customer?.carNumber}`}</p><p>{incoming.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}</p><b>{money(incoming.total)}</b><div><button onClick={() => status(incoming, "Confirmed")}><Check size={16}/> Confirm</button><button className="danger" onClick={() => status(incoming, "Cancelled")}><X size={16}/> Cancel</button></div></article></div>}<div className="adminHeader"><h1>Live orders</h1><button className={sound ? "btn secondary" : "btn"} onClick={enableSound}><Bell size={16}/> {sound ? "Sound Alerts On" : "Enable Sound Alerts"}</button></div><section className="orders">{orders.length === 0 && <p className="empty">No orders yet.</p>}{orders.map((o) => <article className={flash === o._id ? "order hot" : "order"} key={o._id}><h3>{o.orderNo} <span>{o.status}</span></h3><p>{o.customerName || o.customer?.name} - {o.mobile || o.customer?.mobile} {(o.carNumber || o.customer?.carNumber) && `- ${o.carNumber || o.customer?.carNumber}`}</p><p>{o.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}</p><b>{money(o.total)}</b><div>{["Confirmed", "Preparing", "Ready", "Completed", "Cancelled"].map((s) => <button key={s} onClick={() => status(o, s)}>{s}</button>)}</div></article>)}</section></AdminShell>;
}

function Products() {
  const empty = { name: "", price: "", category: "Puffs", description: "", imageUrl: "", isBestSeller: false, isSignature: false, isRecommended: false };
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(empty);
  const load = () => request("/api/admin/products").then(setItems).catch(alert);
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    await request("/api/admin/products", { method: "POST", body: JSON.stringify({ ...draft, price: Number(draft.price), isAvailable: true }) });
    setDraft(empty);
    load();
  };
  const patch = async (p, body, message = "Update this product?") => {
    if (!confirm(message)) return;
    await request(`/api/admin/products/${p._id}`, { method: "PATCH", body: JSON.stringify(body) });
    load();
  };
  const toggle = async (p) => {
    if (!confirm(`${p.isAvailable ? "Mark unavailable" : "Mark available"}?`)) return;
    await request(`/api/admin/products/${p._id}/availability`, { method: "PATCH", body: JSON.stringify({ isAvailable: !p.isAvailable }) });
    load();
  };
  const toggleTag = async (p, key) => {
    await request(`/api/admin/products/${p._id}/tags`, { method: "PATCH", body: JSON.stringify({ isBestSeller: p.isBestSeller, isSignature: p.isSignature, isRecommended: p.isRecommended, [key]: !p[key] }) });
    load();
  };
  return <AdminShell><h1>Products</h1><form className="form productForm" onSubmit={save}><input required placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/><input required placeholder="Price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}/><input placeholder="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}/><input placeholder="Image URL" value={draft.imageUrl} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}/><input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/><button className="btn"><Plus size={16}/> Add product</button></form><section className="table">{items.map((p) => <div className="productRow" key={p._id}><ProductImage src={p.imageUrl} alt={p.name}/><b>{p.name}</b><span>{p.category}</span><span>{money(p.price)}</span><button onClick={() => toggleTag(p, "isBestSeller")}>{p.isBestSeller ? <Check size={14}/> : <X size={14}/>} Best</button><button onClick={() => toggleTag(p, "isSignature")}>{p.isSignature ? <Check size={14}/> : <X size={14}/>} Signature</button><button onClick={() => toggleTag(p, "isRecommended")}>{p.isRecommended ? <Check size={14}/> : <X size={14}/>} Rec</button><button onClick={() => toggle(p)}>{p.isAvailable ? "Available" : "Unavailable"}</button><button onClick={() => patch(p, { price: Number(prompt("New price", p.price) || p.price) })}><Save size={14}/> Price</button></div>)}</section></AdminShell>;
}

function Reports() {
  const [r, setR] = useState(null);
  useEffect(() => { request("/api/admin/reports/daily").then(setR).catch(alert); }, []);
  return <AdminShell><div className="report"><h1>Today</h1><p>Orders: {r?.orders || 0}</p><p>Completed: {r?.completed || 0}</p><p>Revenue: {money(r?.revenue || 0)}</p></div></AdminShell>;
}

function AdminApp() {
  return <HashRouter><Routes><Route path="/" element={<Navigate to="/admin/orders" />} /><Route path="/admin/login" element={<Login/>} /><Route path="/admin/orders" element={<Orders/>} /><Route path="/admin/products" element={<Products/>} /><Route path="/admin/reports" element={<Reports/>} /></Routes></HashRouter>;
}

createRoot(document.getElementById("root")).render(<AdminApp />);
