const https = require('https');
const http = require('http');

const FACTUS_BASE = 'https://api.factus.com.co';

class FactusClient {
  constructor(clientId, clientSecret, nitEmisor) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.nitEmisor = nitEmisor;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const body = JSON.stringify({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const data = await this._request('POST', '/oauth/token', body);
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 1 min antes de expirar
    return this.accessToken;
  }

  //  Emitir Factura Electrónica 
  async emitirFactura({ numeroFactura, cliente, items, total, metodoPago, fecha }) {
    const token = await this.getToken();

    // Construir líneas de detalle
    const lineas = items.map((item, i) => {
      const precioUnitario = parseFloat(item.precio);
      const cantidad = parseInt(item.cantidad);
      const subtotal = precioUnitario * cantidad;

      return {
        sequence: i + 1,
        tax_included: true,  // precios incluyen IVA
        quantity: cantidad,
        discount_rate: 0,
        unit_measure_id: 70,    // 70 = unidad
        standard_code_id: 3,     // 3 = Sin código estándar
        is_excluded_vat: true,  // tiendas de barrio generalmente exentas
        tribute_id: 21,    // 21 = Excluido de IVA
        withholding_taxes: [],
        description: item.nombre,
        notes: '',
        unit_price: precioUnitario,
        gross_value: subtotal,
        tax_amount: 0,
        discount_amount: 0,
        charge_amount: 0,
        net_value: subtotal,
      };
    });

    // Tipo de documento de identidad
    const tipoDoc = cliente.tipo === 'NIT' ? '31' :
      cliente.tipo === 'CE' ? '22' :
        cliente.tipo === 'PP' ? '91' : '13'; // 13 = CC

    const payload = {
      document: {
        prefix: 'FE',
        number: numeroFactura,
        reference_code: `POS-${numeroFactura}`,
        payment_form: '1',  // 1 = Contado
        payment_due_date: new Date().toISOString().split('T')[0],
        payment_method_code: this._metodoCodigo(metodoPago),
        billing_period: null,
        operations_type: '1',
        notes: 'Factura generada desde POS MiTienda',
      },
      numbering_range_id: 0, // 0 = usar la resolución activa
      customer: {
        identification: cliente.identificacion,
        dv: null,
        company: cliente.nombre || 'Consumidor Final',
        trade_name: cliente.nombre || 'Consumidor Final',
        names: cliente.nombre || 'Consumidor Final',
        address: cliente.direccion || 'Colombia',
        email: cliente.email || '',
        phone: cliente.telefono || '',
        legal_organization_id: '2',   // 2 = Persona natural
        tribute_id: '21',    // 21 = No responsable de IVA
        identification_document_id: tipoDoc,
        municipality_id: '05045',
      },
      items: lineas,
    };

    const data = await this._request(
      'POST',
      '/v1/bills/validate',
      JSON.stringify(payload),
      token
    );

    return {
      ok: true,
      cufe: data.data?.cufe || data.cufe || '',
      qr: data.data?.qr_code || data.qr_code || '',
      numero: data.data?.number || numeroFactura,
      pdf: data.data?.public_url || '',
    };
  }

  async getSiguienteNumero() {
    const token = await this.getToken();
    try {
      const data = await this._request('GET', '/v1/numbering-ranges', null, token);
      const range = data.data?.[0];
      return range ? (parseInt(range.current_number) + 1) : 1;
    } catch (_) {
      return 1;
    }
  }

  // ── Verificar credenciales ───────────────────────────
  async verificarCredenciales() {
    try {
      await this.getToken();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Código de método de pago (DIAN) ──────────────────
  _metodoCodigo(metodo) {
    const map = {
      'Efectivo': '10',
      'Transferencia': '47',
      'Débito': '48',
      'Crédito': '48',
    };
    return map[metodo] || '10';
  }

  // ── HTTP helper ───────────────────────────────────────
  _request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(FACTUS_BASE + path);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (body) headers['Content-Length'] = Buffer.byteLength(body);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      };

      const req = lib.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error('Respuesta inválida de Factus: ' + raw.slice(0, 200)));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = FactusClient;
