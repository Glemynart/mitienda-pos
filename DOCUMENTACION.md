# 🛒 MiTienda POS — Documentación del Proyecto

> Aplicación de Punto de Venta (POS) de escritorio para tiendas en Colombia, con facturación electrónica integrada ante la DIAN.

---

## Tecnologías Utilizadas

### Core

| Tecnología | Uso |
|------------|-----|
| **Electron** | Framework principal. Convierte la aplicación web en una app de escritorio nativa para Windows/Mac/Linux |
| **Node.js** | Entorno de ejecución para el proceso principal de Electron (`main.js`) |
| **HTML5** | Estructura de todas las vistas y módulos (`index.html`) |
| **CSS3 (Vanilla)** | Estilos y diseño visual completo (`styles.css`). Diseño oscuro con glassmorphism y micro-animaciones |
| **JavaScript (Vanilla)** | Lógica del frontend (`renderer.js`, ~1700 líneas) |

### Base de Datos

| Tecnología | Uso |
|------------|-----|
| **SQLite** (vía `better-sqlite3`) | Base de datos local embebida. Guarda productos, ventas e historial sin necesidad de internet |

### Integraciones Externas

| Tecnología | Uso |
|------------|-----|
| **Factus API** (`factus.com.co`) | Emisión de facturas electrónicas ante la DIAN. Autenticación OAuth2 + endpoints REST |
| **Google Fonts (Inter)** | Tipografía moderna y legible |

### Arquitectura Electron

```
main.js          ← Proceso principal: ventana, IPC handlers, rutas nativas
preload.js       ← Puente seguro (contextBridge) entre renderer y Node.js
renderer.js      ← Toda la lógica de la interfaz (frontend)
src/database.js  ← Módulo de base de datos SQLite (CRUD de productos y ventas)
src/factus.js    ← Módulo de integración con la API de Factus
```

---

## Módulos del Sistema

### 1. Vender
El módulo principal de la aplicación. Diseñado con enfoque *scanner-first*.

**Funcionalidades:**
- Campo de búsqueda enfocado automáticamente al iniciar
- Soporte para escáner de código de barras (HID/USB/Bluetooth)
- Búsqueda por nombre o código de barras en tiempo real
- Catálogo de productos colapsable con filtro por categorías
- Carrito de compras con control de cantidades
- Selección de método de pago: Efectivo, Transferencia, Débito, Crédito
- Cálculo automático de cambio para pagos en efectivo
- Botón **Cobrar** que lanza el flujo de ticket o factura electrónica

---

### 2. 📦 Inventario
Gestión completa del catálogo de productos.

**Funcionalidades:**
- Listado de todos los productos en tabla
- Búsqueda por nombre o código de barras
- Crear, editar y eliminar productos
- Campos: nombre, precio, stock, categoría, emoji, código de barras
- **Sugerencia automática de categoría por IA** al escribir el nombre del producto
- Control de estado activo/inactivo según stock

---

### 3. Resumen
Panel de estadísticas e indicadores del negocio.

**Funcionalidades:**
- Vista de **Hoy** y **Este Mes** (tabs)
- Métricas: Total de ventas, número de transacciones, productos vendidos, ticket promedio
- Gráfica de ventas diarias del mes (usando `<canvas>`)
- Desglose por método de pago
- Top productos más vendidos
- Últimas ventas realizadas

---

### 4. Historial de Ventas
Registro completo de todas las transacciones.

**Funcionalidades:**
- Lista de ventas agrupadas y detalladas
- Filtro por fecha
- Exportación a archivo **CSV**

---

### 5. Factura Electrónica (Factus)
Integración con Factus para emitir facturas válidas ante la DIAN.

**Funcionalidades:**
- Emisión rápida a **Consumidor Final**
- Emisión con datos del cliente (CC, NIT, CE, Pasaporte)
- Campo de email para envío del PDF al cliente
- Verificación de conexión con la API
- Flujo alternativo: emitir solo tiquete físico sin factura electrónica

---

### 6. Ticket 
Recibo imprimible de cada venta.

**Funcionalidades:**
- Generación automática tras cada cobro
- Muestra: nombre de tienda, fecha, productos, totales, método de pago
- Botón de impresión (usa el diálogo nativo del sistema operativo)
- Compatible con impresoras térmicas de 58mm y 80mm (Epson TM-T20, STAR, Bixolon, etc.)

---

### 7.  Configuración
Personalización de la tienda y servicios conectados.

**Funcionalidades:**
- Nombre de la tienda, propietario, ciudad, teléfono y NIT
- Configuración de credenciales de Factus (Client ID + Client Secret)
- Activar/desactivar facturación electrónica con un toggle
- Información sobre impresoras y escáneres compatibles

---

## Base de Datos (SQLite local)

La app funciona **100% offline** para las operaciones del día a día. Los datos se guardan localmente en el equipo.

**Tablas:**
- `productos` — Catálogo con nombre, precio, stock, categoría, código de barras
- `ventas` — Registro de cada transacción con fecha, total y método de pago
- `venta_items` — Detalle de los productos incluidos en cada venta

---

## Integración Factus (API Externa)

Solo se requiere internet para emitir facturas electrónicas.

**Flujo:**
1. El usuario configura su `Client ID` y `Client Secret` de Factus
2. La app obtiene un token OAuth2
3. Al cobrar, envía los datos de la venta al endpoint de Factus
4. Factus devuelve el número de factura y genera el PDF para el cliente

---

## Estructura de Archivos

```
PROYECTO POS/
├── main.js           # Proceso principal de Electron
├── preload.js        # Puente seguro IPC (contextBridge)
├── renderer.js       # Lógica completa del frontend (~1700 líneas)
├── index.html        # Estructura HTML de todas las vistas
├── styles.css        # Estilos globales (diseño oscuro premium)
├── package.json      # Dependencias y scripts npm
└── src/
    ├── database.js   # Módulo SQLite (productos y ventas)
    └── factus.js     # Módulo de integración con Factus API
```

---
