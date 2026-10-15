import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { Customer, CustomerVatLookupResult } from '../../types';
import { applyGeographicVat, suggestGeographicVat } from '../../features/customers/vatProfile';
import CustomerVatProfileSuggestion from '../../components/customers/CustomerVatProfileSuggestion';

const customer = (address: string): Customer => ({ id: 'new', full_name: 'Δοκιμή', address, vat_number: '987654324', vat_rate: 0.24 });

describe('fiscal profile geographic suggestions', () => {
  it.each([
    'Ερμού 1, 81100 Μυτιλήνη', 'Ερμού 1, 82100 Χίος', '83100 Σάμος',
    '85300 Κως', '85400 Λέρος', '81400 Μύρινα', '83300 Άγιος Κήρυκος',
    '85200 Κάλυμνος', '85700 Κάρπαθος', '85800 Κάσος', '85500 Πάτμος',
    '85600 Σύμη', '85900 Αστυπάλαια', '68002 Σαμοθράκη', '85002 Λειψοί',
    '85111 Καστελλόριζο', '85110 Χάλκη', 'Οινούσσες', 'Ψαρά', 'Τήλος',
    'Αγαθονήσι', 'Άγιος Ευστράτιος', 'Φούρνοι', 'Νίσυρος',
  ])('suggests 17%% for eligible 2026 address %s', address => {
    expect(suggestGeographicVat(customer(address))?.rate).toBe(0.17);
  });

  it.each([
    '10563 Αθήνα', '85100 Ρόδος', '84700 Θήρα', '84600 Μύκονος',
    '64004 Θάσος', '68100 Αλεξανδρούπολη', '63087 Αμμουλιανή',
    '63075 Ουρανούπολη', 'Καρυές', 'Δάφνη', 'Χίου 17, 10563 Αθήνα', '',
  ])('does not infer reduced VAT or exemption for %s', address => {
    expect(suggestGeographicVat(customer(address))).toBeNull();
  });

  it.each(['63086 Καρυές', 'Ιερά Μονή, Άγιον Όρος', 'Ιερά Μονή, Αγίου Όρους'])('suggests Athos exemption for %s', address => {
    const c = customer(address);
    const suggestion = suggestGeographicVat(c)!;
    expect(suggestion.rate).toBe(0);
    expect(applyGeographicVat(c, suggestion)).toMatchObject({ vat_rate: 0, vat_exemption_category: 1, vat_exemption_legal_note: expect.stringContaining('Π.7395') });
    expect(c.vat_rate).toBe(0.24);
  });

  it('does not apply Greek geography to foreign customers', () => {
    expect(suggestGeographicVat({ ...customer('83100 Σάμος'), country: 'CY' })).toBeNull();
  });

  it('clears old exemption details when applying 17%', () => {
    const c = { ...customer('83100 Σάμος'), vat_rate: 0, vat_exemption_category: 1, vat_exemption_legal_note: 'old' };
    expect(applyGeographicVat(c, suggestGeographicVat(c)!)).toMatchObject({ vat_rate: 0.17, vat_exemption_category: null, vat_exemption_legal_note: null });
  });
});

describe('fiscal profile suggestion UI', () => {
  const lookup: CustomerVatLookupResult = {
    vatNumber: '987654324', source: 'aade_registry', name: 'Δοκιμή', address: '83100 Σάμος',
    active: true, normalVatRegime: false, phone: null, email: null, profession: null, taxOffice: null,
  };

  it('requires an explicit click and passes the actual rate to the customer form', () => {
    const onChange = vi.fn();
    const view = create(<CustomerVatProfileSuggestion customer={customer('83100 Σάμος')} onChange={onChange} lookup={lookup} />);
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).toContain('δεν σημαίνει ότι ο πελάτης αγοράζει χωρίς ΦΠΑ');
    act(() => view.root.findByType('button').props.onClick());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ vat_rate: 0.17 }));
    act(() => view.update(<CustomerVatProfileSuggestion customer={onChange.mock.calls[0][0]} onChange={onChange} lookup={lookup} />));
    expect(JSON.stringify(view.toJSON())).toContain('Εφαρμόζεται στο προφίλ');
    expect(view.root.findAllByType('button')).toHaveLength(0);
  });

  it('disables applying a suggestion for an inactive AFM', () => {
    const view = create(<CustomerVatProfileSuggestion customer={customer('83100 Σάμος')} onChange={vi.fn()} lookup={{ ...lookup, active: false }} />);
    expect(view.root.findByType('button').props.disabled).toBe(true);
  });

  it('hides registry evidence belonging to a different AFM', () => {
    const view = create(<CustomerVatProfileSuggestion customer={{ ...customer('Αθήνα'), vat_number: '094259216' }} onChange={vi.fn()} lookup={lookup} />);
    expect(JSON.stringify(view.toJSON())).not.toContain('ΑΑΔΕ: εκτός');
  });
});
