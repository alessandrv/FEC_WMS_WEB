// Package labels scanned by the barcode readers:
//   new  'ARTICOLO,ANNO,TIPO,NUMERO'    e.g. '0SW948MI,2026,CA,000038' -> movimento '2026/CA/38' (Skyline document)
//   old  'ARTICOLO,FORNITORE,MOVIMENTO' e.g. '0TA100PX,F504358,83005'  -> movimento '83005' (ADAPTA), supplier ignored
// The backend accepts the same formats (normalizza_movimento), this only splits the label for the inputs.

const isDocumento = (anno, tipo, numero) =>
  /^\d{4}$/.test(anno) && /^[A-Za-z]{1,3}$/.test(tipo) && /^\d+$/.test(numero);

export const isEtichetta = (value) => String(value || '').includes(',');

export const parseEtichetta = (value) => {
  const parti = String(value || '').split(',').map((p) => p.trim()).filter(Boolean);
  const articolo = parti[0] || '';

  if (parti.length >= 4 && isDocumento(parti[1], parti[2], parti[3])) {
    return { articolo, movimento: `${parti[1]}/${parti[2].toUpperCase()}/${parseInt(parti[3], 10)}` };
  }
  if (parti.length >= 3) {
    return { articolo, movimento: parti[parti.length - 1] };
  }
  return { articolo, movimento: '' };
};

// Movement key as stored by the backend (normalizza_movimento): 'ANNO/TIPO/NUMERO' or the ADAPTA number
export const normalizzaMovimento = (value) => {
  const codice = String(value || '').trim().toUpperCase();
  if (!codice) return '';
  const documento = codice.match(/(?:^|[,\s])(\d{4})\s*[,/-]\s*([A-Z]{1,3})\s*[,/-]\s*(\d+)\s*$/);
  if (documento) return `${documento[1]}/${documento[2]}/${parseInt(documento[3], 10)}`;
  const parti = codice.split(',').map((p) => p.trim()).filter(Boolean);
  const movimento = parti.length >= 3 ? parti[parti.length - 1] : codice;
  return /^\d+$/.test(movimento) ? String(parseInt(movimento, 10)) : movimento;
};

// Article code from a scanned label or a plain article code
export const articoloDaEtichetta = (value) => parseEtichetta(value).articolo;
