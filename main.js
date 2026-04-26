const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('./src/database');
const FactusClient = require('./src/factus');

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'MiTienda POS',
    backgroundColor: '#0d0f18',
    show: false,
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(async () => {
  db = new Database();
  await db.open();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// ─── IPC: Productos ─────────────────────────────────────
ipcMain.handle('productos:getAll', () => db.getAllProductos());
ipcMain.handle('productos:getByBarcode', (_, bc) => db.getProductoByBarcode(bc));
ipcMain.handle('productos:save', (_, p) => db.saveProducto(p));
ipcMain.handle('productos:delete', (_, id) => db.deleteProducto(id));
ipcMain.handle('productos:updateStock', (_, id, d) => db.updateStock(id, d));

// ─── IPC: Ventas ─────────────────────────────────────────
ipcMain.handle('ventas:registrar', (_, v) => db.registrarVenta(v));
ipcMain.handle('ventas:getHistorial', (_, fecha) => db.getHistorial(fecha));
ipcMain.handle('ventas:getDashboard', () => db.getDashboard());
ipcMain.handle('ventas:getAll', () => db.getTodasVentas());

// ─── IPC: Configuración ──────────────────────────────────
ipcMain.handle('config:get', () => db.getConfig());
ipcMain.handle('config:set', (_, k, v) => db.setConfig(k, v));

// ─── IPC: Factus (Facturación Electrónica) ───────────────
function getFactus() {
  const cfg = db.getConfig();
  if (!cfg.factus_client_id || !cfg.factus_client_secret) return null;
  return new FactusClient(cfg.factus_client_id, cfg.factus_client_secret, cfg.nit_tienda || '');
}

ipcMain.handle('factus:verificar', async () => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Credenciales Factus no configuradas' };
  return f.verificarCredenciales();
});

ipcMain.handle('factus:emitir', async (_, datos) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const numero = await f.getSiguienteNumero();
    const result = await f.emitirFactura({ ...datos, numeroFactura: numero });
    if (result.ok) db.saveFactura({ ventaId: datos.ventaId, ...result });
    return result;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:getSiguienteNumero', async () => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const n = await f.getSiguienteNumero();
    return { ok: true, numero: n };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── IPC: Imprimir Ticket ──────────────────────────────
ipcMain.handle('print:ticket', async (_, htmlContent) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true }
    });
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        (success, reason) => { printWin.close(); resolve({ success, reason }); }
      );
    });
  });
});
