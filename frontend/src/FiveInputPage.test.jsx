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
