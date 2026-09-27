// Configuración fija de países para el MVP.
// Más adelante el streamer podrá editarla desde el dashboard.
// command: lo que el espectador debe escribir en el chat para apoyar al país.
// color: color del equipo en el overlay (barras y pantalla de ganador).
// flag: código de la bandera (ISO de 2 letras, ej. "cu"); la imagen está en /flags/4x3/cu.svg
const DEFAULT_COUNTRIES = [
  { id: 'cuba', name: 'Cuba', command: 'Cuba', color: '#2f7df6', flag: 'cu' },
  { id: 'mexico', name: 'México', command: 'Mexico', color: '#16a34a', flag: 'mx' },
  { id: 'haiti', name: 'Haití', command: 'Haiti', color: '#e11d48', flag: 'ht' },
  { id: 'republica-dominicana', name: 'República Dominicana', command: 'Republica Dominicana', color: '#f59e0b', flag: 'do' },
];

module.exports = { DEFAULT_COUNTRIES };
