import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ClipboardList, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { io } from "socket.io-client";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8999";
const fallbackImage = "/vegpuff-logo.png";
const money = (n) => `Rs. ${Number(n || 0).toFixed(0)}`;

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

function useToast() {
  const [toast, setToast] = useState("");
  const show = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  };
  return { toast, show };
}

function CustomerShell({ children, count }) {
  return <div>
    <header className="top customerTop">
      <Link to="/menu" className="logoBrand"><img src="/vegpuff-logo.png" alt="VegPuff Co" /></Link>
      <nav><Link to="/menu">Menu</Link><Link to="/status">Order Status</Link><Link to="/cart">Cart {count ? `(${count})` : ""}</Link></nav>
    </header>
    {children}
  </div>;
}

function ProductImage({ src, alt }) {
  return <img className="productImg" src={src || fallbackImage} alt={alt} loading="lazy" onError={(e) => { e.currentTarget.src = fallbackImage; }} />;
}

function Menu({ cart, setCart }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState("All");
  const [q, setQ] = useState("");
  const { toast, show } = useToast();
  const cartCount = Object.values(cart).reduce((s, i) => s + i.quantity, 0);

  useEffect(() => {
    Promise.all([request("/api/menu"), request("/api/categories")])
      .then(([menu, cats]) => { setProducts(menu); setCategories(cats); })
      .catch((err) => show(err.message));
  }, []);

  const filters = ["All", "Best Sellers", "Signature", "Recommended", ...categories.map((c) => c.name)];
  const shown = products.filter((p) => {
    const tagMatch = active === "Best Sellers" ? p.isBestSeller : active === "Signature" ? p.isSignature : active === "Recommended" ? p.isRecommended : false;
    return (active === "All" || p.category === active || tagMatch) && p.name.toLowerCase().includes(q.toLowerCase());
  });
  const add = (p) => {
    setCart((c) => ({ ...c, [p._id]: { product: p, quantity: (c[p._id]?.quantity || 0) + 1 } }));
    show(`${p.name} added`);
  };

  return <main className="page menuPage">
    {toast && <div className="toast">{toast}</div>}
    <section className="customerHero">
      <div>
        <p className="eyebrow">Baked fresh everyday</p>
        <h1>Order from VegPuff Co</h1>
        <p>Puffs, rolls, croissants, desserts, coffee and shakes delivered to your car. Puffed with Goodness.</p>
      </div>
      <Link className="btn" to="/checkout"><ShoppingCart size={18}/> Checkout</Link>
    </section>
    <div className="toolbar">
      <input placeholder="Search puffs, coffee, desserts..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">{filters.map((f) => <button className={active === f ? "chip on" : "chip"} onClick={() => setActive(f)} key={f}>{f}</button>)}</div>
    </div>
    <section id="products" className="grid">{shown.map((p) => <article className="card" key={p._id}>
      <ProductImage src={p.imageUrl} alt={p.name} />
      <div className="cardBody">
        <div className="cardTitle"><h3>{p.name}</h3><strong>{money(p.price)}</strong></div>
        <p>{p.description}</p>
        <div className="tags">{p.isBestSeller && <small>Best Seller</small>}{p.isSignature && <small>Signature</small>}{p.isRecommended && <small>Recommended</small>}</div>
      </div>
      <footer><span>{p.category}</span><button disabled={!p.isAvailable} onClick={() => add(p)}><Plus size={16}/> Add</button></footer>
    </article>)}</section>
    {cartCount > 0 && <Link className="bottomCart" to="/checkout"><ShoppingCart size={18}/>{cartCount} items - Checkout</Link>}
  </main>;
}

function CartLines({ cart, setCart }) {
  const items = Object.values(cart);
  const qty = (id, d) => setCart((c) => {
    const next = { ...c };
    next[id].quantity += d;
    if (next[id].quantity <= 0) delete next[id];
    return next;
  });
  if (!items.length) return <p className="empty">Your cart is waiting for something delicious.</p>;
  return <>{items.map((i) => <div className="line cartLine" key={i.product._id}>
    <b>{i.product.name}</b><span>{money(i.product.price * i.quantity)}</span>
    <button onClick={() => qty(i.product._id, -1)}><Minus size={14}/></button><em>{i.quantity}</em><button onClick={() => qty(i.product._id, 1)}><Plus size={14}/></button>
  </div>)}</>;
}

function Cart({ cart, setCart }) {
  const total = Object.values(cart).reduce((s, i) => s + i.product.price * i.quantity, 0);
  return <main className="page narrow"><h2>Your cart</h2><CartLines cart={cart} setCart={setCart}/><h3>Total {money(total)}</h3><Link className="btn" to="/checkout">Continue to checkout</Link></main>;
}

function Checkout({ cart, setCart }) {
  const nav = useNavigate();
  const [customer, setCustomer] = useState({ name: "", mobile: "", carNumber: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const place = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const order = await request("/api/orders", { method: "POST", body: JSON.stringify({ customer, items: items.map((i) => ({ productId: i.product._id, quantity: i.quantity })) }) });
      const saved = JSON.parse(localStorage.vpcOrderNos || "[]").filter((n) => n !== order.orderNo);
      localStorage.vpcOrderNos = JSON.stringify([order.orderNo, ...saved].slice(0, 20));
      localStorage.vpcMobile = customer.mobile;
      setCart({});
      nav(`/order-success/${order.orderNo}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return <main className="page checkout"><section><h2>Checkout</h2><CartLines cart={cart} setCart={setCart}/><h3>Total {money(total)}</h3></section><form onSubmit={place} className="form checkoutForm">
    <input required placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })}/>
    <input required inputMode="numeric" placeholder="Mobile number" value={customer.mobile} onChange={(e) => setCustomer({ ...customer, mobile: e.target.value })}/>
    <input placeholder="Car number optional" value={customer.carNumber} onChange={(e) => setCustomer({ ...customer, carNumber: e.target.value.toUpperCase() })}/>
    {error && <p className="error">{error}</p>}
    <button className="btn" disabled={!items.length || busy}>{busy ? "Placing order..." : "Place order"}</button>
  </form></main>;
}

function Success() {
  const { orderNo } = useParams();
  return <main className="page narrow success"><h1>{orderNo}</h1><p>Our team will call you shortly to confirm your order.</p><div className="actions"><Link className="btn" to={`/status?order=${orderNo}`}><ClipboardList size={18}/> Track status</Link><Link className="btn secondary" to="/menu">Order more</Link></div></main>;
}

function OrderStatus() {
  const params = new URLSearchParams(location.search);
  const [orderNo, setOrderNo] = useState(params.get("order") || "");
  const [mobile, setMobile] = useState(localStorage.vpcMobile || "");
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sameMobile = (order, number) => String(order.mobile || order.customer?.mobile || "") === number.trim();
  const savedOrders = () => JSON.parse(localStorage.vpcOrderNos || "[]");
  const loadOne = async (number) => {
    const clean = number.trim().toUpperCase();
    if (!clean) return null;
    return request(`/api/orders/${encodeURIComponent(clean)}`);
  };
  const sortOrders = (items) => items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  useEffect(() => {
    if (orderNo.trim()) lookup();
  }, []);
  useEffect(() => {
    const s = io(API);
    s.on("order_updated", (updated) => {
      setOrders((current) => {
        const visible = current.some((order) => order._id === updated._id);
        const matchesMobile = mobile.trim() && sameMobile(updated, mobile);
        const sameOrder = orderNo.trim() && updated.orderNo === orderNo.trim().toUpperCase();
        if (!visible && !matchesMobile && !sameOrder) return current;
        const next = visible ? current.map((order) => order._id === updated._id ? updated : order) : [updated, ...current];
        return sortOrders(next.filter((order) => !mobile.trim() || sameMobile(order, mobile)));
      });
    });
    s.on("new_order", (created) => {
      setOrders((current) => {
        const matchesMobile = mobile.trim() && sameMobile(created, mobile);
        if (!matchesMobile || current.some((order) => order._id === created._id)) return current;
        return sortOrders([created, ...current]);
      });
    });
    return () => s.disconnect();
  }, [mobile, orderNo]);
  const lookup = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cleanMobile = mobile.trim();
      const cleanOrderNo = orderNo.trim().toUpperCase();
      if (cleanOrderNo) {
        const order = await loadOne(cleanOrderNo);
        if (cleanMobile && !sameMobile(order, cleanMobile)) throw new Error("No order found for this phone number and order number");
        const saved = savedOrders().filter((n) => n !== order.orderNo);
        localStorage.vpcOrderNos = JSON.stringify([order.orderNo, ...saved].slice(0, 20));
        if (cleanMobile) localStorage.vpcMobile = cleanMobile;
        setOrders([order]);
        return;
      }
      if (cleanMobile) {
        const found = await request(`/api/orders?mobile=${encodeURIComponent(cleanMobile)}`);
        localStorage.vpcMobile = mobile.trim();
        localStorage.vpcOrderNos = JSON.stringify(found.map((o) => o.orderNo).slice(0, 20));
        setOrders(sortOrders(found.filter((order) => sameMobile(order, cleanMobile))));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return <main className="page statusPage">
    <section className="statusIntro">
      <div><p className="eyebrow">Track your food</p><h1>Order Status</h1><p>Enter your phone number to view all your orders, latest first.</p></div>
      <form className="statusLookup" onSubmit={lookup}>
        <input inputMode="numeric" placeholder="Phone number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}/>
        <input placeholder="Order number optional, e.g. VPC-12" value={orderNo} onChange={(e) => setOrderNo(e.target.value.toUpperCase())}/>
        <button className="btn"><Search size={16}/> {loading ? "Searching..." : "View orders"}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
    <section className="customerOrders">{orders.length === 0 && <p className="empty">No orders loaded yet. Enter your phone number to view all orders.</p>}{orders.map((o) => <article className="statusCard" key={o._id}>
      <div><h3>{o.orderNo}</h3><span>{o.status}</span></div>
      <p>{o.customerName || o.customer?.name} - {o.mobile || o.customer?.mobile} {(o.carNumber || o.customer?.carNumber) && `- ${o.carNumber || o.customer?.carNumber}`}</p>
      <p>{o.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}</p>
      <b>{money(o.total)}</b>
      <ol className="statusSteps">{["Pending", "Confirmed", "Preparing", "Ready", "Completed"].map((s) => <li className={["Pending", "Confirmed", "Preparing", "Ready", "Completed"].indexOf(o.status) >= ["Pending", "Confirmed", "Preparing", "Ready", "Completed"].indexOf(s) ? "done" : ""} key={s}>{s}</li>)}</ol>
    </article>)}</section>
  </main>;
}

function CustomerApp() {
  const [cart, setCart] = useState(() => JSON.parse(localStorage.vpcCart || "{}"));
  useEffect(() => { localStorage.vpcCart = JSON.stringify(cart); }, [cart]);
  const count = useMemo(() => Object.values(cart).reduce((s, i) => s + i.quantity, 0), [cart]);
  return <BrowserRouter><CustomerShell count={count}><Routes><Route path="/" element={<Navigate to="/menu" />} /><Route path="/menu" element={<Menu cart={cart} setCart={setCart}/>} /><Route path="/status" element={<OrderStatus/>} /><Route path="/cart" element={<Cart cart={cart} setCart={setCart}/>} /><Route path="/checkout" element={<Checkout cart={cart} setCart={setCart}/>} /><Route path="/order-success/:orderNo" element={<Success/>} /></Routes></CustomerShell></BrowserRouter>;
}

createRoot(document.getElementById("root")).render(<CustomerApp />);
