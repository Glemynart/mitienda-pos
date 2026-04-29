'use strict';

// ── Estado global ───────────────────────────────────────
let allProductos = [];
let carrito = [];
let currentCat = 'Todos';
let metodoPago = 'Efectivo';
let dashTab = 'dia';
let lastTicketData = null;
let dashData = null;
let config = {};

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setDateLabels();
  config = await window.api.config.get();
  applyConfig();
  await loadProductos();
  buildCats();
  renderGrid();
  goTo('venta');
});

// ── Fecha ────────────────────────────────────────────────
function setDateLabels() {
  const now = new Date();
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  const el = document.getElementById('sidebar-date');
  if (el) el.textContent = now.toLocaleDateString('es-CO', opts);

  const d2 = document.getElementById('dash-date');
  if (d2) d2.textContent = now.toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // fecha actual por defecto en historial
  const hf = document.getElementById('hist-fecha');
  if (hf) hf.value = now.toISOString().split('T')[0];
}

// ── Aplicar configuración UI ─────────────────────────────
function applyConfig() {
  const nombre = config.nombre_tienda || 'MiTienda';
  const initials = nombre.trim().charAt(0).toUpperCase();

  const textEls = {
    'sidebar-store-name': nombre,
    'badge-store-name': nombre,
    'sidebar-avatar': initials,
  };
  for (const [id, val] of Object.entries(textEls)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  const inputEls = {
    'cfg-nombre': config.nombre_tienda || '',
    'cfg-propietario': config.nombre_propietario || '',
    'cfg-ciudad': config.ciudad || '',
    'cfg-telefono': config.telefono || '',
    'cfg-nit': config.nit_tienda || '',
    'cfg-factus-id': config.factus_client_id || '',
  };
  for (const [id, val] of Object.entries(inputEls)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // Toggle Factus
  const factusToggle = document.getElementById('cfg-factus-activo');
  const factusFields = document.getElementById('factus-fields');
  if (factusToggle) {
    factusToggle.checked = config.factus_activo === '1';
    if (factusFields) factusFields.style.display = factusToggle.checked ? 'flex' : 'none';
  }
}

// ═══════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════
async function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  if (page === 'dashboard') { dashData = await window.api.ventas.getDashboard(); renderDashboard(); }
  if (page === 'inventario') renderInventario();
  if (page === 'historial') await loadHistorial();
  if (page === 'config') applyConfig();
}

//  PRODUCTOS
async function loadProductos() {
  allProductos = await window.api.productos.getAll();
}

function buildCats() {
  const cats = ['Todos', ...new Set(allProductos.map(p => p.categoria))];
  const bar = document.getElementById('cats-bar');
  bar.innerHTML = cats.map(c =>
    `<button class="cat-btn ${c === currentCat ? 'active' : ''}" onclick="setCat('${c}')">${c}</button>`
  ).join('');
}

function setCat(cat) { currentCat = cat; buildCats(); renderGrid(); }

function filtrarProductos() { renderGrid(); }

function getFiltered() {
  const q = (document.getElementById('buscar').value || '').toLowerCase();
  let list = allProductos;
  if (currentCat !== 'Todos') list = list.filter(p => p.categoria === currentCat);
  if (q) list = list.filter(p =>
    p.nombre.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
  );
  return list;
}

function renderGrid() {
  const grid = document.getElementById('prod-grid');
  const list = getFiltered();
  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:2.5rem">Sin resultados</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="prod-card ${p.stock <= 0 ? 'sin-stock' : ''}"
         onclick="${p.stock > 0 ? `agregarAlCarrito(${p.id})` : ''}">
      <div class="prod-emoji">${p.emoji || '🛍️'}</div>
      <div class="prod-nombre">${p.nombre}</div>
      <div class="prod-precio">${fmt(p.precio)}</div>
      <div class="prod-stock-badge">Stock: ${p.stock}</div>
    </div>
  `).join('');
}

// ─── Escáner de código de barras ─────────────────────────
function onBarcodeKey(e) {
  if (e.key === 'Enter') {
    const query = document.getElementById('buscar').value.trim();
    if (query) procesarBarcode(query);
  }
}

async function procesarBarcode(code) {
  let prod = await window.api.productos.getByBarcode(code);
  if (!prod) prod = allProductos.find(p => p.nombre.toLowerCase() === code.toLowerCase());

  if (prod) {
    agregarAlCarrito(prod.id);
    showScanFlash(prod);
    document.getElementById('buscar').value = '';
    filtrarProductos();
  } else {
    showScanFlash(null, code);
    document.getElementById('buscar').value = '';
  }
}

function showScanFlash(prod, errorCode) {
  let flash = document.getElementById('scan-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'scan-flash';
    const style = document.createElement('style');
    style.textContent = `
      #scan-flash {
        position: absolute; top: 52px; left: 0; right: 0;
        z-index: 100; padding: .7rem 1rem;
        display: flex; align-items: center; gap: .75rem;
        animation: flashIn .18s ease;
        border-bottom: 1px solid var(--border);
        transition: opacity .3s ease;
      }
      #scan-flash.ok  { background: rgba(34,197,94,.12); }
      #scan-flash.err { background: rgba(239,68,68,.10); }
      #scan-flash .sf-emoji { font-size: 1.9rem; }
      #scan-flash .sf-nombre { font-size: .88rem; font-weight: 700; color: var(--text); flex:1; }
      #scan-flash .sf-precio {
        font-size: 1.3rem; font-weight: 900;
        color: var(--green); white-space: nowrap;
      }
      #scan-flash .sf-precio.err { color: var(--red); font-size:.85rem; }
      @keyframes flashIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(style);
    document.querySelector('.carrito-card').style.position = 'relative';
    document.querySelector('.carrito-card').appendChild(flash);
  }

  clearTimeout(flash._timer);

  if (prod) {
    flash.className = 'ok';
    flash.innerHTML = `
      <div class="sf-emoji">${prod.emoji || '🛍️'}</div>
      <div class="sf-nombre">${prod.nombre}</div>
      <div class="sf-precio">${fmt(prod.precio)}</div>
    `;
  } else {
    flash.className = 'err';
    flash.innerHTML = `
      <div class="sf-emoji">❌</div>
      <div class="sf-nombre">Código no encontrado</div>
      <div class="sf-precio err">${errorCode}</div>
    `;
  }

  flash.style.opacity = '1';
  flash._timer = setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 320);
  }, 2200);
}

//  CARRITO
function agregarAlCarrito(id) {
  const prod = allProductos.find(p => p.id === id);
  if (!prod || prod.stock <= 0) return;

  const exist = carrito.find(i => i.id === id);
  if (exist) {
    if (exist.cantidad >= prod.stock) { showToast('⚠️ Stock máximo alcanzado', 'info'); return; }
    exist.cantidad++;
    exist.subtotal = exist.cantidad * exist.precio;
  } else {
    carrito.push({ id: prod.id, nombre: prod.nombre, precio: prod.precio, emoji: prod.emoji || '🛍️', cantidad: 1, subtotal: prod.precio });
  }
  renderCarrito();
  updateNavBadge();
}

function cambiarCantidad(id, delta) {
  const idx = carrito.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = carrito[idx];
  const newQ = item.cantidad + delta;
  if (newQ <= 0) { carrito.splice(idx, 1); }
  else {
    const prod = allProductos.find(p => p.id === id);
    if (prod && newQ > prod.stock) { showToast('⚠️ Stock insuficiente', 'info'); return; }
    item.cantidad = newQ;
    item.subtotal = newQ * item.precio;
  }
  renderCarrito();
  updateNavBadge();
}

function limpiarCarrito() {
  carrito = [];
  document.getElementById('pago-input').value = '';
  renderCarrito();
  updateNavBadge();
}

function updateNavBadge() {
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  const badge = document.getElementById('nav-badge-carrito');
  if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = total; }
  else badge.style.display = 'none';
}

function toggleProductGrid() {
  const panel = document.getElementById('prod-panel');
  const btn = document.getElementById('browse-btn');
  if (!panel) return;
  panel.classList.toggle('open');
  if (btn) btn.classList.toggle('active', panel.classList.contains('open'));
  setTimeout(() => { const b = document.getElementById('buscar'); if (b) b.focus(); }, 320);
}

function renderCarrito() {
  const cont = document.getElementById('carrito-items');
  if (!carrito.length) {
    cont.innerHTML = `
      <div class="empty-cart-new">
        <div class="empty-art">📡</div>
        <p>Esperando escaneo...</p>
        <small>Apunta el lector al código de barras del producto</small>
      </div>`;
    updateTotales(); return;
  }

  cont.innerHTML = carrito.map(item => `
    <div class="cart-item">
      <div class="ci-emoji">${item.emoji}</div>
      <div class="ci-info">
        <div class="ci-nombre">${item.nombre}</div>
        <div class="ci-precio">${fmt(item.precio)} c/u</div>
      </div>
      <div class="ci-qty">
        <button class="qty-btn" onclick="cambiarCantidad(${item.id},-1)">−</button>
        <span class="qty-num">${item.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${item.id},1)">+</button>
      </div>
      <div class="ci-sub">${fmt(item.subtotal)}</div>
    </div>
  `).join('');
  updateTotales();
}

function updateTotales() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const fmtTotal = fmt(total);
  const subtotalEl = document.getElementById('subtotal-val');
  const totalEl = document.getElementById('total-val');
  const cobrarBadge = document.getElementById('cobrar-total-badge');
  const countBadge = document.getElementById('carrito-count');
  if (subtotalEl) subtotalEl.textContent = fmtTotal;
  if (totalEl) totalEl.textContent = fmtTotal;
  if (cobrarBadge) cobrarBadge.textContent = fmtTotal;
  if (countBadge) countBadge.textContent = carrito.reduce((s, i) => s + i.cantidad, 0);
  calcCambio();
}

function calcCambio() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const pago = parseFloat(document.getElementById('pago-input').value) || 0;
  const cambio = pago - total;
  const el = document.getElementById('cambio-val');
  el.textContent = cambio >= 0 ? fmt(cambio) : '-';
  el.style.color = cambio >= 0 ? 'var(--green)' : 'var(--red)';
}

function setMetodo(btn) {
  document.querySelectorAll('.metodo-btn, .metodo-btn-new').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  metodoPago = btn.dataset.m;

  const pb = document.getElementById('pago-block');
  if (pb) pb.style.display = metodoPago === 'Efectivo' ? 'block' : 'none';
}

//  COBRAR
async function cobrar() {
  if (!carrito.length) { showToast('El carrito está vacío', 'error'); return; }

  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  let pago = total; // para métodos no-efectivo
  let cambio = 0;

  if (metodoPago === 'Efectivo') {
    pago = parseFloat(document.getElementById('pago-input').value) || 0;
    cambio = pago - total;
    if (pago < total) {
      showToast('❌ El pago es menor al total', 'error');
      document.getElementById('pago-input').focus();
      return;
    }
  }

  const venta = { items: carrito.map(i => ({ ...i })), total, pago, cambio, metodoPago };

  try {
    const res = await window.api.ventas.registrar(venta);

    // Actualizar stock local
    for (const item of carrito) {
      const prod = allProductos.find(p => p.id === item.id);
      if (prod) prod.stock -= item.cantidad;
    }

    lastTicketData = { ...venta, ventaId: res.ventaId, fecha: new Date() };

    // Si Factus está activo, preguntar si quiere factura electrónica
    if (config.factus_activo === '1' && config.factus_client_id) {
      limpiarCarrito();
      renderGrid();
      showToast('Venta registrada', 'success');
      abrirModalFE();
    } else {
      mostrarTicket(lastTicketData);
      limpiarCarrito();
      renderGrid();
      showToast('Venta registrada exitosamente', 'success');
    }
  } catch (err) {
    showToast(' Error al registrar la venta', 'error');
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════
//  TICKET
// ═══════════════════════════════════════════════════════
function mostrarTicket(data) {
  const { items, total, pago, cambio, metodoPago: mp, fecha } = data;
  const fechaStr = (fecha || new Date()).toLocaleString('es-CO',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const storeName = config.nombre_tienda || 'MiTienda POS';
  document.getElementById('tk-store-name').textContent = '🛒 ' + storeName;
  document.getElementById('ticket-fecha').textContent = fechaStr;
  document.getElementById('ticket-metodo').textContent = 'Pago: ' + (mp || 'Efectivo');

  document.getElementById('ticket-items').innerHTML = items.map(i =>
    `<div class="t-item"><span>${i.emoji} ${i.nombre} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`
  ).join('');

  document.getElementById('ticket-totales').innerHTML = `
    <div class="t-totales">
      <div class="t-total-row main"><span>TOTAL</span><span>${fmt(total)}</span></div>
      ${mp === 'Efectivo' ? `
        <div class="t-total-row"><span>Pago</span><span>${fmt(pago)}</span></div>
        <div class="t-total-row"><span>Cambio</span><span>${fmt(cambio)}</span></div>
      ` : ''}
    </div>
  `;
  openOverlay('modal-ticket');
}

function closeTicket() { closeOverlay('modal-ticket'); }

async function imprimirTicket() {
  if (!lastTicketData) return;
  const { items, total, pago, cambio, metodoPago: mp, fecha } = lastTicketData;
  const fechaStr = (fecha || new Date()).toLocaleString('es-CO');
  const storeName = config.nombre_tienda || 'MiTienda POS';
  const propietario = config.nombre_propietario || '';
  const ciudad = config.ciudad || '';
  const tel = config.telefono || '';

  const html = `<html><head>
    <style>
      body { font-family:'Courier New',monospace; font-size:13px; width:280px; margin:0 auto; }
      h2   { text-align:center; font-size:15px; margin:8px 0 2px; }
      .sub { text-align:center; font-size:11px; color:#555; margin-bottom:2px; }
      .sep { text-align:center; color:#bbb; margin:5px 0; }
      .row { display:flex; justify-content:space-between; margin:3px 0; font-size:12px; }
      .total { font-weight:900; font-size:14px; }
      .footer { text-align:center; margin-top:8px; font-size:11px; color:#666; }
    </style></head><body>
    <h2>🛒 ${storeName}</h2>
    ${propietario ? `<div class="sub">${propietario}</div>` : ''}
    ${ciudad ? `<div class="sub">${ciudad}</div>` : ''}
    ${tel ? `<div class="sub">Tel: ${tel}</div>` : ''}
    <div class="sub">${fechaStr}</div>
    <div class="sep">──────────────────────</div>
    ${items.map(i => `<div class="row"><span>${i.nombre} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`).join('')}
    <div class="sep">──────────────────────</div>
    <div class="row total"><span>TOTAL</span><span>${fmt(total)}</span></div>
    <div class="row"><span>Pago (${mp || 'Efectivo'})</span><span>${fmt(pago)}</span></div>
    ${mp === 'Efectivo' ? `<div class="row"><span>Cambio</span><span>${fmt(cambio)}</span></div>` : ''}
    <div class="sep">──────────────────────</div>
    <div class="footer">¡Gracias por su compra!</div>
    </body></html>`;

  const result = await window.api.print.ticket(html);
  if (result?.success) { showToast('🖨️ Imprimiendo...', 'info'); closeTicket(); }
  else showToast('⚠️ Verifica la impresora', 'error');
}

//  DASHBOARD
function setDashTab(tab) {
  dashTab = tab;
  document.getElementById('tab-dia').classList.toggle('active', tab === 'dia');
  document.getElementById('tab-mes').classList.toggle('active', tab === 'mes');
  renderDashboard();
}

function renderDashboard() {
  if (!dashData) return;
  const isMes = dashTab === 'mes';

  document.getElementById('s-total').textContent = fmt(isMes ? (dashData.ventas_mes || 0) : (dashData.ventas_total || 0));
  document.getElementById('s-trans').textContent = isMes ? (dashData.transacciones_mes || 0) : (dashData.transacciones || 0);
  document.getElementById('s-prods').textContent = dashData.productosVendidos || 0;
  document.getElementById('s-avg').textContent = fmt(isMes ? (dashData.ticket_mes || 0) : (dashData.ticket_promedio || 0));
  document.getElementById('s-total-lbl').textContent = isMes ? 'Ventas del Mes' : 'Ventas del Día';
  document.getElementById('s-trans-lbl').textContent = isMes ? 'Trans. del Mes' : 'Trans. del Día';
  document.getElementById('s-avg-lbl').textContent = isMes ? 'Ticket Promedio Mes' : 'Ticket Promedio';

  const graficaSec = document.getElementById('grafica-mes-section');
  const metodosSec = document.getElementById('metodos-hoy-section');
  const lastSec = document.getElementById('last-section');
  graficaSec.style.display = isMes ? 'block' : 'none';
  metodosSec.style.display = 'grid';
  lastSec.style.display = isMes ? 'none' : 'grid';

  if (isMes && dashData.ventasMes) renderChartMes(dashData.ventasMes);

  // Métodos de pago
  const metodosEl = document.getElementById('metodos-hoy');
  const metIcon = { 'Efectivo': '💵', 'Transferencia': '📲', 'Débito': '💳', 'Crédito': '🏦' };
  if (dashData.porMetodo && dashData.porMetodo.length) {
    metodosEl.innerHTML = dashData.porMetodo.map(m => `
      <div class="metodo-row">
        <span class="metodo-icon">${metIcon[m.metodo_pago] || '💰'}</span>
        <span class="metodo-name">${m.metodo_pago}</span>
        <span class="metodo-cnt">${m.cnt} venta${m.cnt !== 1 ? 's' : ''}</span>
        <span class="metodo-total">${fmt(m.total)}</span>
      </div>`).join('');
  } else {
    metodosEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin ventas hoy</p>`;
  }

  // Top productos
  const topEl = document.getElementById('top-prods');
  if (dashData.topProductos && dashData.topProductos.length) {
    topEl.innerHTML = dashData.topProductos.map((p, i) => `
      <div class="top-item">
        <span class="top-rank">#${i + 1}</span>
        <span class="top-name">${p.nombre}</span>
        <span class="top-qty">${p.qty} uds</span>
      </div>`).join('');
  } else {
    topEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin datos</p>`;
  }

  // Últimas ventas
  const lastEl = document.getElementById('last-sales');
  const badges = { 'Efectivo': 'ef', 'Transferencia': 'tr', 'Débito': 'db', 'Crédito': 'cr' };
  if (dashData.ultimasVentas && dashData.ultimasVentas.length) {
    lastEl.innerHTML = dashData.ultimasVentas.map(v => {
      const hora = new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const b = badges[v.metodo_pago] || 'ef';
      return `
        <div class="sale-row">
          <span class="sale-time">🕐 ${hora}</span>
          <span class="sale-badge ${b}">${v.metodo_pago || 'Efectivo'}</span>
          <span class="sale-amount">${fmt(v.total)}</span>
        </div>`;
    }).join('');
  } else {
    lastEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin ventas hoy</p>`;
  }
}

// ── Gráfica de barras
function renderChartMes(datos) {
  const canvas = document.getElementById('chart-mes');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth || 600;
  const H = 160;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  if (!datos.length) {
    ctx.fillStyle = '#7a80a0';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos para este mes', W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(...datos.map(d => d.total_dia), 1);
  const pad = 32;
  const barW = Math.max(8, (W - pad * 2) / datos.length - 4);
  const gap = (W - pad * 2 - barW * datos.length) / Math.max(datos.length - 1, 1);

  datos.forEach((d, i) => {
    const barH = ((d.total_dia / maxVal) * (H - pad - 20)) || 4;
    const x = pad + i * (barW + gap);
    const y = H - pad - barH;

    const grad = ctx.createLinearGradient(0, y, 0, H - pad);
    grad.addColorStop(0, 'rgba(99,102,241,.85)');
    grad.addColorStop(1, 'rgba(99,102,241,.2)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 3);
    ctx.fill();

    // Día
    const dia = d.dia?.split('-')[2] || '';
    ctx.fillStyle = '#7a80a0';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dia, x + barW / 2, H - 10);
  });

  ctx.fillStyle = '#7a80a0';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(fmt(maxVal), pad - 4, 16);
}

//  INVENTARIO
function filtrarInv() { renderInventario(); }

function renderInventario() {
  const q = (document.getElementById('inv-buscar')?.value || '').toLowerCase();
  const list = allProductos.filter(p =>
    !q || p.nombre.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.categoria || '').toLowerCase().includes(q)
  );

  const tbody = document.getElementById('inv-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:2.5rem">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    let badge = p.stock <= 0 ? 'badge-empty' : p.stock < 5 ? 'badge-low' : 'badge-ok';
    let btext = p.stock <= 0 ? 'Sin stock' : p.stock < 5 ? 'Bajo' : 'OK';
    return `
      <tr>
        <td style="font-size:1.5rem;text-align:center">${p.emoji || '🛍️'}</td>
        <td style="font-weight:600">${p.nombre}</td>
        <td><span style="color:var(--text2);font-size:.82rem">${p.categoria}</span></td>
        <td><span style="color:var(--text3);font-size:.78rem;font-family:monospace">${p.barcode || '—'}</span></td>
        <td style="font-weight:800;color:var(--accent2)">${fmt(p.precio)}</td>
        <td style="font-weight:700">${p.stock}</td>
        <td><span class="badge ${badge}">${btext}</span></td>
        <td>
          <button class="btn-table" onclick="editarProducto(${p.id})">✏️ Editar</button>
          <button class="btn-table danger" onclick="eliminarProducto(${p.id},'${p.nombre.replace(/'/g, '')}')">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

// ── CRUD Producto ─────────────────────────────────────────
function openModal(prod) {
  document.getElementById('p-id').value = prod?.id || '';
  document.getElementById('p-nombre').value = prod?.nombre || '';
  document.getElementById('p-precio').value = prod?.precio || '';
  document.getElementById('p-stock').value = prod?.stock || '';
  document.getElementById('p-cat').value = prod?.categoria || 'General';
  document.getElementById('p-emoji').value = prod?.emoji || '';
  document.getElementById('p-barcode').value = prod?.barcode || '';
  document.getElementById('modal-title').textContent = prod ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('ai-sugerencia').style.display = 'none';
  document.getElementById('ai-badge').style.display = 'none';
  openOverlay('modal-prod');
  setTimeout(() => document.getElementById('p-nombre').focus(), 100);
}

function closeModal() { closeOverlay('modal-prod'); }

function editarProducto(id) {
  const prod = allProductos.find(p => p.id === id);
  if (prod) openModal(prod);
}

async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    await window.api.productos.delete(id);
    allProductos = allProductos.filter(p => p.id !== id);
    carrito = carrito.filter(i => i.id !== id);
    renderCarrito();
    buildCats();
    renderGrid();
    renderInventario();
    showToast('🗑 Producto eliminado', 'info');
  } catch (err) {
    showToast('❌ Error al eliminar', 'error');
  }
}

async function guardarProducto() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const precio = parseFloat(document.getElementById('p-precio').value);
  const stock = parseInt(document.getElementById('p-stock').value);
  const cat = document.getElementById('p-cat').value;
  const emoji = document.getElementById('p-emoji').value.trim() || '🛍️';
  const barcode = document.getElementById('p-barcode').value.trim() || null;
  const id = document.getElementById('p-id').value;

  if (!nombre) { showToast('⚠️ Ingresa el nombre', 'error'); return; }
  if (isNaN(precio)) { showToast('⚠️ Precio inválido', 'error'); return; }
  if (isNaN(stock)) { showToast('⚠️ Stock inválido', 'error'); return; }

  const prod = { nombre, precio, stock, categoria: cat, emoji, barcode, ...(id ? { id: parseInt(id) } : {}) };

  try {
    const res = await window.api.productos.save(prod);
    if (!id) prod.id = res.id;
    const idx = allProductos.findIndex(p => p.id === prod.id);
    if (idx >= 0) allProductos[idx] = prod; else allProductos.push(prod);

    closeModal();
    buildCats();
    renderGrid();
    renderInventario();
    showToast(id ? '✅ Producto actualizado' : '✅ Producto agregado', 'success');
  } catch (err) {
    showToast('❌ Error: ' + (err.message || ''), 'error');
  }
}

//   IA LOCAL – Detectar categoría y emoji por nombre del producto
const AI_REGLAS = [
  // ── Bebidas ────────────────────────────────────────────────────────────────
  {
    re: /gaseosa|cola|pepsi|sprite|malt|soda|refresc|fanta|seven.?up|7.?up|postobón|postobon|bretaña/i,
    emoji: '🥤', cat: 'Bebidas'
  },
  { re: /agua\b|water|brisa\b|cristal\b|manantial/i, emoji: '💧', cat: 'Bebidas' },
  {
    re: /café|tinto|coffee|cappuccino|latte|nescafé|nescafe|colcafé|colcafe|sello rojo|aguila roja/i,
    emoji: '☕', cat: 'Bebidas'
  },
  {
    re: /jugo|juice|limonada|maracuy|néctar|nectar|hit\b|frutiño|fruti.?no|tang\b|avena\b|tutti.?frutti/i,
    emoji: '🧃', cat: 'Bebidas'
  },
  {
    re: /pony.?malt|ponny|gatorade|powerade|squash|electrolit|mr\.?\s?tea|nestea/i,
    emoji: '🧉', cat: 'Bebidas'
  },
  {
    re: /cerveza|beer|aguardiente|ron\b|whisky|vodka|vino\b|licor|alcohol|poker\b|águila\b|costeña|club\b|pilsen/i,
    emoji: '🍺', cat: 'Licores'
  },
  { re: /bon.?ice|bon bon|paleta|helado|yogurt.?helado|ice.?cream/i, emoji: '🍦', cat: 'Snacks' },

  // ── Lácteos ────────────────────────────────────────────────────────────────
  {
    re: /leche|milk|yogur|yoghurt|alpina|alquería|colanta|klim\b|carnation|condensad/i,
    emoji: '🥛', cat: 'Lácteos'
  },
  { re: /queso|mantequilla|crema\s*(de\s*(leche|mesa)|agria)|butter|kumis/i, emoji: '🧀', cat: 'Lácteos' },
  { re: /huevo|egg/i, emoji: '🥚', cat: 'Lácteos' },
  { re: /milo\b|nestl[eé]|chocolisto|cocoa|ovomaltina/i, emoji: '🍫', cat: 'Bebidas' },

  // ── Panadería ──────────────────────────────────────────────────────────────
  {
    re: /pan\b|arepa|torta|galleta|bizcocho|buñuelo|pandebono|croissant|mogolla|almojábana|roscón|donuts?/i,
    emoji: '🍞', cat: 'Panadería'
  },

  // ── Snacks ─────────────────────────────────────────────────────────────────
  {
    re: /papa frita|papas\s*(fritas)?|snack|chito|doritos|tostitos|maní|nuez|chips|yupi\b|margarita\b|pringles|cheetos|ruffles|lays\b/i,
    emoji: '🍟', cat: 'Snacks'
  },
  {
    re: /chocolat|dulce|caramelo|bombon|golosina|chicle|goma.?de.?mascar|trident|halls\b|jet\b|confite|bon bon bum/i,
    emoji: '🍫', cat: 'Snacks'
  },
  { re: /maruchan|ramen|sopa.?(sobre|china)|sopas\b/i, emoji: '🍜', cat: 'General' },

  // ── Aseo del hogar ─────────────────────────────────────────────────────────
  {
    re: /fabuloso|limpido|ajax\b|poett|pinesol|pine.?sol|glorix|vim\b|cif\b|señor\s*aseo|limpiador|multiusos/i,
    emoji: '🧹', cat: 'Aseo'
  },
  {
    re: /jabón\s*(de\s*barra|de\s*baño|de\s*ropa)?|detergent|fab\b|ariel\b|rinso|omo\b|bold\b|rindex|nevex|marea\b|su.?fresh/i,
    emoji: '🧼', cat: 'Aseo'
  },
  { re: /suavizant|suavitel|downy|vanish|quitamanchas|viaclean|vel\s*rosa/i, emoji: '🧺', cat: 'Aseo' },
  { re: /desinfect|lysol|hipoclorito|cloro|blanqueador|virex/i, emoji: '🧪', cat: 'Aseo' },
  { re: /lavaplatos?|axion\b|lavaloza|ajax\s*(crema|líquido)/i, emoji: '🍽️', cat: 'Aseo' },

  // ── Aseo personal ──────────────────────────────────────────────────────────
  {
    re: /shampoo|champú|acondicionad|tío\s*nacho|tio\s*nacho|pantene|sedal|head.?shoulders|elvive|savital|konzil/i,
    emoji: '🧴', cat: 'Aseo'
  },
  {
    re: /crema\s*(corporal|facial|de\s*manos)|nivea|dove\b|pond[s']|vaselina|lubriderm/i,
    emoji: '🧴', cat: 'Aseo'
  },
  {
    re: /desodorante|axe\b|rexona|speed\s*stick|lady\s*speed|brut\b|old\s*spice|secret\b/i,
    emoji: '🌸', cat: 'Aseo'
  },
  {
    re: /pasta\s*dental|crema\s*dental|colgate|cepillo\s*dental|enjuague\s*bucal|oral.?b|listerine/i,
    emoji: '🦷', cat: 'Aseo'
  },
  {
    re: /papel\s*higi[eé]nico|servilleta|pañal|toall|paño|familia\b|elite\b|scottex|winny\b|huggies|pampers/i,
    emoji: '🧻', cat: 'Aseo'
  },
  { re: /toalla\s*(sanitaria|femenina)|nosotras|stayfree|carefree\b/i, emoji: '🌸', cat: 'Aseo' },
  { re: /afeitar|gillette|mach.?3|schick|crema\s*de\s*afeitar/i, emoji: '🪒', cat: 'Aseo' },

  // ── Frutas y Verduras ──────────────────────────────────────────────────────
  {
    re: /tomate|lechuga|cebolla|zanahoria|pepino|brócoli|brocoli|espinaca|col\b|repollo|apio/i,
    emoji: '🍅', cat: 'Frutas y Verduras'
  },
  {
    re: /limón|naranja|mango|banano|piña|mora\b|fresa|uva\b|manzana|pera\b|papaya|melón|guayaba/i,
    emoji: '🍋', cat: 'Frutas y Verduras'
  },
  { re: /yuca|papa\b|plátano|ñame|remolacha|ahuyama|mazorca/i, emoji: '🌽', cat: 'Frutas y Verduras' },

  // ── Granos y Abarrotes ────────────────────────────────────────────────────
  {
    re: /arroz|frijol|lenteja|garbanzo|maíz|maiz|pasta\b|fideo|harina|avena\b(?!.*bebida)/i,
    emoji: '🌾', cat: 'General'
  },
  {
    re: /aceite|vinagre|sal\b|azúcar|azucar|pimienta|salsa|comino|condiment|maggi\b|knorr|cubito/i,
    emoji: '🫙', cat: 'General'
  },
  { re: /atún|sardina/i, emoji: '🐟', cat: 'Carnes' },

  // ── Carnes ─────────────────────────────────────────────────────────────────
  {
    re: /carne|pollo|res\b|cerdo|pescado|chorizo|salchicha|mortadela|salchichon|jamon|jamón/i,
    emoji: '🥩', cat: 'Carnes'
  },

  // ── Licores y tabaco ──────────────────────────────────────────────────────
  { re: /cigarrill|tabaco|vapeador|marlboro|derby\b|mustang\b|pielroja/i, emoji: '🚬', cat: 'General' },

  // ── Hogar y otros ──────────────────────────────────────────────────────────
  { re: /pilas?|batería\b|foco|vela\b|encendedor|fosforo|fósforo|cerillo/i, emoji: '🔋', cat: 'General' },
  { re: /bolsa|bolsas|basura|ziploc|rollo\s*(de\s*(cocina|papel))?/i, emoji: '🛍️', cat: 'General' },
  { re: /insecticida|raid\b|baygon|off\b|matainsectos|repelente/i, emoji: '🐛', cat: 'General' },
  { re: /esponja|estropajo|bayeta|mechudo|trapeador|escoba|recogedor/i, emoji: '🧽', cat: 'Aseo' },
];


let aiDebounce = null;

function aiDetectarCategoria() {
  clearTimeout(aiDebounce);
  aiDebounce = setTimeout(() => {
    const nombre = document.getElementById('p-nombre').value.trim();
    const sugerEl = document.getElementById('ai-sugerencia');
    const badgeEl = document.getElementById('ai-badge');

    if (nombre.length < 3) { sugerEl.style.display = 'none'; badgeEl.style.display = 'none'; return; }

    const match = AI_REGLAS.find(r => r.re.test(nombre));
    if (match) {
      sugerEl.style.display = 'flex';
      badgeEl.style.display = 'inline-block';
      sugerEl.innerHTML = `✨ <b>IA sugiere:</b>&nbsp; ${match.emoji} &nbsp;<b>${match.cat}</b> – <u>Aceptar</u>`;
      sugerEl.onclick = () => {
        document.getElementById('p-emoji').value = match.emoji;
        document.getElementById('p-cat').value = match.cat;
        sugerEl.style.display = 'none';
        showToast(`✨ Categoría asignada: ${match.cat}`, 'info');
      };
    } else {
      sugerEl.style.display = 'none';
      badgeEl.style.display = 'none';
    }
  }, 350);
}

//  HISTORIAL
async function loadHistorial() {
  const fecha = document.getElementById('hist-fecha').value || null;
  const ventas = await window.api.ventas.getHistorial(fecha);
  renderHistorial(ventas);
}

async function filtrarHist() { await loadHistorial(); }

function renderHistorial(ventas) {
  const cont = document.getElementById('historial-lista');
  if (!ventas.length) {
    cont.innerHTML = `<div class="hist-empty">📋 No hay ventas en este período</div>`;
    return;
  }
  const mIcon = { 'Efectivo': '💵', 'Transferencia': '📲', 'Débito': '💳', 'Crédito': '🏦' };
  cont.innerHTML = ventas.map(v => {
    const fechaStr = new Date(v.fecha).toLocaleString('es-CO',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="hist-item">
        <div>
          <div style="font-weight:700;font-size:.88rem">#${v.id} &nbsp;${mIcon[v.metodo_pago] || '💰'} ${v.metodo_pago || 'Efectivo'}</div>
          <div class="hist-fecha">${fechaStr}</div>
        </div>
        <div class="hist-resumen">${v.resumen || '—'}</div>
        <div style="text-align:right">
          <div class="hist-total">${fmt(v.total)}</div>
          ${v.metodo_pago === 'Efectivo' ? `<div style="font-size:.73rem;color:var(--text2)">Cambio: ${fmt(v.cambio)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function exportCSV() {
  const ventas = await window.api.ventas.getAll();
  if (!ventas.length) { showToast('Sin datos para exportar', 'info'); return; }

  const header = 'ID,Fecha,Total,Pago,Cambio,Método,Items\n';
  const rows = ventas.map(v =>
    `${v.id},"${v.fecha}",${v.total},${v.pago},${v.cambio},"${v.metodo_pago || 'Efectivo'}","${v.resumen || ''}"`
  ).join('\n');

  const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ CSV exportado', 'success');
}

//  CONFIGURACIÓN
async function guardarConfig() {
  const campos = {
    nombre_tienda: document.getElementById('cfg-nombre').value.trim(),
    nombre_propietario: document.getElementById('cfg-propietario').value.trim(),
    ciudad: document.getElementById('cfg-ciudad').value.trim(),
    telefono: document.getElementById('cfg-telefono').value.trim(),
    nit_tienda: document.getElementById('cfg-nit')?.value.trim() || '',
  };

  if (!campos.nombre_tienda) { showToast('⚠️ Ingresa el nombre de la tienda', 'error'); return; }

  try {
    for (const [k, v] of Object.entries(campos)) {
      await window.api.config.set(k, v);
      config[k] = v;
    }
    applyConfig();
    showToast('✅ Configuración guardada', 'success');
  } catch (err) {
    showToast('❌ Error al guardar', 'error');
  }
}

//  FACTUS – Configuración
function toggleFactus(checkbox) {
  const fields = document.getElementById('factus-fields');
  fields.style.display = checkbox.checked ? 'flex' : 'none';
  window.api.config.set('factus_activo', checkbox.checked ? '1' : '0');
  config.factus_activo = checkbox.checked ? '1' : '0';
}

async function guardarConfigFactus() {
  const clientId = document.getElementById('cfg-factus-id').value.trim();
  const clientSecret = document.getElementById('cfg-factus-secret').value.trim();
  if (!clientId || !clientSecret) { showToast('⚠️ Ingresa Client ID y Client Secret', 'error'); return; }

  await window.api.config.set('factus_client_id', clientId);
  await window.api.config.set('factus_client_secret', clientSecret);
  config.factus_client_id = clientId;
  config.factus_client_secret = clientSecret;
  showToast('✅ Credenciales guardadas', 'success');
}

async function verificarFactus() {
  const statusEl = document.getElementById('factus-status');
  statusEl.style.display = 'block';
  statusEl.className = 'factus-status';
  statusEl.textContent = '⏳ Verificando conexión...';

  // Guardar primero
  await guardarConfigFactus();

  const res = await window.api.factus.verificar();
  if (res.ok) {
    statusEl.className = 'factus-status ok';
    statusEl.textContent = '✅ Conexión exitosa con Factus';
    showToast('✅ Factus conectado correctamente', 'success');
  } else {
    statusEl.className = 'factus-status err';
    statusEl.textContent = '❌ Error: ' + (res.error || 'Credenciales inválidas');
  }
}

// ═══════════════════════════════════════════════════════
//  FACTUS – Emisión de Factura Electrónica
// ═══════════════════════════════════════════════════════
function abrirModalFE() {
  // Limpiar campos
  const ids = ['fe-identificacion', 'fe-nombre', 'fe-email'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('fe-tipo').value = 'CC';
  document.getElementById('fe-error').style.display = 'none';
  openOverlay('modal-fe');
}

async function emitirFEComun(cliente) {
  const btn = document.getElementById('fe-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Emitiendo...'; }

  const errEl = document.getElementById('fe-error');
  errEl.style.display = 'none';

  try {
    const items = lastTicketData.items.map(i => ({
      nombre: i.nombre,
      precio: i.precio,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
    }));

    const res = await window.api.factus.emitir({
      ventaId: lastTicketData.ventaId,
      items,
      total: lastTicketData.total,
      metodoPago: lastTicketData.metodoPago,
      cliente,
    });

    if (res.ok) {
      closeOverlay('modal-fe');
      mostrarTicketConCUFE(lastTicketData, res);
      showToast('✅ Factura electrónica emitida', 'success');
    } else {
      errEl.style.display = 'block';
      errEl.textContent = '❌ ' + (res.error || 'Error al emitir');
    }
  } catch (err) {
    errEl.style.display = 'block';
    errEl.textContent = '❌ Error: ' + (err.message || '');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧾 Emitir Factura'; }
  }
}

function emitirFEConsumidor() {
  emitirFEComun({
    tipo: 'NIT',
    identificacion: '222222222222',
    nombre: 'Consumidor Final',
    email: '',
    telefono: '',
  });
}

function emitirFECliente() {
  const tipo = document.getElementById('fe-tipo').value;
  const identificacion = document.getElementById('fe-identificacion').value.trim();
  const nombre = document.getElementById('fe-nombre').value.trim();
  const email = document.getElementById('fe-email').value.trim();

  if (!identificacion) {
    document.getElementById('fe-error').style.display = 'block';
    document.getElementById('fe-error').textContent = '⚠️ Ingresa el número de documento';
    return;
  }

  emitirFEComun({ tipo, identificacion, nombre: nombre || 'Cliente', email, telefono: '' });
}

// ── Ticket con CUFE y QR ─────────────────────────────────
function mostrarTicketConCUFE(ticketData, feData) {
  const { items, total, pago, cambio, metodoPago: mp, fecha } = ticketData;
  const fechaStr = (fecha || new Date()).toLocaleString('es-CO',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const storeName = config.nombre_tienda || 'MiTienda POS';
  document.getElementById('tk-store-name').textContent = '🛒 ' + storeName;
  document.getElementById('ticket-fecha').textContent = fechaStr;
  document.getElementById('ticket-metodo').textContent = 'Pago: ' + (mp || 'Efectivo');

  document.getElementById('ticket-items').innerHTML = items.map(i =>
    `<div class="t-item"><span>${i.emoji || ''} ${i.nombre} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`
  ).join('');

  const cufeShort = feData.cufe ? feData.cufe.slice(0, 20) + '...' : '';

  document.getElementById('ticket-totales').innerHTML = `
    <div class="t-totales">
      <div class="t-total-row main"><span>TOTAL</span><span>${fmt(total)}</span></div>
      ${mp === 'Efectivo' ? `
        <div class="t-total-row"><span>Pago</span><span>${fmt(pago)}</span></div>
        <div class="t-total-row"><span>Cambio</span><span>${fmt(cambio)}</span></div>
      ` : ''}
      <div style="margin-top:.5rem;padding:.4rem;background:#f5f5f5;border-radius:4px;font-size:.7rem;color:#555;text-align:left">
        <div style="font-weight:700;margin-bottom:.2rem">📋 FACTURA ELECTRÓNICA</div>
        <div>No. FE-${feData.numero || ''}</div>
        <div style="word-break:break-all">CUFE: ${cufeShort}</div>
        ${feData.pdf ? `<div style="margin-top:.2rem"><a href="${feData.pdf}" style="color:#6366f1">Ver factura PDF</a></div>` : ''}
      </div>
    </div>
  `;
  openOverlay('modal-ticket');
}


// ═══════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════
function fmt(n) {
  return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }
function overlayClose(e, id) { if (e.target.id === id) closeOverlay(id); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeOverlay('modal-prod'); closeOverlay('modal-ticket'); }
});
