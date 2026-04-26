const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  productos: {
    getAll:        ()          => ipcRenderer.invoke('productos:getAll'),
    getByBarcode:  (barcode)   => ipcRenderer.invoke('productos:getByBarcode', barcode),
    save:          (producto)  => ipcRenderer.invoke('productos:save', producto),
    delete:        (id)        => ipcRenderer.invoke('productos:delete', id),
    updateStock:   (id, delta) => ipcRenderer.invoke('productos:updateStock', id, delta),
  },
  ventas: {
    registrar:    (venta) => ipcRenderer.invoke('ventas:registrar', venta),
    getHistorial: (fecha) => ipcRenderer.invoke('ventas:getHistorial', fecha),
    getDashboard: ()      => ipcRenderer.invoke('ventas:getDashboard'),
    getAll:       ()      => ipcRenderer.invoke('ventas:getAll'),
  },
  config: {
    get:  ()        => ipcRenderer.invoke('config:get'),
    set:  (k, v)   => ipcRenderer.invoke('config:set', k, v),
  },
  factus: {
    verificar:          ()      => ipcRenderer.invoke('factus:verificar'),
    emitir:             (datos) => ipcRenderer.invoke('factus:emitir', datos),
    getSiguienteNumero: ()      => ipcRenderer.invoke('factus:getSiguienteNumero'),
  },
  print: {
    ticket: (html) => ipcRenderer.invoke('print:ticket', html),
  }
});
