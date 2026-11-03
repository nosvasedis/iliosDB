// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../types';

const mocks = vi.hoisted(() => ({
  getLegalSettings: vi.fn(), lookupAadeVatRegistry: vi.fn(), lookupAfm: vi.fn(), showToast: vi.fn(), confirm: vi.fn(),
  profileProps: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ api: mocks }));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: mocks.showToast, confirm: mocks.confirm }) }));
// Wrap the real components so the tests can find them and read the profile's props.
vi.mock('../../components/customers/CustomerVatProfileSuggestion', async importOriginal => {
  const original = await importOriginal<typeof import('../../components/customers/CustomerVatProfileSuggestion')>();
  const Suggestion = original.default as React.ComponentType<any>;
  return { ...original, default: (props: any) => { mocks.profileProps(props); return <div data-testid="vat-profile"><Suggestion {...props} /></div>; } };
});
vi.mock('../../components/customers/CustomerVatStatusAlert', async importOriginal => {
  const original = await importOriginal<typeof import('../../components/customers/CustomerVatStatusAlert')>();
  const Alert = original.default as React.ComponentType<any>;
  return { ...original, default: (props: any) => <div data-testid="vat-status-alert"><Alert {...props} /></div> };
});

import CreateCustomerModal from '../../components/CreateCustomerModal';
import MobileCustomerForm from '../../components/mobile/MobileCustomerForm';

afterEach(cleanup);

const profile = () => mocks.profileProps.mock.calls.at(-1)![0];
const profileButtons = () => Array.from(document.body.querySelector('[data-testid="vat-profile"]')!.querySelectorAll('button'));
const pageText = () => document.body.textContent ?? '';

describe.each(['desktop', 'mobile'] as const)('%s new customer AFM → fiscal profile → save', surface => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLegalSettings.mockResolvedValue({ issuer: { vat_number: '094259216' } });
  });

  const openForm = async () => {
    const draft: Customer = { id: '', full_name: '', vat_number: '987654324', vat_rate: 0.24 };
    const save = vi.fn().mockResolvedValue(undefined);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(surface === 'desktop'
        ? <CreateCustomerModal draft={draft} onSave={save} onCancel={vi.fn()} />
        : <MobileCustomerForm customer={draft} onSave={save} onCancel={vi.fn()} />);
    });
    if (surface === 'desktop') {
      fireEvent.click(Array.from(document.body.querySelectorAll('button')).find(b => Array.from(b.querySelectorAll('span')).some(s => s.textContent === 'Φορολογικά'))!);
    }
    return { view, save };
  };
  // The lookup button sits next to the ΑΦΜ input on both surfaces.
  const runLookup = () => act(async () => {
    const afm = document.body.querySelector<HTMLInputElement>('input[placeholder*="9 ψηφία"]')!;
    fireEvent.click(afm.closest('div.gap-2')!.querySelector(':scope > button')!);
  });
  const submit = () => act(async () => { fireEvent.submit(document.body.querySelector('form')!); });

  it.each([
    ['Σάμος', '83100', 0.17], ['Καρυές', '63086', 0], ['Αθήνα', '10563', 0.24],
  ])('saves the correct reviewed profile for %s', async (city, postalCode, rate) => {
    mocks.lookupAadeVatRegistry.mockResolvedValue({
      businessName: 'ΠΕΛΑΤΗΣ ΑΑΔΕ', normalVatRegime: true, active: true,
      address: { street: 'Οδός', number: '1', postalCode, city }, activities: [],
    });
    const { save } = await openForm();
    await runLookup();
    expect(profile().lookup.normalVatRegime).toBe(true);
    expect(profile().customer.vat_rate).toBe(0.24);
    if (rate !== 0.24) {
      expect(profileButtons()).toHaveLength(1);
      fireEvent.click(profileButtons()[0]);
    }
    await submit();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Πελάτης ΑΑΔΕ', vat_rate: rate }));
    if (rate === 0) expect(save.mock.calls[0][0]).toMatchObject({ vat_exemption_category: 1, vat_exemption_legal_note: expect.stringContaining('Π.7395') });
  });

  it('preserves the address-based suggestion when AADE fails and VIES is used', async () => {
    mocks.lookupAadeVatRegistry.mockRejectedValue(new Error('Unavailable'));
    mocks.lookupAfm.mockResolvedValue({ source: 'vies', name: 'VIES CUSTOMER', address: '83100 Σάμος', phone: null, email: null });
    await openForm();
    await runLookup();
    expect(profile().lookup.normalVatRegime).toBeNull();
    expect(profileButtons()).toHaveLength(1);
    expect(pageText()).toContain('δεν επιβεβαιώθηκαν');
  });

  describe('non-active ΑΦΜ', () => {
    const liquidated = {
      businessName: 'ΚΟΣΜΗΜΑΤΑ ΗΛΙΟΣ Ο.Ε. ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ', normalVatRegime: true, active: true, stopDate: '2024-03-12',
      address: { street: 'ΕΡΜΟΥ', number: '12', postalCode: '10563', city: 'ΑΘΗΝΑ' }, activities: [],
    };

    it('asks before applying, keeps the form untouched on «no» and shows the status in the form', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue(liquidated);
      mocks.confirm.mockResolvedValue(false);
      const { save } = await openForm();
      await runLookup();
      expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Προσοχή: ΑΦΜ υπό εκκαθάριση', isDestructive: true }));
      const alert = document.body.querySelector('[data-testid="vat-status-alert"]')!;
      expect(pageText()).toContain('ΑΦΜ υπό εκκαθάριση');
      expect(pageText()).toContain('12/03/2024');
      expect(profile().customer.full_name).toBe('');

      // Apply from the alert after all; the name never carries the status words.
      mocks.confirm.mockResolvedValue(true);
      const applyButtons = alert.querySelectorAll('button');
      expect(applyButtons).toHaveLength(1);
      fireEvent.click(applyButtons[0]);
      expect(profile().customer).toMatchObject({
        full_name: 'Κοσμήματα Ήλιος ΟΕ', address: 'Ερμού 12, 10563 - Αθήνα',
      });
      await submit();
      expect(mocks.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Αποθήκευση με ΑΦΜ υπό εκκαθάριση' }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Κοσμήματα Ήλιος ΟΕ' }));
    });

    it('does not save when the user cancels the non-active warning', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue({ ...liquidated, businessName: 'ΗΛΙΟΣ ΑΕ', active: false, activeDescription: 'ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟΣ ΑΦΜ' });
      mocks.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const { save } = await openForm();
      await runLookup();
      expect(pageText()).toContain('Ανενεργό (απενεργοποιημένο) ΑΦΜ');
      await submit();
      expect(mocks.confirm).toHaveBeenCalledTimes(2);
      expect(save).not.toHaveBeenCalled();
    });

    it('shows no warning and no confirmation for an active ΑΦΜ', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue({ ...liquidated, businessName: 'ΗΛΙΟΣ ΑΕ', stopDate: null });
      const { save } = await openForm();
      await runLookup();
      expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(0);
      await submit();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Ήλιος ΑΕ' }));
    });
  });
});
