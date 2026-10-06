// Recent deposits made from this device, kept only in the browser (localStorage).
// Not a log: it only helps the operator see whether a package was already deposited.
import { normalizzaMovimento } from './barcode';

const STORAGE_KEY = 'wms.depositi.recenti';
const MAX_ENTRIES = 200;

export const readDepositHistory = () => {
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const writeDepositHistory = (entries) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage full or blocked: the history is only a convenience
  }
};

// deposits: [{ articolo, descrizione, movimento, quantita, pacchi, locazione }]
export const addDeposits = (deposits) => {
  const now = new Date().toISOString();
  const entries = deposits.map((deposit, index) => ({
    id: `${now}-${index}`,
    data: now,
    ...deposit,
    movimento: normalizzaMovimento(deposit.movimento),
  }));
  const updated = [...entries, ...readDepositHistory()];
  writeDepositHistory(updated);
  return updated;
};

export const clearDepositHistory = () => {
  writeDepositHistory([]);
  return [];
};

// Earlier deposits of the same article (and movement, when known)
export const findPreviousDeposits = (entries, articolo, movimento) => {
  const art = (articolo || '').trim().toUpperCase();
  const mov = normalizzaMovimento(movimento);
  if (!art) return [];
  return entries.filter((entry) =>
    (entry.articolo || '').toUpperCase() === art &&
    (!mov || normalizzaMovimento(entry.movimento) === mov));
};

export const formatDepositTime = (iso) => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString()
    ? `oggi ${time}`
    : `${date.toLocaleDateString('it-IT')} ${time}`;
};
