import { describe, expect, it } from 'vitest';
import {
  cleanRegistryText, detectVatRegistryStatus, formatFreeAddress, formatProfession, formatRegistryAddress,
  formatRegistryDate, formatRegistryName, formatTaxOffice, stripStatusWords,
} from '../../features/customers/vatFormatting';
import { splitGreekAddress } from '../../features/customers/customerLocation';

describe('registry name formatting', () => {
  it.each([
    ['ΚΟΣΜΗΜΑΤΑ  ΗΛΙΟΣ   Ο.Ε.', 'Κοσμήματα Ήλιος ΟΕ'],
    ['ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ ΤΟΥ ΙΩΑΝΝΗ', 'Παπαδόπουλος Γεώργιος του Ιωάννη'],
    ['ΑΦΟΙ Γ. ΠΑΠΑΔΑΚΗ Ο.Ε.', 'Αφοί Γ. Παπαδάκη ΟΕ'],
    ['ΗΛΙΟΣ ΑΝΩΝΥΜΗ ΕΜΠΟΡΙΚΗ ΕΤΑΙΡΕΙΑ', 'Ήλιος Ανώνυμη Εμπορική Εταιρεία'],
    ['ΧΡΥΣΟΣ ΚΑΙ ΣΙΑ Ε.Ε.', 'Χρυσός και Σια ΕΕ'],
    ['GOLD LINE Μ.Ι.Κ.Ε.', 'Gold Line ΜΙΚΕ'],
    ['ΗΛΙΟΣ AE', 'Ήλιος ΑΕ'], // Latin «AE» typed in the registry
    ['ΚΟΣΜΗΜΑΤΑ ΗΛΙΟΣ Ι. Κ. Ε.', 'Κοσμήματα Ήλιος ΙΚΕ'],
  ])('%s → %s', (raw, expected) => {
    expect(formatRegistryName(raw).name).toBe(expected);
  });

  it.each(['ΕΠΕ', 'ΑΕΒΕ', 'ΚΟΙΝΣΕΠ', 'ΜΙΚΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'ΑΕ'])('keeps the legal form %s in capitals', form => {
    expect(formatRegistryName(`ΚΟΣΜΗΜΑΤΑ ΗΛΙΟΣ ${form}`).name).toBe(`Κοσμήματα Ήλιος ${form}`);
  });

  it('collapses dotted legal forms such as «ΚΟΙΝ.Σ.ΕΠ.» and «Α.Ε.Β.Ε.»', () => {
    expect(formatRegistryName('ΗΛΙΟΣ ΚΟΙΝ.Σ.ΕΠ.').name).toBe('Ήλιος ΚΟΙΝΣΕΠ');
    expect(formatRegistryName('ΗΛΙΟΣ Α.Ε.Β.Ε.').name).toBe('Ήλιος ΑΕΒΕ');
  });

  it.each([
    ['ΖΕΡΒΑΣ  ΚΑΙ ΣΙΑ  Ο.Ε.', 'Ζέρβας και Σια ΟΕ'],
    ['ΓΙΑΝΝΑΡΟΣ ΜΙΧΑΗΛ', 'Γιαννάρος Μιχαήλ'],
    ['ΤΣΑΚΙΡΗΣ ΧΡΗΣΤΟΣ ΤΟΥ ΑΘΑΝΑΣΙΟΥ', 'Τσακίρης Χρήστος του Αθανασίου'],
    ['ΣΑΡΑΝΤΙΔΟΥ ΕΛΕΝΗ', 'Σαραντίδου Ελένη'],
    ['ΧΑΤΖΗΓΕΩΡΓΙΟΥ ΑΝΝΑ', 'Χατζηγεωργίου Άννα'],
    ['ΓΕΩΡΓΑΚΟΠΟΥΛΟΣ ΔΙΟΝΥΣΙΟΣ', 'Γεωργακόπουλος Διονύσιος'],
    ['ΜΠΟΥΡΑΣ ΑΝΤΩΝΙΟΣ', 'Μπούρας Αντώνιος'],
    ['ΑΡΓΥΡΟΤΕΧΝΙΚΗ ΜΑΚΕΔΟΝΙΑΣ ΑΕ', 'Αργυροτεχνική Μακεδονίας ΑΕ'],
    ['ΑΛΚΥΟΝΗ ΧΡΥΣΟΧΟΪΑ ΜΟΝΟΠΡΟΣΩΠΗ ΙΚΕ', 'Αλκυόνη Χρυσοχοΐα Μονοπρόσωπη ΙΚΕ'],
    ['BLUE SEA JEWELRY ΜΟΝΟΠΡΟΣΩΠΗ Ε.Π.Ε.', 'Blue Sea Jewelry Μονοπρόσωπη ΕΠΕ'],
  ])('never leaves names in capitals: %s → %s', (raw, expected) => {
    expect(formatRegistryName(raw).name).toBe(expected);
  });

  it('keeps acronyms, initials and ordinals in capitals', () => {
    expect(formatRegistryName('ΚΤΕΟ ΗΛΙΟΣ Γ. ΖΕΡΒΑΣ ΑΕ').name).toBe('ΚΤΕΟ Ήλιος Γ. Ζέρβας ΑΕ');
  });

  it('leaves already well-written names untouched apart from spacing', () => {
    expect(formatRegistryName('Κοσμήματα  Ζέρβας  ΟΕ').name).toBe('Κοσμήματα Ζέρβας ΟΕ');
  });
});

describe('status words are never part of the name', () => {
  it.each([
    ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ', 'Ήλιος ΑΕ', 'liquidation'],
    ['ΗΛΙΟΣ ΑΕ (ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ)', 'Ήλιος ΑΕ', 'liquidation'],
    ['ΗΛΙΟΣ ΑΕ - ΥΠΟ ΕΚΚΑΘ/ΣΗ', 'Ήλιος ΑΕ', 'liquidation'],
    ['ΗΛΙΟΣ ΑΕ ΕΝ ΕΚΚΑΘΑΡΙΣΕΙ', 'Ήλιος ΑΕ', 'liquidation'],
    ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘ.', 'Ήλιος ΑΕ', 'liquidation'],
    ['ΑΦΟΙ Γ. ΠΑΠΑΔΑΚΗ Ο.Ε. (ΣΕ ΠΤΩΧΕΥΣΗ)', 'Αφοί Γ. Παπαδάκη ΟΕ', 'bankruptcy'],
    ['ΗΛΙΟΣ ΟΕ ΔΙΑΚΟΠΗ ΕΡΓΑΣΙΩΝ', 'Ήλιος ΟΕ', 'closed'],
    ['ΗΛΙΟΣ ΟΕ ΑΝΕΝΕΡΓΗ', 'Ήλιος ΟΕ', 'inactive'],
    ['Ήλιος ΑΕ υπό εκκαθάριση', 'Ήλιος ΑΕ', 'liquidation'],
  ])('%s', (raw, name, kind) => {
    const result = formatRegistryName(raw);
    expect(result.name).toBe(name);
    expect(result.statusHits).toContain(kind);
  });

  it('does not treat a company called «ΛΥΣΗ» as dissolved', () => {
    expect(stripStatusWords('ΛΥΣΗ ΑΕ')).toEqual({ text: 'ΛΥΣΗ ΑΕ', hits: [] });
  });
});

describe('registry address formatting', () => {
  it('writes «Οδός 12, ΤΚ - Πόλη» with accents from the gazetteer', () => {
    const address = formatRegistryAddress({ street: ' ΕΡΜΟΥ  ', number: ' 12 ', postalCode: '105 63', city: 'ΑΘΗΝΑ' });
    expect(address).toBe('Ερμού 12, 10563 - Αθήνα');
    expect(splitGreekAddress(address)).toEqual({ postalCode: '10563', place: 'Αθήνα' });
  });

  it('drops a «0» street number and spaces street abbreviations', () => {
    expect(formatRegistryAddress({ street: 'ΛΕΩΦ.ΣΥΓΓΡΟΥ', number: '0', postalCode: '11743', city: 'ΚΑΛΛΙΘΕΑ' }))
      .toBe('Λεωφ. Συγγρού, 11743 - Καλλιθέα');
  });

  it('handles ordinals and letter suffixes in numbers', () => {
    expect(formatRegistryAddress({ street: '25ΗΣ ΜΑΡΤΙΟΥ', number: '12 Α', postalCode: '83100', city: 'ΣΑΜΟΣ' }))
      .toBe('25ης Μαρτίου 12Α, 83100 - Σάμος');
  });

  it('writes unknown street and place names in normal casing too', () => {
    expect(formatRegistryAddress({ street: 'ΞΥΖΩΡΟΥ', number: '3', postalCode: '54622', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' }))
      .toBe('Ξυζώρου 3, 54622 - Θεσσαλονίκη');
    expect(formatRegistryAddress({ street: 'ΑΓ. ΔΗΜΗΤΡΙΟΥ', number: '45', postalCode: '54630', city: 'ΠΥΛΑΙΑ' }))
      .toBe('Αγ. Δημητρίου 45, 54630 - Πυλαία');
  });

  it('formats free-text VIES addresses in the same shape', () => {
    expect(formatFreeAddress('ΕΡΜΟΥ 12\n10563  ΑΘΗΝΑ')).toBe('Ερμού 12, 10563 - Αθήνα');
    expect(formatFreeAddress('ΕΡΜΟΥ 12 10563 - ΑΘΗΝΑ')).toBe('Ερμού 12, 10563 - Αθήνα');
    expect(formatFreeAddress('83100 Σάμος')).toBe('83100 - Σάμος');
  });
});

describe('profession and tax office formatting', () => {
  it('uses sentence case for activities', () => {
    expect(formatProfession('ΧΟΝΔΡΙΚΟ  ΕΜΠΟΡΙΟ ΚΟΣΜΗΜΑΤΩΝ')).toBe('Χονδρικό εμπόριο κοσμημάτων');
    expect(formatProfession('ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΡΟΛΟΓΙΩΝ ΚΑΙ ΚΟΣΜΗΜΑΤΩΝ ΣΕ ΕΞΕΙΔΙΚΕΥΜΕΝΑ ΚΑΤΑΣΤΗΜΑΤΑ'))
      .toBe('Λιανικό εμπόριο ρολογιών και κοσμημάτων σε εξειδικευμένα καταστήματα');
    expect(formatProfession('ΕΠΕΞΕΡΓΑΣΙΑ ΚΑΙ ΔΙΑΘΕΣΗ ΠΟΛΥΤΙΜΩΝ ΛΙΘΩΝ')).toBe('Επεξεργασία και διάθεση πολύτιμων λίθων');
  });

  it('writes tax offices like «Α\' Αθηνών»', () => {
    expect(formatTaxOffice("Α  'ΑΘΗΝΩΝ")).toBe("Α' Αθηνών");
    expect(formatTaxOffice('Δ.Ο.Υ. ΚΑΛΛΙΘΕΑΣ')).toBe('ΔΟΥ Καλλιθέας');
    expect(formatTaxOffice('ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ')).toBe('ΚΕΦΟΔΕ Αττικής');
    expect(formatTaxOffice("ΙΒ' ΑΘΗΝΩΝ")).toBe("ΙΒ' Αθηνών");
  });

  it('cleans irregular whitespace', () => {
    expect(cleanRegistryText('  ΕΡΜΟΥ  12 ,ΑΘΗΝΑ\t')).toBe('ΕΡΜΟΥ 12, ΑΘΗΝΑ');
  });
});

describe('registry status detection', () => {
  it('active AFM with no status words', () => {
    expect(detectVatRegistryStatus({ active: true, activeDescription: 'ΕΝΕΡΓΟΣ ΑΦΜ', businessStatus: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ', names: ['ΗΛΙΟΣ ΑΕ'] }))
      .toMatchObject({ kind: 'active', blocking: false, evidence: [] });
  });

  it('deactivated AFM', () => {
    expect(detectVatRegistryStatus({ active: false, activeDescription: 'ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟΣ ΑΦΜ' }))
      .toMatchObject({ kind: 'inactive', blocking: true, evidence: ['ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟΣ ΑΦΜ'] });
  });

  it('reads «ΑΝΕΝΕΡΓΟΣ» as inactive even without the flag', () => {
    expect(detectVatRegistryStatus({ active: null, activeDescription: 'ΑΝΕΝΕΡΓΟΣ ΑΦΜ' }).kind).toBe('inactive');
  });

  it('cessation of business with the stop date', () => {
    expect(detectVatRegistryStatus({ active: true, businessStatus: 'ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ', stopDate: '2024-03-12' }))
      .toMatchObject({ kind: 'closed', label: 'Διακοπή εργασιών', blocking: true, stopDate: '12/03/2024' });
  });

  it('liquidation from the name while the AFM itself is still active', () => {
    expect(detectVatRegistryStatus({ active: true, names: ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ'] }))
      .toMatchObject({ kind: 'liquidation', label: 'ΑΦΜ υπό εκκαθάριση', blocking: true, evidence: ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ'] });
  });

  it('bankruptcy outranks liquidation, a deactivated AFM outranks both', () => {
    expect(detectVatRegistryStatus({ active: true, names: ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ', 'ΗΛΙΟΣ ΣΕ ΠΤΩΧΕΥΣΗ'] }).kind).toBe('bankruptcy');
    expect(detectVatRegistryStatus({ active: false, names: ['ΗΛΙΟΣ ΑΕ ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ'] }).kind).toBe('inactive');
  });

  it('non-business natural person is a warning, not a block', () => {
    expect(detectVatRegistryStatus({ active: true, businessStatus: 'ΜΗ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ' }))
      .toMatchObject({ kind: 'non_business', blocking: false });
  });

  it('unknown when the registry gives nothing', () => {
    expect(detectVatRegistryStatus({ active: null })).toMatchObject({ kind: 'unknown', blocking: false });
  });

  it.each([['2024-03-12', '12/03/2024'], ['2024-03-12T00:00:00+02:00', '12/03/2024'], ['5/3/2024', '05/03/2024'], ['', null]])(
    'date %s → %s', (raw, expected) => expect(formatRegistryDate(raw)).toBe(expected),
  );
});
