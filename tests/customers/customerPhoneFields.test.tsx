// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomerPhoneFields from '../../components/customers/CustomerPhoneFields';

afterEach(cleanup);

describe('customer mobile / landline split', () => {
  it('edits two independent fields and keeps the compatibility phone current', () => {
    const change = vi.fn();
    const view = render(<CustomerPhoneFields customer={{ id: 'c', full_name: 'Test', phone: '2101234567', created_at: '' }} onChange={change} />);
    const inputs = view.container.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: '6912345678' } });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ mobile_phone: '6912345678', landline_phone: '2101234567', phone: '6912345678 / 2101234567' }));
  });
});
