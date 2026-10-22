import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import FiveInputPage from './FiveInputPage';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./map/WarehouseMap', () => () => null);

beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
  }));
});

beforeEach(() => {
  axios.get.mockResolvedValue({ data: { rows: [], total: 0 } });
  axios.post.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('requires exact typed confirmation before resetting inventory', async () => {
  axios.post.mockResolvedValue({ data: { deleted: 12 } });
  render(<FiveInputPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Azzera inventario' }));
  const deleteButton = screen.getByRole('button', { name: 'Elimina tutto l’inventario' });
  expect(deleteButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Conferma azzeramento'), { target: { value: 'Confermo' } });
  expect(deleteButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Conferma azzeramento'), { target: { value: 'confermo' } });
  expect(deleteButton).toBeEnabled();
  fireEvent.click(deleteButton);
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/inventario/reset'), {
    confirmation: 'confermo',
  }));
});

test('loads the final differences summary on demand', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/differenze') ? {
      timestamp: '2026-10-22T12:00:00', rows: [{
        codice_articolo: 'abc', movimento: '880', locazione: 'A-A-01-1',
        quantita_inventario: 3, quantita_wms: 8, differenza: -5, tipo: 'Quantità diversa',
      }],
    } : { rows: [], total: 0 },
  }));
  render(<FiveInputPage />);
  expect(axios.get).not.toHaveBeenCalledWith(expect.stringContaining('/differenze'));
  fireEvent.click(screen.getByRole('button', { name: 'Calcola differenze' }));
  await waitFor(() => expect(screen.getByText('Quantità diversa')).toBeInTheDocument());
  expect(screen.getByText('A-A-01-1')).toBeInTheDocument();
  expect(screen.getByText('-5')).toBeInTheDocument();
});

test('compares Skyline article totals without locations or lots', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/differenze-skyline') ? {
      timestamp: '2026-10-22T12:00:00', magazzino: 'BAS01',
      rows: [{ codice_articolo: 'abc', movimento: '880', quantita_inventario: 3,
        quantita_skyline: 8, differenza: -5 }],
    } : { rows: [], total: 0 },
  }));
  render(<FiveInputPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Confronta Skyline' }));
  await waitFor(() => expect(screen.getByText('Totale Skyline')).toBeInTheDocument());
  expect(screen.queryByText('Movimento / Lotto')).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/differenze-skyline'));
});

test('shows stock for the scanned article, movement and location', async () => {
  axios.get.mockImplementation((url) => Promise.resolve({
    data: url.endsWith('/stock') ? { quantita: 17 } : { rows: [], total: 0 },
  }));
  render(<FiveInputPage />);
  fireEvent.change(screen.getByPlaceholderText('Codice o etichetta'), {
    target: { value: '0AC618MC,2026,CA,063' },
  });
  fireEvent.change(screen.getByPlaceholderText('A-C-01-1'), {
    target: { value: 'A-C-01-1' },
  });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('WMS: 17'));
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/inventario/stock'), {
    params: { codice_articolo: '0AC618MC', movimento: '2026/CA/63', locazione: 'A-C-01-1' },
  });
  fireEvent.change(screen.getByPlaceholderText('A-C-01-1'), { target: { value: '' } });
  expect(screen.getByRole('status')).toHaveTextContent('WMS: —');
});

test.each([
  ['1000228ASXPOSAR10,40,880', '1000228ASXPOSAR10', '880'],
  ['0AC618MC,2026,CA,063', '0AC618MC', '2026/CA/63'],
])('scans %s from the article field and submits on quantity Enter', async (label, article, movement) => {
  render(<FiveInputPage />);
  const articleInput = screen.getByPlaceholderText('Codice o etichetta');
  fireEvent.change(articleInput, { target: { value: label } });
  fireEvent.keyDown(articleInput, { key: 'Enter' });
  expect(articleInput).toHaveValue(article);
  expect(screen.getByPlaceholderText('83754 o 2026/CA/48')).toHaveValue(movement);
  const locationInput = screen.getByPlaceholderText('A-C-01-1');
  expect(locationInput).toHaveFocus();
  fireEvent.change(locationInput, { target: { value: 'A-C-01-1' } });
  fireEvent.keyDown(locationInput, { key: 'Enter' });
  const quantityInput = screen.getByPlaceholderText('Quantità');
  expect(quantityInput).toHaveFocus();
  fireEvent.change(quantityInput, { target: { value: '5' } });
  fireEvent.keyDown(quantityInput, { key: 'Enter' });
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.any(String), {
    codice_articolo: article, movimento: movement, locazione: 'A-C-01-1', quantita: '5',
  }));
  await waitFor(() => expect(articleInput).toHaveValue(''));
  expect(locationInput).toHaveValue('A-C-01-1');
  expect(quantityInput).toHaveValue('');
  expect(screen.getByPlaceholderText('83754 o 2026/CA/48')).toHaveValue('');
});

test.each([
  ['1000228ASXPOSAR10,40,880', '1000228ASXPOSAR10', '880'],
  ['0AC618MC,2026,CA,063', '0AC618MC', '2026/CA/63'],
])('preserves movement when submitting %s without scanner Enter', async (label, article, movement) => {
  render(<FiveInputPage />);
  fireEvent.change(screen.getByPlaceholderText('Codice o etichetta'), { target: { value: label } });
  fireEvent.change(screen.getByPlaceholderText('A-C-01-1'), { target: { value: 'A-C-01-1' } });
  fireEvent.change(screen.getByPlaceholderText('Quantità'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi Riga' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.any(String), {
    codice_articolo: article, movimento: movement, locazione: 'A-C-01-1', quantita: '5',
  }));
});
