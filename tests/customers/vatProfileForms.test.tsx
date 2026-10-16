import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../types';

const mocks = vi.hoisted(() => ({ getLegalSettings: vi.fn(), lookupAadeVatRegistry: vi.fn(), lookupAfm: vi.fn(), showToast: vi.fn(), confirm: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ api: mocks }));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: mocks.showToast, confirm: mocks.confirm }) }));

import CreateCustomerModal from '../../components/CreateCustomerModal';
import MobileCustomerForm from '../../components/mobile/MobileCustomerForm';
import CustomerVatProfileSuggestion from '../../components/customers/CustomerVatProfileSuggestion';
import CustomerVatStatusAlert from '../../components/customers/CustomerVatStatusAlert';

describe.each(['desktop', 'mobile'] as const)('%s new customer AFM → fiscal profile → save', surface => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLegalSettings.mockResolvedValue({ issuer: { vat_number: '094259216' } });
  });

  const openForm = async () => {
    const draft: Customer = { id: '', full_name: '', vat_number: '987654324', vat_rate: 0.24 };
    const save = vi.fn().mockResolvedValue(undefined);
    let view: ReactTestRenderer;
    await act(async () => {
      view = create(surface === 'desktop'
        ? <CreateCustomerModal draft={draft} onSave={save} onCancel={vi.fn()} />
        : <MobileCustomerForm customer={draft} onSave={save} onCancel={vi.fn()} />);
    });
    if (surface === 'desktop') act(() => {
      view.root.findAllByType('button').find(b => b.findAllByType('span').some(s => s.children.includes('Φορολογικά')))!.props.onClick();
    });
    return { view: view!, save };
  };

  it.each([
    ['Σάμος', '83100', 0.17], ['Καρυές', '63086', 0], ['Αθήνα', '10563', 0.24],
  ])('saves the correct reviewed profile for %s', async (city, postalCode, rate) => {
    mocks.lookupAadeVatRegistry.mockResolvedValue({
      businessName: 'ΠΕΛΑΤΗΣ ΑΑΔΕ', normalVatRegime: true, active: true,
      address: { street: 'Οδός', number: '1', postalCode, city }, activities: [],
    });
    const { view, save } = await openForm();
    await act(async () => {
      await view.root.findAllByType('button').find(b => b.props.onClick?.name === 'handleAfmLookup')!.props.onClick();
    });
    const profile = view.root.findByType(CustomerVatProfileSuggestion);
    expect(profile.props.lookup.normalVatRegime).toBe(true);
    expect(profile.props.customer.vat_rate).toBe(0.24);
    if (rate !== 0.24) act(() => profile.findByType('button').props.onClick());
    await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Πελάτης ΑΑΔΕ', vat_rate: rate }));
    if (rate === 0) expect(save.mock.calls[0][0]).toMatchObject({ vat_exemption_category: 1, vat_exemption_legal_note: expect.stringContaining('Π.7395') });
    act(() => view.unmount());
  });

  it('preserves the address-based suggestion when AADE fails and VIES is used', async () => {
    mocks.lookupAadeVatRegistry.mockRejectedValue(new Error('Unavailable'));
    mocks.lookupAfm.mockResolvedValue({ source: 'vies', name: 'VIES CUSTOMER', address: '83100 Σάμος', phone: null, email: null });
    const { view } = await openForm();
    await act(async () => {
      await view.root.findAllByType('button').find(b => b.props.onClick?.name === 'handleAfmLookup')!.props.onClick();
    });
    const profile = view.root.findByType(CustomerVatProfileSuggestion);
    expect(profile.props.lookup.normalVatRegime).toBeNull();
    expect(profile.findAllByType('button')).toHaveLength(1);
    expect(JSON.stringify(view.toJSON())).toContain('δεν επιβεβαιώθηκαν');
    act(() => view.unmount());
  });

  describe('non-active ΑΦΜ', () => {
    const liquidated = {
      businessName: 'ΚΟΣΜΗΜΑΤΑ ΗΛΙΟΣ Ο.Ε. ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ', normalVatRegime: true, active: true, stopDate: '2024-03-12',
      address: { street: 'ΕΡΜΟΥ', number: '12', postalCode: '10563', city: 'ΑΘΗΝΑ' }, activities: [],
    };
    const runLookup = async (view: ReactTestRenderer) => act(async () => {
      await view.root.findAllByType('button').find(b => b.props.onClick?.name === 'handleAfmLookup')!.props.onClick();
    });
    const submit = async (view: ReactTestRenderer) => act(async () => {
      await view.root.findByType('form').props.onSubmit({ preventDefault() {} });
    });

    it('asks before applying, keeps the form untouched on «no» and shows the status in the form', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue(liquidated);
      mocks.confirm.mockResolvedValue(false);
      const { view, save } = await openForm();
      await runLookup(view);
      expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Προσοχή: ΑΦΜ υπό εκκαθάριση', isDestructive: true }));
      const alert = view.root.findByType(CustomerVatStatusAlert);
      const text = JSON.stringify(view.toJSON());
      expect(text).toContain('ΑΦΜ υπό εκκαθάριση');
      expect(text).toContain('12/03/2024');
      expect(view.root.findByType(CustomerVatProfileSuggestion).props.customer.full_name).toBe('');

      // Apply from the alert after all; the name never carries the status words.
      mocks.confirm.mockResolvedValue(true);
      act(() => alert.findByType('button').props.onClick());
      expect(view.root.findByType(CustomerVatProfileSuggestion).props.customer).toMatchObject({
        full_name: 'Κοσμήματα Ήλιος ΟΕ', address: 'Ερμού 12, 10563 - Αθήνα',
      });
      await submit(view);
      expect(mocks.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Αποθήκευση με ΑΦΜ υπό εκκαθάριση' }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Κοσμήματα Ήλιος ΟΕ' }));
      act(() => view.unmount());
    });

    it('does not save when the user cancels the non-active warning', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue({ ...liquidated, businessName: 'ΗΛΙΟΣ ΑΕ', active: false, activeDescription: 'ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟΣ ΑΦΜ' });
      mocks.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const { view, save } = await openForm();
      await runLookup(view);
      expect(JSON.stringify(view.toJSON())).toContain('Ανενεργό (απενεργοποιημένο) ΑΦΜ');
      await submit(view);
      expect(mocks.confirm).toHaveBeenCalledTimes(2);
      expect(save).not.toHaveBeenCalled();
      act(() => view.unmount());
    });

    it('shows no warning and no confirmation for an active ΑΦΜ', async () => {
      mocks.lookupAadeVatRegistry.mockResolvedValue({ ...liquidated, businessName: 'ΗΛΙΟΣ ΑΕ', stopDate: null });
      const { view, save } = await openForm();
      await runLookup(view);
      expect(view.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
      await submit(view);
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Ήλιος ΑΕ' }));
      act(() => view.unmount());
    });
  });
});
